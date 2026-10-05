import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { LipSequence } from '../types';
import { extractFeatures, FEATURE_DIMS, LIP_INNER, LIP_OUTER, MOUTH_AROUND, MOUTH_BLENDSHAPES } from './lip-features';

/**
 * Lo que se guarda en la nube son las posiciones CRUDAS que midió la cámara, no los rasgos derivados.
 * Así, si algún día cambia cómo se calculan los rasgos, todo lo grabado se recalcula solo y nada se pierde.
 */

// Puntos de reserva (mandíbula, mejillas, puente de la nariz) para poder mejorar el cálculo sin volver a grabar.
const SPARE = [
  10, 168, 6, 197, 195, 5, 4, 1, 19, 94, 50, 280, 101, 330, 118, 347, 117, 346, 123, 352, 172, 397, 58, 288, 132, 361, 93, 323, 234, 454,
];
const EYES = [33, 263];

export const RAW_POINTS = [...new Set([...LIP_OUTER, ...LIP_INNER, ...MOUTH_AROUND, ...EYES, ...SPARE])];
export const RAW_DIMS = 1 + RAW_POINTS.length * 2 + MOUTH_BLENDSHAPES.length;

const POS = 30000;
const BLEND = 10000;

/** Un cuadro en bruto: [aspecto×1000, x0, y0, x1, y1, …, mezclas de la boca…] como enteros de 16 bits. */
export function rawFrame(
  lm: NormalizedLandmark[],
  blend: { categoryName: string; score: number }[] | undefined,
  aspect: number,
): Int16Array {
  const out = new Int16Array(RAW_DIMS);
  let k = 0;
  out[k++] = Math.round(aspect * 1000);
  for (const i of RAW_POINTS) {
    out[k++] = Math.round(lm[i].x * POS);
    out[k++] = Math.round(lm[i].y * POS);
  }
  for (const name of MOUTH_BLENDSHAPES) out[k++] = Math.round((blend?.find((b) => b.categoryName === name)?.score ?? 0) * BLEND);
  return out;
}

export interface RemoteRaw {
  v: 2;
  fps: number;
  n: number;
  pts: number[];
  bl: string[];
  d: string;
}

const toBase64 = (a: Int16Array) => {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

const fromBase64 = (b64: string) => {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Int16Array(bytes.buffer);
};

export function packRaw(frames: Int16Array[], fps: number): RemoteRaw {
  const flat = new Int16Array(frames.length * RAW_DIMS);
  frames.forEach((f, i) => flat.set(f, i * RAW_DIMS));
  return { v: 2, fps: Math.round(fps * 100) / 100, n: frames.length, pts: RAW_POINTS, bl: [...MOUTH_BLENDSHAPES], d: toBase64(flat) };
}

export const isRaw = (x: unknown): x is RemoteRaw => !!x && typeof x === 'object' && (x as RemoteRaw).v === 2 && typeof (x as RemoteRaw).d === 'string';

/** Recalcula los rasgos con la versión actual a partir de lo guardado en bruto. */
export function unpackRaw(r: RemoteRaw): LipSequence | null {
  try {
    const dim = 1 + r.pts.length * 2 + r.bl.length;
    const flat = fromBase64(r.d);
    const n = Math.floor(flat.length / dim);
    if (!n) return null;
    const frames = new Float32Array(n * FEATURE_DIMS);
    const out = new Float32Array(FEATURE_DIMS);
    for (let t = 0; t < n; t++) {
      const o = t * dim;
      const lm: NormalizedLandmark[] = [];
      r.pts.forEach((idx, j) => {
        lm[idx] = { x: flat[o + 1 + j * 2] / POS, y: flat[o + 2 + j * 2] / POS, z: 0, visibility: 1 };
      });
      const b0 = o + 1 + r.pts.length * 2;
      const blend = r.bl.map((name, j) => ({ categoryName: name, score: flat[b0 + j] / BLEND, index: j, displayName: name }));
      frames.set(extractFeatures(lm, blend, flat[o] / 1000, out), t * FEATURE_DIMS);
    }
    return { dims: FEATURE_DIMS, frames, fps: r.fps };
  } catch {
    return null;
  }
}
