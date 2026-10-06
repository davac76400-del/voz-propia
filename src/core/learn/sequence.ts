/** Utilidades sobre secuencias T×D aplanadas en Float32Array. */

export const TARGET_LEN = 24;
const PAD = 3;

function energy(x: Float32Array, T: number, D: number): Float32Array {
  const e = new Float32Array(T);
  for (let t = 1; t < T; t++) {
    let s = 0;
    for (let d = 0; d < D; d++) {
      const v = x[t * D + d] - x[(t - 1) * D + d];
      s += v * v;
    }
    e[t] = Math.sqrt(s);
  }
  e[0] = e[1] ?? 0;
  return e;
}

/** Quita los cuadros quietos del inicio y del final: solo importa el movimiento de la frase. */
export function trimStill(x: Float32Array, T: number, D: number): { x: Float32Array; T: number } {
  if (T < 12) return { x, T };
  const e = energy(x, T, D);
  const sorted = Array.from(e).sort((a, b) => a - b);
  const median = sorted[Math.floor(T / 2)];
  const thr = Math.max(median * 1.2, sorted[T - 1] * 0.15);
  let a = 0;
  let b = T - 1;
  while (a < T && e[a] < thr) a++;
  while (b > a && e[b] < thr) b--;
  a = Math.max(0, a - PAD);
  b = Math.min(T - 1, b + PAD);
  if (b - a + 1 < 8) return { x, T };
  return { x: x.slice(a * D, (b + 1) * D), T: b - a + 1 };
}

/** Remuestrea a una longitud fija con interpolación lineal. */
export function resample(x: Float32Array, T: number, D: number, L = TARGET_LEN): Float32Array {
  const out = new Float32Array(L * D);
  for (let i = 0; i < L; i++) {
    const src = T === 1 ? 0 : (i * (T - 1)) / (L - 1);
    const i0 = Math.floor(src);
    const i1 = Math.min(T - 1, i0 + 1);
    const w = src - i0;
    for (let d = 0; d < D; d++) out[i * D + d] = x[i0 * D + d] * (1 - w) + x[i1 * D + d] * w;
  }
  return out;
}

/** Agrega la velocidad de cada rasgo: ayuda a distinguir frases con formas parecidas pero ritmo distinto. */
export function withDeltas(x: Float32Array, L: number, D: number, weight = 1.2): Float32Array {
  const out = new Float32Array(L * D * 2);
  for (let t = 0; t < L; t++) {
    const prev = Math.max(0, t - 1);
    const next = Math.min(L - 1, t + 1);
    for (let d = 0; d < D; d++) {
      out[t * 2 * D + d] = x[t * D + d];
      out[t * 2 * D + D + d] = ((x[next * D + d] - x[prev * D + d]) / 2) * weight * 4;
    }
  }
  return out;
}
