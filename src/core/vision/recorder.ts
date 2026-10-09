import type { LipSequence } from '../types';
import { FEATURE_DIMS } from './lip-features';
import { tracker } from './face-tracker';
import { LipMotion } from './speech-detect';

export interface CaptureOptions {
  maxMs: number;
  /** Cuánto silencio de labios termina la toma (más largo si se dicen varias palabras). */
  quietMs?: number;
  /** Termina sola cuando la boca deja de moverse después de haber hablado. */
  autoStop?: boolean;
  onProgress?: (elapsed: number, openness: number, faceVisible: boolean) => void;
}

export interface Capture {
  result: Promise<LipSequence>;
  /** Termina y conserva lo grabado. */
  stop: () => void;
  /** Termina y descarta. */
  cancel: () => void;
}

export class CaptureError extends Error {
  constructor(public code: 'sin-rostro' | 'cancelado') {
    super(code);
  }
}

/** Silencio de labios que termina la toma; el detector ya tarda unos 0.4 s en notar que se detuvieron. */
const QUIET_MS = 450;
const MIN_FRAMES = 8;

export function captureSequence(opts: CaptureOptions): Capture {
  let stop = () => {};
  let cancel = () => {};
  const result = new Promise<LipSequence>((resolve, reject) => {
    const frames: Float32Array[] = [];
    const start = performance.now();
    let lastActive = start;
    let spoke = false;
    let done = false;
    // ¿Se mueven los labios? Se mide contra el ruido de la propia toma, no con un número fijo: sirve igual con movimientos
    // grandes, chicos o redondos, y el temblor de la cámara no cuenta como habla.
    const motion = new LipMotion(FEATURE_DIMS);

    const finish = (err?: CaptureError) => {
      if (done) return;
      done = true;
      off();
      if (err) return reject(err);
      if (frames.length < MIN_FRAMES) return reject(new CaptureError('sin-rostro'));
      const elapsed = (performance.now() - start) / 1000;
      const flat = new Float32Array(frames.length * FEATURE_DIMS);
      frames.forEach((f, i) => flat.set(f, i * FEATURE_DIMS));
      resolve({ dims: FEATURE_DIMS, frames: flat, fps: frames.length / Math.max(elapsed, 0.1) });
    };

    stop = () => finish();
    cancel = () => finish(new CaptureError('cancelado'));

    const off = tracker.onFrame((f) => {
      const elapsed = f.t - start;
      if (f.features) {
        frames.push(f.features.slice());
        if (motion.push(f.features).moving) {
          lastActive = f.t;
          if (elapsed > 200) spoke = true;
        }
      } else {
        // Una cara que se pierde y vuelve no debe contar el salto como movimiento.
        motion.reset();
      }
      opts.onProgress?.(elapsed, f.openness, !!f.features);
      if (opts.autoStop && spoke && f.t - lastActive > (opts.quietMs ?? QUIET_MS) && elapsed > 900) finish();
      else if (elapsed >= opts.maxMs) finish();
    });
  });
  return { result, stop: () => stop(), cancel: () => cancel() };
}
