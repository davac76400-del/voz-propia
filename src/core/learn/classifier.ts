import type { Candidate, Prediction } from '../types';
import { dtw } from './dtw';

export interface Embedded {
  /** L×D aplanado, ya en el espacio del codificador. */
  x: Float32Array;
  L: number;
  D: number;
}

const RATIO_SHARPNESS = 5;
/** Distancia máxima, en múltiplos de la variación normal entre ejemplos, antes de dudar. */
const OUTLIER_LIMIT = 2.2;

interface Prepared {
  phraseId: string;
  x: Float32Array;
}

/**
 * Clasificador de pocas muestras (few-shot) por vecino más cercano con DTW.
 * Cada frase se aprende con 1 a 5 ejemplos; no hay entrenamiento pesado, se recalcula al instante.
 */
export class FewShotClassifier {
  private items: Prepared[] = [];
  private mean = new Float32Array(0);
  private std = new Float32Array(0);
  private L = 0;
  private D = 0;
  /** Distancia típica entre dos ejemplos de la misma frase. */
  private scale = 1;

  get size() {
    return this.items.length;
  }

  get itemCount() {
    return this.items.length;
  }

  get phraseCount() {
    return new Set(this.items.map((i) => i.phraseId)).size;
  }

  fit(samples: { phraseId: string; emb: Embedded }[]) {
    this.items = [];
    if (!samples.length) return;
    const { L, D } = samples[0].emb;
    this.L = L;
    this.D = D;

    const mean = new Float32Array(D);
    const sq = new Float32Array(D);
    let n = 0;
    for (const s of samples) {
      for (let t = 0; t < L; t++) {
        for (let d = 0; d < D; d++) {
          const v = s.emb.x[t * D + d];
          mean[d] += v;
          sq[d] += v * v;
        }
        n++;
      }
    }
    let avgStd = 0;
    for (let d = 0; d < D; d++) {
      mean[d] /= n;
      sq[d] = Math.sqrt(Math.max(sq[d] / n - mean[d] * mean[d], 0));
      avgStd += sq[d];
    }
    avgStd = avgStd / D || 1;
    for (let d = 0; d < D; d++) sq[d] = Math.max(sq[d], avgStd * 0.3);
    this.mean = mean;
    this.std = sq;

    this.items = samples.map((s) => ({ phraseId: s.phraseId, x: this.normalize(s.emb.x) }));
    this.scale = this.estimateScale();
  }

  private normalize(x: Float32Array): Float32Array {
    const out = new Float32Array(x.length);
    const D = this.D;
    for (let i = 0; i < x.length; i++) {
      const d = i % D;
      out[i] = (x[i] - this.mean[d]) / this.std[d];
    }
    return out;
  }

  /** Mediana de la distancia de cada ejemplo a su vecino más cercano de la misma frase. */
  private estimateScale(): number {
    const intra: number[] = [];
    const inter: number[] = [];
    for (let i = 0; i < this.items.length; i++) {
      let bestSame = Infinity;
      let bestOther = Infinity;
      for (let j = 0; j < this.items.length; j++) {
        if (i === j) continue;
        const d = dtw(this.items[i].x, this.items[j].x, this.L, this.D);
        if (this.items[i].phraseId === this.items[j].phraseId) bestSame = Math.min(bestSame, d);
        else bestOther = Math.min(bestOther, d);
      }
      if (bestSame < Infinity) intra.push(bestSame);
      if (bestOther < Infinity) inter.push(bestOther);
    }
    const median = (a: number[]) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    if (intra.length) return Math.max(median(intra), 1e-3);
    if (inter.length) return Math.max(median(inter) * 0.4, 1e-3);
    return 1;
  }

  /** Qué frase elegiría cada ejemplo si no existiera él mismo. Sirve para medir la precisión con tus propios datos. */
  leaveOneOut(index: number): { actual: string; predicted: string } | null {
    const me = this.items[index];
    const perPhrase = new Map<string, number[]>();
    for (let j = 0; j < this.items.length; j++) {
      if (j === index) continue;
      const it = this.items[j];
      const d = dtw(me.x, it.x, this.L, this.D);
      const list = perPhrase.get(it.phraseId);
      if (list) list.push(d);
      else perPhrase.set(it.phraseId, [d]);
    }
    if (!perPhrase.has(me.phraseId) || perPhrase.size < 2) return null;
    let best = '';
    let bestD = Infinity;
    for (const [phraseId, ds] of perPhrase) {
      ds.sort((a, b) => a - b);
      const distance = ds.length >= 3 ? (ds[0] + ds[1]) / 2 : ds[0];
      if (distance < bestD) {
        bestD = distance;
        best = phraseId;
      }
    }
    return { actual: me.phraseId, predicted: best };
  }

  /**
   * Qué tan lejos queda la toma de la frase más parecida, en veces la variación normal entre ejemplos
   * (1 = como cualquier ejemplo propio). Sirve cuando hay una sola frase y no hay contra qué comparar.
   */
  closeness(emb: Embedded): { phraseId: string; ratio: number } | null {
    if (!this.items.length || emb.L !== this.L || emb.D !== this.D) return null;
    const q = this.normalize(emb.x);
    const perPhrase = new Map<string, number[]>();
    for (const it of this.items) {
      const d = dtw(q, it.x, this.L, this.D);
      const list = perPhrase.get(it.phraseId);
      if (list) list.push(d);
      else perPhrase.set(it.phraseId, [d]);
    }
    let best: { phraseId: string; distance: number } | null = null;
    for (const [phraseId, ds] of perPhrase) {
      ds.sort((a, b) => a - b);
      const distance = ds.length >= 3 ? (ds[0] + ds[1]) / 2 : ds[0];
      if (!best || distance < best.distance) best = { phraseId, distance };
    }
    return best ? { phraseId: best.phraseId, ratio: best.distance / this.scale } : null;
  }

  predict(emb: Embedded, autoSpeakThreshold: number, topK = 3): Prediction {
    if (!this.items.length || emb.L !== this.L || emb.D !== this.D) {
      return { candidates: [], confidence: 0, ambiguous: true };
    }
    const q = this.normalize(emb.x);
    const perPhrase = new Map<string, number[]>();
    for (const it of this.items) {
      const d = dtw(q, it.x, this.L, this.D);
      const list = perPhrase.get(it.phraseId);
      if (list) list.push(d);
      else perPhrase.set(it.phraseId, [d]);
    }

    // Promedio de los 2 vecinos más cercanos cuando hay suficientes ejemplos: más estable que uno solo.
    const scored = [...perPhrase].map(([phraseId, ds]) => {
      ds.sort((a, b) => a - b);
      const distance = ds.length >= 3 ? (ds[0] + ds[1]) / 2 : ds[0];
      return { phraseId, distance };
    });
    scored.sort((a, b) => a.distance - b.distance);

    // La confianza depende de cuánto más lejos está cada rival que la mejor frase (proporción, no
    // distancia absoluta): medido en pruebas, un acierto deja al segundo lugar ~2 veces más lejos y
    // una toma ambigua apenas 1.05 a 1.15 veces.
    const best = Math.max(scored[0].distance, 1e-6);
    const weights = scored.map((s) => Math.exp(-RATIO_SHARPNESS * (s.distance / best - 1)));
    const total = weights.reduce((a, b) => a + b, 0);
    const candidates: Candidate[] = scored.map((s, i) => ({ ...s, probability: weights[i] / total }));

    // Si ni la mejor frase se parece a lo aprendido, la confianza baja aunque gane por comparación.
    const outlier = Math.max(0, best / this.scale - OUTLIER_LIMIT);
    const confidence = candidates[0].probability * Math.exp(-outlier);

    return {
      candidates: candidates.slice(0, topK),
      confidence,
      ambiguous: confidence < autoSpeakThreshold,
    };
  }
}
