import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { state, updateSettings } from '../../app/state';
import { listCameras, tracker, type TrackerStatus, type TrackFrame } from '../../core/vision/face-tracker';
import { LIP_INNER, LIP_OUTER, MOUTH_AROUND } from '../../core/vision/lip-features';
import { icon } from '../icons';
import { reducedMotion } from '../dom';
import { OneEuro } from './one-euro';

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
/** Margen para que el aviso «Acércate» no parpadee cuando la cara está justo en el borde. */
const FAR_MARGIN = 0.1;

/** Puntos que se dibujan: se suavizan para que la raya no tiemble (el sistema mide con los originales). */
const DRAWN = [...LIP_OUTER, ...LIP_INNER, ...MOUTH_AROUND];
const SLOT = new Map(DRAWN.map((id, k) => [id, k]));

/** Verde fosforescente de la raya y su centro casi blanco. */
const NEON = '#3df2a0';
const NEON_CORE = '#eafff6';

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
    <button class="stage__tech" type="button" hidden aria-pressed="false" title="Mostrar u ocultar los puntos que mide el sistema">${icon('cpu', 18)}<span>Puntos</span></button>
  `;
  const video = el.querySelector('video')!;
  const canvas = el.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const pill = el.querySelector<HTMLElement>('.stage__pill')!;
  const pillText = el.querySelector<HTMLElement>('.stage__pill-text')!;
  const startBtn = el.querySelector<HTMLButtonElement>('.stage__start')!;
  const altBtn = el.querySelector<HTMLButtonElement>('.stage__alt')!;
  const switchBtn = el.querySelector<HTMLButtonElement>('.stage__switch')!;
  const techBtn = el.querySelector<HTMLButtonElement>('.stage__tech')!;
  const title = el.querySelector<HTMLElement>('.stage__ph-title')!;
  const sub = el.querySelector<HTMLElement>('.stage__ph-sub')!;

  let face: FaceState = 'sin-camara';
  let status: TrackerStatus = 'apagado';
  let level = 0;
  // La raya neón y los puntos que mide el sistema se ven para todos; los puntos se pueden apagar con el botón.
  let showPoints = true;
  try {
    showPoints = localStorage.getItem('voz-propia:ver-puntos') !== '0';
  } catch {
    /* sin almacenamiento: se queda encendido */
  }
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
    // La raya es suave: con más de 1.5 píxeles por punto solo se gasta la tarjeta gráfica sin que se note.
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
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

  /** Un punto de la malla ya suavizado y en pantalla (coordenadas del canvas). */
  const sm = new Float32Array(DRAWN.length * 2);
  const fx = DRAWN.map(() => new OneEuro());
  const fy = DRAWN.map(() => new OneEuro());
  const at = (i: number): readonly [number, number] => {
    const k = SLOT.get(i)! * 2;
    return [sm[k], sm[k + 1]];
  };
  const resetSmoothing = () => {
    for (const f of fx) f.reset();
    for (const f of fy) f.reset();
  };

  /**
   * Raya fosforescente que rodea los labios. Es solo dibujo: se hace después de medir y no toca el sistema.
   * El brillo son trazos apilados (sin sombras difuminadas, que son muy caras de dibujar en cada cuadro).
   */
  const neonLine = () => {
    const pts = LIP_OUTER.map(at);
    let cx = 0;
    let cy = 0;
    for (const [x, y] of pts) {
      cx += x;
      cy += y;
    }
    cx /= pts.length;
    cy /= pts.length;
    // Un poco más grande que la boca, para que flote alrededor y no la tape.
    const o = pts.map(([x, y]) => [cx + (x - cx) * 1.1, cy + (y - cy) * 1.18] as const);
    const n = o.length;
    const mid = (a: readonly [number, number], b: readonly [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    const path = new Path2D();
    const start = mid(o[n - 1], o[0]);
    path.moveTo(start[0], start[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(o[i], o[(i + 1) % n]);
      path.quadraticCurveTo(o[i][0], o[i][1], m[0], m[1]);
    }
    path.closePath();
    const pulse = reducedMotion() ? 0 : Math.min(1, level * 1.6);
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (const [width, alpha, color] of [
      [20 + pulse * 8, 0.05, NEON],
      [14 + pulse * 6, 0.08, NEON],
      [9 + pulse * 4, 0.14, NEON],
      [5.5, 0.4, NEON],
      [3, 0.75, NEON],
      [1.5, 1, NEON_CORE],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.stroke(path);
    }
    ctx.restore();
  };

  /** Los puntos que mide el sistema, con el mismo color de la raya (un solo trazo por grupo). */
  const drawPoints = () => {
    ctx.save();
    ctx.fillStyle = NEON_CORE;
    ctx.beginPath();
    for (const i of [...LIP_OUTER, ...LIP_INNER]) {
      const [x, y] = at(i);
      ctx.moveTo(x + 2.1, y);
      ctx.arc(x, y, 2.1, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = glow;
    ctx.beginPath();
    for (const i of MOUTH_AROUND) {
      const [x, y] = at(i);
      ctx.moveTo(x + 1.6, y);
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    }
    ctx.fill();
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
      resetSmoothing();
      return;
    }
    missSince = 0;
    const map = mapper();
    const [lx, ly] = map(lm[33]);
    const [rx, ry] = map(lm[263]);
    const eyes = Math.hypot(rx - lx, ry - ly) / W;
    // Con un margen a cada lado: justo en el borde el aviso no parpadea entre «Acércate» y «Boca a la vista».
    setFace(eyes < FAR * (face === 'lejos' ? 1 + FAR_MARGIN : 1 - FAR_MARGIN) ? 'lejos' : 'listo');

    for (let k = 0; k < DRAWN.length; k++) {
      const [x, y] = map(lm[DRAWN[k]]);
      sm[2 * k] = fx[k].filter(x, f.t);
      sm[2 * k + 1] = fy[k].filter(y, f.t);
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const i of LIP_OUTER) {
      const [x, y] = at(i);
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

    neonLine();
    if (showPoints) drawPoints();
  };

  const start = () => tracker.start(video, state.settings.cameraId);

  const syncTech = () => {
    techBtn.hidden = status !== 'listo';
    techBtn.setAttribute('aria-pressed', String(showPoints));
  };
  techBtn.addEventListener('click', () => {
    showPoints = !showPoints;
    try {
      localStorage.setItem('voz-propia:ver-puntos', showPoints ? '1' : '0');
    } catch {
      /* se queda solo en esta sesión */
    }
    syncTech();
  });

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
    syncTech();
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
