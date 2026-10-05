import { LANDMARK_DIMS } from '../vision/lip-features';
import { resample, TARGET_LEN, trimStill, withDeltas } from './sequence';

export interface EmbedOptions {
  /** Quita la forma media de la boca y la amplitud: dos personas o cámaras distintas se parecen más. */
  speaker?: boolean;
  /** Suaviza el temblor del seguimiento (cámaras web ruidosas). */
  smooth?: boolean;
}

const smoothSeq = (x: Float32Array, T: number, D: number) => {
  const y = new Float32Array(x.length);
  for (let t = 0; t < T; t++) {
    const a = Math.max(0, t - 1) * D;
    const c = Math.min(T - 1, t + 1) * D;
    for (let d = 0; d < D; d++) y[t * D + d] = 0.25 * x[a + d] + 0.5 * x[t * D + d] + 0.25 * x[c + d];
  }
  return y;
};

/**
 * Cada persona tiene la boca distinta y cada cámara mide distinto. Se resta la forma media de la toma
 * y se escala por cuánto se mueve: queda solo la manera de moverse, que es lo que identifica la palabra.
 * Los puntos de la boca y los gestos se escalan por separado.
 */
export function speakerNormalize(x: Float32Array, T: number, D: number, split = LANDMARK_DIMS): Float32Array {
  const out = new Float32Array(x.length);
  const groups: [number, number][] = [[0, Math.min(split, D)]];
  if (split < D) groups.push([split, D]);
  for (const [a, b] of groups) {
    let energy = 0;
    for (let d = a; d < b; d++) {
      let m = 0;
      for (let t = 0; t < T; t++) m += x[t * D + d];
      m /= T;
      for (let t = 0; t < T; t++) {
        const v = x[t * D + d] - m;
        out[t * D + d] = v;
        energy += v * v;
      }
    }
    const rms = Math.sqrt(energy / (T * (b - a))) || 1;
    // El piso evita agrandar el ruido cuando casi no hay movimiento.
    const k = 1 / Math.max(rms, 1e-3);
    for (let d = a; d < b; d++) for (let t = 0; t < T; t++) out[t * D + d] *= k;
  }
  return out;
}

/** Cuadros → vector comparable de longitud fija. Es el único camino de lectura de labios. */
export function prepareFrames(frames: Float32Array, D: number, opts: EmbedOptions = {}): { fixed: Float32Array; L: number } {
  let T = frames.length / D;
  let x = opts.smooth ? smoothSeq(frames, T, D) : frames;
  const trimmed = trimStill(x, T, D);
  x = trimmed.x;
  T = trimmed.T;
  if (opts.speaker) x = speakerNormalize(x, T, D);
  return { fixed: resample(x, T, D), L: TARGET_LEN };
}

export function embedFrames(frames: Float32Array, D: number, opts: EmbedOptions = {}) {
  const { fixed, L } = prepareFrames(frames, D, opts);
  return { x: withDeltas(fixed, L, D), L, D: D * 2 };
}

/**
 * Cuánto se movieron los labios en la toma (desviación típica de los puntos, en distancias entre ojos).
 * Sirve para no leer nada cuando la persona se quedó quieta y solo hay temblor de la cámara.
 */
export function mouthActivity(frames: Float32Array, D: number, split = LANDMARK_DIMS): number {
  const T = frames.length / D;
  if (T < 4) return 0;
  const n = Math.min(split, D);
  let sum = 0;
  for (let d = 0; d < n; d++) {
    let m = 0;
    for (let t = 0; t < T; t++) m += frames[t * D + d];
    m /= T;
    let v = 0;
    for (let t = 0; t < T; t++) v += (frames[t * D + d] - m) ** 2;
    sum += v / T;
  }
  return Math.sqrt(sum / n);
}
