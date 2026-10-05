import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { extractFeatures, FEATURE_DIMS, mouthOpenness } from './lip-features';
import { rawFrame } from './raw-store';

export interface FrameFeatures {
  /** Milisegundos desde el inicio del video. */
  t: number;
  features: Float32Array;
  /** Posiciones crudas medidas por la cámara; es lo que se guarda en la nube. */
  raw: Int16Array;
  openness: number;
}

export interface VideoResult {
  /** `labios`: el video solo muestra la boca y se leyó pegándolo sobre una cara de plantilla. */
  mode: 'cara' | 'labios';
  frames: FrameFeatures[];
  durationMs: number;
  fps: number;
  /** Cuadros revisados, para saber qué parte del video tenía cara. */
  scanned: number;
}

const MAX_DURATION_S = 150;
const asset = (p: string) => new URL(p, document.baseURI).href;

const VIDEO_FPS = 25;
/** Cuadros sin cara al inicio tras los cuales se pasa al modo de solo labios. */
const PROBE_FRAMES = 20;

// Cara de plantilla (foto de dominio público de la NASA, nunca se muestra). Medidas de su boca en píxeles.
const TPL = { w: 627, h: 675, cx: 308.5, cy: 406, mouthW: 128.6 };
const PASTE_SCALE = 1.3;

interface Composer {
  canvas: HTMLCanvasElement;
  aspect: number;
  draw: (video: HTMLVideoElement) => HTMLCanvasElement;
}

/** Pega cada cuadro de labios sobre la boca de la plantilla para que el detector de caras pueda seguirlos. */
async function createComposer(): Promise<Composer> {
  const img = new Image();
  img.src = asset('models/template-face.jpg');
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = TPL.w;
  canvas.height = TPL.h;
  const g = canvas.getContext('2d')!;
  const tmp = document.createElement('canvas');
  const tg = tmp.getContext('2d')!;
  return {
    canvas,
    aspect: TPL.w / TPL.h,
    draw(video) {
      g.drawImage(img, 0, 0);
      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;
      const bw = Math.round(TPL.mouthW * PASTE_SCALE);
      const bh = Math.round(Math.min((bw * vh) / vw, bw * 1.1));
      tmp.width = bw;
      tmp.height = bh;
      const s = Math.max(bw / vw, bh / vh);
      tg.globalCompositeOperation = 'source-over';
      tg.drawImage(video, (bw - vw * s) / 2, (bh - vh * s) / 2, vw * s, vh * s);
      tg.globalCompositeOperation = 'destination-in';
      tg.save();
      tg.translate(bw / 2, bh / 2);
      tg.scale(1, bh / bw);
      const fade = tg.createRadialGradient(0, 0, bw * 0.4, 0, 0, bw * 0.5);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      tg.fillStyle = fade;
      tg.fillRect(-bw, -bw, bw * 2, bw * 2);
      tg.restore();
      g.drawImage(tmp, TPL.cx - bw / 2, TPL.cy - bh / 2);
      return canvas;
    },
  };
}

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(asset('mediapipe'));
  const make = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/face_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      // Más permisivo que en vivo: los videos recortados (nariz y barbilla) solo se detectan así.
      minFaceDetectionConfidence: 0.1,
      minFacePresenceConfidence: 0.1,
      minTrackingConfidence: 0.1,
    });
  try {
    return await make('GPU');
  } catch {
    return await make('CPU');
  }
}

function loadVideo(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error('El navegador no pudo abrir este video. Prueba con un .mp4 normal.'));
    };
    const timer = setTimeout(fail, 20000);
    video.onerror = () => {
      clearTimeout(timer);
      fail();
    };
    video.onloadeddata = () => {
      clearTimeout(timer);
      resolve({ video, url });
    };
    video.src = url;
  });
}

/** Lee los labios del video cuadro por cuadro con los mismos rasgos que usa la cámara en vivo. */
export async function processVideoFile(file: File, onProgress?: (pct: number) => void): Promise<VideoResult> {
  const { video, url } = await loadVideo(file);
  let landmarker: FaceLandmarker | null = null;
  try {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('No se pudo leer la duración del video.');
    if (duration > MAX_DURATION_S) throw new Error('El video es muy largo. Usa uno de máximo 2 minutos.');

    landmarker = await createLandmarker();
    const lm = landmarker;
    const faceAspect = video.videoWidth / (video.videoHeight || 1);
    let frames: FrameFeatures[] = [];
    let mode: 'cara' | 'labios' = 'cara';
    let composer: Composer | null = null;
    let scanned = 0;
    let lastTs = -1;
    let lastMedia = -1;
    let spent = 0;
    let rate = 1;
    let switching = false;

    // La primera lectura del modelo es lenta: se calienta antes de reproducir y se mide cuánto tarda por cuadro.
    const warmUp = (): number => {
      let ms = 0;
      for (let i = 0; i < 2; i++) {
        const t0 = performance.now();
        try {
          lm.detectForVideo(composer ? composer.draw(video) : video, ++lastTs);
        } catch {
          // Si falla aquí, fallará igual durante el video y se contará como cuadro sin cara.
        }
        ms = performance.now() - t0;
      }
      return ms;
    };
    const rateFor = (ms: number) => Math.min(1, Math.max(0.1, (0.8 * (1000 / VIDEO_FPS)) / Math.max(ms, 1)));

    await new Promise<void>((resolve) => {
      let finished = false;
      let stallTimer = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(stallTimer);
        resolve();
      };
      const armStall = () => {
        clearTimeout(stallTimer);
        stallTimer = window.setTimeout(finish, 15000);
      };

      const switchToLips = async () => {
        switching = true;
        video.pause();
        try {
          composer = await createComposer();
          mode = 'labios';
          frames = [];
          scanned = 0;
          lastMedia = -1;
          video.currentTime = 0;
          await new Promise((r) => setTimeout(r, 150));
          rate = rateFor(warmUp());
          video.playbackRate = rate;
          switching = false;
          armStall();
          await video.play();
        } catch {
          finish();
        }
      };

      const onFrame = (mediaTime: number) => {
        if (switching) return;
        armStall();
        if (mediaTime === lastMedia) return;
        lastMedia = mediaTime;
        const ts = Math.max(Math.round(mediaTime * 1000), lastTs + 1);
        lastTs = ts;
        scanned++;
        const t0 = performance.now();
        try {
          const source = composer ? composer.draw(video) : video;
          const aspect = composer ? composer.aspect : faceAspect;
          const r = lm.detectForVideo(source, ts);
          const face = r.faceLandmarks[0];
          if (face) {
            frames.push({
              t: mediaTime * 1000,
              features: extractFeatures(face, r.faceBlendshapes[0]?.categories, aspect, new Float32Array(FEATURE_DIMS)),
              raw: rawFrame(face, r.faceBlendshapes[0]?.categories, aspect),
              openness: mouthOpenness(face, aspect),
            });
          }
        } catch {
          // Un cuadro dañado no debe detener el video.
        }
        if (mode === 'cara' && frames.length === 0 && scanned >= PROBE_FRAMES) {
          void switchToLips();
          return;
        }
        spent += performance.now() - t0;
        if (scanned % 5 === 0) {
          rate = (rate + rateFor(spent / 5)) / 2;
          spent = 0;
          video.playbackRate = rate;
          onProgress?.(Math.min(99, Math.round((mediaTime / duration) * 100)));
        }
      };

      const tick = () => {
        if (finished) return;
        if ('requestVideoFrameCallback' in video) {
          video.requestVideoFrameCallback((_now, meta) => {
            onFrame(meta.mediaTime);
            tick();
          });
        } else {
          const el = video as HTMLVideoElement;
          requestAnimationFrame(() => {
            if (el.readyState >= 2) onFrame(el.currentTime);
            tick();
          });
        }
      };

      video.onended = finish;
      armStall();
      tick();
      video.currentTime = 0;
      rate = rateFor(warmUp());
      video.playbackRate = rate;
      video.play().catch(() => finish());
    });

    onProgress?.(100);
    return { mode, frames, durationMs: duration * 1000, fps: frames.length / duration, scanned };
  } finally {
    landmarker?.close();
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
