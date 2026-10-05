import type { LipSequence } from '../types';
import { FEATURE_DIMS } from './lip-features';
import { tracker } from './face-tracker';

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

const QUIET_MS = 650;
const MIN_FRAMES = 8;
const MOTION_THRESHOLD = 0.012;

export function captureSequence(opts: CaptureOptions): Capture {
  let stop = () => {};
  let cancel = () => {};
  const result = new Promise<LipSequence>((resolve, reject) => {
    const frames: Float32Array[] = [];
    const start = performance.now();
    let lastActive = start;
    let spoke = false;
    let prevOpen = 0;
    let motion = 0;
    let done = false;

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
        // Se mide movimiento, no apertura: hay pacientes que descansan con la boca entreabierta.
        motion = motion * 0.5 + Math.abs(f.openness - prevOpen) * 0.5;
        if (frames.length > 1 && motion > MOTION_THRESHOLD) {
          lastActive = f.t;
          if (elapsed > 200) spoke = true;
        }
        prevOpen = f.openness;
      }
      opts.onProgress?.(elapsed, f.openness, !!f.features);
      if (opts.autoStop && spoke && f.t - lastActive > (opts.quietMs ?? QUIET_MS) && elapsed > 900) finish();
      else if (elapsed >= opts.maxMs) finish();
    });
  });
  return { result, stop: () => stop(), cancel: () => cancel() };
}
