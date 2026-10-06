/**
 * Peso por rasgo según qué tanto separa a las palabras (razón de Fisher): un rasgo que cambia mucho de una palabra a
 * otra y poco entre repeticiones de la misma pesa más al comparar. Así los gestos finos que sí definen la palabra
 * (una comisura, un redondeo de labios) no se pierden entre rasgos que solo se mueven por la persona o la cámara.
 *
 * Es la versión diagonal de un análisis discriminante lineal. La versión completa (blanqueo con la covarianza
 * entera) se probó y empeoró con personas nuevas, por eso se usa solo el peso por rasgo, suavizado con `power`.
 */

export interface WeightItem {
  phraseId: string;
  /** L×D aplanado. */
  x: Float32Array;
}

export function featureWeights(items: WeightItem[], L: number, D: number, power: number): Float32Array | null {
  if (!power) return null;
  const groups = new Map<string, WeightItem[]>();
  for (const it of items) (groups.get(it.phraseId) ?? groups.set(it.phraseId, []).get(it.phraseId)!).push(it);
  const within = new Float64Array(D);
  const between = new Float64Array(D);
  const grand = new Float64Array(D);
  const mean = new Float64Array(D);
  let nw = 0;
  let ng = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (let t = 0; t < L; t++) {
      mean.fill(0);
      for (const it of list) for (let d = 0; d < D; d++) mean[d] += it.x[t * D + d] / list.length;
      for (const it of list) for (let d = 0; d < D; d++) within[d] += (it.x[t * D + d] - mean[d]) ** 2;
      nw += list.length;
      for (let d = 0; d < D; d++) {
        grand[d] += mean[d];
        between[d] += mean[d] * mean[d];
      }
      ng++;
    }
  }
  // Con pocas palabras o repeticiones la estimación no es fiable: se comparan todos los rasgos por igual.
  if (nw < D || ng < 4 * L) return null;
  const w = new Float32Array(D);
  let sum = 0;
  for (let d = 0; d < D; d++) {
    const gm = grand[d] / ng;
    const b = between[d] / ng - gm * gm;
    const ratio = Math.max(b, 1e-6) / Math.max(within[d] / nw, 1e-6);
    w[d] = ratio ** power;
    sum += w[d];
  }
  const avg = sum / D || 1;
  for (let d = 0; d < D; d++) w[d] = Math.min(3, Math.max(0.25, w[d] / avg));
  return w;
}

export function applyWeights(w: Float32Array, x: Float32Array, D: number): Float32Array {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * w[i % D];
  return out;
}
