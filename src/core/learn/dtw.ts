let buffer = new Float32Array(0);

/**
 * Distancia DTW con banda Sakoe-Chiba entre dos secuencias L×D.
 * Permite que la misma frase dicha más rápido o más lento siga pareciéndose.
 */
export function dtw(a: Float32Array, b: Float32Array, L: number, D: number, band = Math.ceil(L * 0.25)): number {
  const W = L + 1;
  if (buffer.length < W * W) buffer = new Float32Array(W * W);
  const C = buffer;
  C.fill(Infinity, 0, W * W);
  C[0] = 0;
  for (let i = 1; i <= L; i++) {
    const lo = Math.max(1, i - band);
    const hi = Math.min(L, i + band);
    const ai = (i - 1) * D;
    for (let j = lo; j <= hi; j++) {
      const bj = (j - 1) * D;
      let s = 0;
      for (let d = 0; d < D; d++) {
        const v = a[ai + d] - b[bj + d];
        s += v * v;
      }
      const cost = Math.sqrt(s);
      const best = Math.min(C[(i - 1) * W + j], C[i * W + j - 1], C[(i - 1) * W + j - 1]);
      C[i * W + j] = cost + best;
    }
  }
  return C[L * W + L] / (2 * L);
}
