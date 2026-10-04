import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { extractFeatures, FEATURE_DIMS, mouthOpenness } from './lip-features';

export interface FrameFeatures {
  /** Milisegundos desde el inicio del video. */
  t: number;
  features: Float32Array;
  openness: number;
}

export interface VideoResult {
  frames: FrameFeatures[];
  durationMs: number;
  fps: number;
  /** Cuadros revisados, para saber qué parte del video tenía cara. */
  scanned: number;
}

const STEP_S = 1 / 20;
const MAX_DURATION_S = 150;
const asset = (p: string) => new URL(p, document.baseURI).href;

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(asset('mediapipe'));
  const make = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset('models/face_landmarker.task'), delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  try {
    return await make('GPU');
  } catch {
    return await make('CPU');
  }
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    const timer = setTimeout(done, 2500);
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
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
    const aspect = video.videoWidth / (video.videoHeight || 1);
    const frames: FrameFeatures[] = [];
    let scanned = 0;
    let lastTs = -1;

    for (let t = 0; t < duration; t += STEP_S) {
      if (t > 0) await seek(video, Math.min(t, duration - 0.001));
      const ts = Math.max(Math.round(t * 1000), lastTs + 1);
      lastTs = ts;
      scanned++;
      try {
        const r = landmarker.detectForVideo(video, ts);
        const face = r.faceLandmarks[0];
        if (face) {
          frames.push({
            t: t * 1000,
            features: extractFeatures(face, r.faceBlendshapes[0]?.categories, aspect, new Float32Array(FEATURE_DIMS)),
            openness: mouthOpenness(face, aspect),
          });
        }
      } catch {
        // Un cuadro dañado no debe detener el video.
      }
      if (scanned % 5 === 0) {
        onProgress?.(Math.min(99, Math.round((t / duration) * 100)));
        await new Promise((r) => setTimeout(r));
      }
    }
    onProgress?.(100);
    return { frames, durationMs: duration * 1000, fps: 1 / STEP_S, scanned };
  } finally {
    landmarker?.close();
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
