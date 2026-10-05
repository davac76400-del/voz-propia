import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { state, updateSettings } from '../../app/state';
import { listCameras, tracker, type TrackerStatus, type TrackFrame } from '../../core/vision/face-tracker';
import { LIP_INNER, LIP_OUTER, MOUTH_AROUND } from '../../core/vision/lip-features';
import { icon } from '../icons';

export type FaceState = 'sin-camara' | 'buscando' | 'lejos' | 'listo';

export interface Stage {
  el: HTMLElement;
  start: () => Promise<void>;
  stop: () => void;
  destroy: () => void;
  get face(): FaceState;
  /** Nivel de actividad de la boca 0..1, suavizado. */
  get level(): number;
  setRecording: (on: boolean) => void;
}

const MSG: Record<FaceState, string> = {
  'sin-camara': 'Cámara apagada',
  buscando: 'Buscando tu cara',
  lejos: 'Acércate un poco',
  listo: 'Boca a la vista',
};

/** Distancia entre ojos (fracción del ancho visible) por debajo de la cual la cara está muy lejos. */
const FAR = 0.07;

interface Copy {
  title: string;
  sub: string;
  cta: string;
  alt?: string;
}

const COPY: Partial<Record<TrackerStatus, Copy>> = {
  apagado: {
    title: 'Tu cámara se queda contigo',
    sub: 'Ningún video se guarda ni se envía. Solo se mide la forma de los labios.',
    cta: 'Encender cámara',
  },
  cargando: {
    title: 'Abriendo la cámara',
    sub: 'Si el navegador pregunta, elige «Permitir».',
    cta: 'Preparando lector…',
  },
  'sin-permiso': {
    title: 'Falta el permiso de la cámara',
    sub: 'En computadora: toca el candado junto a la dirección y permite la cámara. En el teléfono: Ajustes del navegador › Cámara.',
    cta: 'Intentar de nuevo',
  },
  bloqueada: {
    title: 'Esta vista previa no puede usar la cámara',
    sub: 'La página que la muestra no da permiso. Ábrela en su propia pestaña o desde la app instalada.',
    cta: 'Abrir en pestaña nueva',
    alt: 'Intentar aquí',
  },
  'sin-camara': {
    title: 'No encontré una cámara',
    sub: 'Conecta una cámara web o abre Voz Propia en tu teléfono.',
    cta: 'Buscar de nuevo',
  },
  ocupada: {
    title: 'La cámara está ocupada',
    sub: 'Cierra otras apps que la estén usando (Zoom, Teams, Meet o la app Cámara) y vuelve a intentar.',
    cta: 'Intentar de nuevo',
  },
  error: {
    title: 'No pude abrir la cámara',
    sub: 'Recarga la página e intenta otra vez.',
    cta: 'Intentar de nuevo',
  },
};

export function createStage(onFace?: (s: FaceState) => void): Stage {
  const el = document.createElement('div');
  el.className = 'stage';
  el.innerHTML = `
    <div class="stage__mirror">
      <video class="stage__video" playsinline muted></video>
      <canvas class="stage__canvas"></canvas>
    </div>
    <div class="stage__placeholder">
      <div class="stage__face-art" aria-hidden="true">
        <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="fa-ring"/><ellipse cx="60" cy="58" rx="34" ry="42" class="fa-head"/><circle cx="47" cy="50" r="3.5" class="fa-eye"/><circle cx="73" cy="50" r="3.5" class="fa-eye"/><path d="M45 76 Q60 86 75 76 Q60 80 45 76 Z" class="fa-mouth"/></svg>
      </div>
      <p class="stage__ph-title"></p>
      <p class="stage__ph-sub"></p>
      <div class="stage__actions">
        <button class="btn btn--primary stage__start" type="button">${icon('camera', 20)}<span></span></button>
        <button class="btn btn--soft stage__alt" type="button" hidden></button>
      </div>
    </div>
    <div class="stage__pill" data-state="sin-camara"><span class="dot"></span><span class="stage__pill-text">${MSG['sin-camara']}</span></div>
    <div class="stage__rec" aria-hidden="true"><span></span>Leyendo labios</div>
    <button class="stage__switch" type="button" hidden aria-label="Cambiar de cámara">${icon('switch-camera', 20)}</button>
  `;
  const video = el.querySelector('video')!;
  const canvas = el.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const pill = el.querySelector<HTMLElement>('.stage__pill')!;
  const pillText = el.querySelector<HTMLElement>('.stage__pill-text')!;
  const startBtn = el.querySelector<HTMLButtonElement>('.stage__start')!;
  const altBtn = el.querySelector<HTMLButtonElement>('.stage__alt')!;
  const switchBtn = el.querySelector<HTMLButtonElement>('.stage__switch')!;
  const title = el.querySelector<HTMLElement>('.stage__ph-title')!;
  const sub = el.querySelector<HTMLElement>('.stage__ph-sub')!;

  let face: FaceState = 'sin-camara';
  let status: TrackerStatus = 'apagado';
  let level = 0;
  let box = { x: 0, y: 0, w: 0, h: 0, ok: false };
  let missSince = 0;
  let accent = '#7aa2ff';
  let glow = 'rgba(190, 210, 255, .95)';
  let fill = 'rgba(122, 162, 255, .2)';

  const setFace = (s: FaceState) => {
    if (s === face) return;
    face = s;
    pill.dataset.state = s;
    pillText.textContent = MSG[s];
    onFace?.(s);
  };

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(el);
    accent = css.getPropertyValue('--stage-accent').trim() || accent;
    glow = css.getPropertyValue('--stage-glow').trim() || glow;
    fill = css.getPropertyValue('--stage-fill').trim() || fill;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // Mapea coordenadas normalizadas del video a la caja visible (object-fit: cover).
  const mapper = () => {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const s = Math.max(W / vw, H / vh);
    const ox = (W - vw * s) / 2;
    const oy = (H - vh * s) / 2;
    return (p: NormalizedLandmark) => [p.x * vw * s + ox, p.y * vh * s + oy] as const;
  };

  const path = (lm: NormalizedLandmark[], idx: number[], map: ReturnType<typeof mapper>) => {
    ctx.beginPath();
    idx.forEach((i, k) => {
      const [x, y] = map(lm[i]);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.closePath();
  };

  const draw = (f: TrackFrame) => {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    ctx.clearRect(0, 0, W, H);
    const lm = f.landmarks;
    level += ((lm ? f.openness : 0) - level) * 0.35;
    if (!lm) {
      if (!missSince) missSince = f.t;
      if (f.t - missSince > 400) setFace('buscando');
      box.ok = false;
      return;
    }
    missSince = 0;
    const map = mapper();
    const [lx, ly] = map(lm[33]);
    const [rx, ry] = map(lm[263]);
    setFace(Math.hypot(rx - lx, ry - ly) / W < FAR ? 'lejos' : 'listo');

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of LIP_OUTER) {
      const [x, y] = map(lm[i]);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const padX = (maxX - minX) * 0.45;
    const padY = (maxY - minY) * 0.9 + 10;
    const target = { x: minX - padX, y: minY - padY, w: maxX - minX + padX * 2, h: maxY - minY + padY * 2 };
    const k = box.ok ? 0.3 : 1;
    box = {
      x: box.x + (target.x - box.x) * k,
      y: box.y + (target.y - box.y) * k,
      w: box.w + (target.w - box.w) * k,
      h: box.h + (target.h - box.h) * k,
      ok: true,
    };

    ctx.save();
    ctx.lineJoin = 'round';
    path(lm, LIP_OUTER, map);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    path(lm, LIP_INNER, map);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = glow;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    for (const i of [...LIP_OUTER, ...LIP_INNER]) {
      const [x, y] = map(lm[i]);
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = glow;
    for (const i of MOUTH_AROUND) {
      const [x, y] = map(lm[i]);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Retícula de enfoque con esquinas, sigue la boca con suavizado.
    const { x, y, w, h } = box;
    const c = Math.min(18, w * 0.18);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
    ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
    ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
    ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
    ctx.stroke();
    ctx.restore();
  };

  const start = () => tracker.start(video, state.settings.cameraId);

  const refreshSwitch = async () => {
    switchBtn.hidden = status !== 'listo' || (await listCameras()).length < 2;
  };

  const renderStatus = (s: TrackerStatus, detail?: string) => {
    status = s;
    el.dataset.status = s;
    const copy = COPY[s];
    if (copy) {
      title.textContent = copy.title;
      sub.textContent = s === 'error' && detail ? detail : copy.sub;
      startBtn.querySelector('span')!.textContent = copy.cta;
      startBtn.disabled = s === 'cargando';
      altBtn.hidden = !copy.alt;
      altBtn.textContent = copy.alt ?? '';
    }
    if (s !== 'listo') setFace('sin-camara');
    else setFace('buscando');
    void refreshSwitch();
  };

  const offFrame = tracker.onFrame(draw);
  const offStatus = tracker.onStatus(renderStatus);

  startBtn.addEventListener('click', () => {
    if (status === 'bloqueada') {
      window.open(location.href, '_blank', 'noopener');
      return;
    }
    void start();
  });
  altBtn.addEventListener('click', () => void start());
  switchBtn.addEventListener('click', async () => {
    const cams = await listCameras();
    if (cams.length < 2) return;
    const i = cams.findIndex((c) => c.deviceId === tracker.deviceId);
    const next = cams[(i + 1) % cams.length];
    await updateSettings({ cameraId: next.deviceId });
    await tracker.start(video, next.deviceId);
  });

  return {
    el,
    start,
    stop: () => tracker.stop(),
    destroy: () => {
      offFrame();
      offStatus();
      ro.disconnect();
      tracker.stop();
    },
    get face() {
      return face;
    },
    get level() {
      return level;
    },
    setRecording: (on) => el.classList.toggle('is-recording', on),
  };
}
