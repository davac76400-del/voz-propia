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
const OUTLIER_LIMIT = 3;

interface Prepared {
  id?: string;
  phraseId: string;
  x: Float32Array;
}

/** Un ejemplo se deja fuera si su vecino más cercano de la misma frase está tantas veces más lejos que lo normal en esa frase. */
/** Si la vecina de otra palabra está a menos de esta fracción de la distancia a la propia, es un parecido. */
const LOOKALIKE_RATIO = 1;
const DOUBTFUL_RATIO = 2;
/** ...y además queda claramente más lejos que la variación típica de todas las frases. */
const DOUBTFUL_GLOBAL = 1.3;
/** Solo se descartan ejemplos de frases con suficientes, y siempre quedan al menos 3. */
const MIN_FOR_DOUBT = 4;

/** Representantes que se comparan primero por palabra (el más central y los más distintos). */
const PROTOS = 3;
/** Cuántas palabras se afinan con todos sus ejemplos tras la primera pasada. */
const REFINE = 4;
/** Con pocas palabras no vale la pena la primera pasada. */
const TWO_STAGE_MIN_PHRASES = 8;
/** Las palabras que no pasan a la segunda etapa se cuentan algo más lejos: así nunca le ganan a una afinada. */
const FAR_INFLATE = 1.1;

export interface Doubtful {
  id?: string;
  phraseId: string;
  ratio: number;
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
  /** Ejemplos que no se usan para comparar porque no se parecen a los demás de su frase. */
  doubtful: Doubtful[] = [];
  private byPhrase = new Map<string, Prepared[]>();
  private protos = new Map<string, Prepared[]>();
  /** Se pueden apagar para comparar velocidad y exactitud en pruebas. */
  static twoStage = true;
  /** Piso de la escala por rasgo, en veces la escala media: más bajo = los movimientos chicos pesan más. */
  static floor = 0.3;
  /** Cuántas comparaciones DTW hizo en la última lectura. */
  lastComparisons = 0;

  get size() {
    return this.items.length;
  }

  get itemCount() {
    return this.items.length;
  }

  /** Frase a la que pertenece el ejemplo número `i` (el mismo orden que usa `leaveOneOut`). */
  phraseOf(i: number) {
    return this.items[i]?.phraseId;
  }

  get phraseCount() {
    return new Set(this.items.map((i) => i.phraseId)).size;
  }

  fit(samples: { id?: string; phraseId: string; emb: Embedded }[]) {
    this.items = [];
    this.doubtful = [];
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
    for (let d = 0; d < D; d++) sq[d] = Math.max(sq[d], avgStd * FewShotClassifier.floor);
    this.mean = mean;
    this.std = sq;

    this.items = samples.map((s) => ({ id: s.id, phraseId: s.phraseId, x: this.normalize(s.emb.x) }));
    this.scale = this.estimateScale();
    this.buildIndex();
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

  /** Mediana de la distancia de cada ejemplo a su vecino más cercano de la misma frase. Además aparta los ejemplos dudosos. */
  private estimateScale(): number {
    const n = this.items.length;
    const bestSame = new Array<number>(n).fill(Infinity);
    const bestOther = new Array<number>(n).fill(Infinity);
    const otherIdx = new Array<number>(n).fill(-1);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = dtw(this.items[i].x, this.items[j].x, this.L, this.D);
        if (this.items[i].phraseId === this.items[j].phraseId) {
          if (d < bestSame[i]) bestSame[i] = d;
          if (d < bestSame[j]) bestSame[j] = d;
        } else {
          if (d < bestOther[i]) {
            bestOther[i] = d;
            otherIdx[i] = j;
          }
          if (d < bestOther[j]) {
            bestOther[j] = d;
            otherIdx[j] = i;
          }
        }
      }
    }
    const intra = bestSame.filter(Number.isFinite);
    const inter = bestOther.filter(Number.isFinite);
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    let scale = 1;
    if (intra.length) scale = Math.max(median(intra), 1e-3);
    else if (inter.length) scale = Math.max(median(inter) * 0.4, 1e-3);
    this.dropLookAlikes(bestSame, bestOther, otherIdx);
    this.dropDoubtful(bestSame, scale);
    return scale;
  }

  /** Agrupa los ejemplos por palabra y elige los representantes para la primera pasada. */
  private buildIndex() {
    this.byPhrase = new Map();
    this.protos = new Map();
    for (const it of this.items) (this.byPhrase.get(it.phraseId) ?? this.byPhrase.set(it.phraseId, []).get(it.phraseId)!).push(it);
    for (const [id, list] of this.byPhrase) {
      if (list.length <= PROTOS) {
        this.protos.set(id, list);
        continue;
      }
      const d = list.map(() => new Array<number>(list.length).fill(0));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) d[i][j] = d[j][i] = dtw(list[i].x, list[j].x, this.L, this.D);
      const central = d.map((row) => row.reduce((a, b) => a + b, 0)).reduce((best, v, i, arr) => (v < arr[best] ? i : best), 0);
      const picked = [central];
      while (picked.length < PROTOS) {
        let far = -1;
        let farD = -1;
        for (let i = 0; i < list.length; i++) {
          if (picked.includes(i)) continue;
          const m = Math.min(...picked.map((k) => d[i][k]));
          if (m > farD) {
            farD = m;
            far = i;
          }
        }
        picked.push(far);
      }
      this.protos.set(id, picked.map((i) => list[i]));
    }
  }

  private weighted(q: Float32Array, it: Prepared) {
    this.lastComparisons++;
    return dtw(q, it.x, this.L, this.D);
  }

  /** Distancia de la toma a cada palabra: primero contra sus representantes, y con todos sus ejemplos solo las más cercanas. */
  private scorePhrases(q: Float32Array): { phraseId: string; distance: number }[] {
    this.lastComparisons = 0;
    const exact = (list: Prepared[]) => {
      const ds = list.map((it) => this.weighted(q, it)).sort((a, b) => a - b);
      return ds.length >= 3 ? (ds[0] + ds[1]) / 2 : ds[0];
    };
    if (!FewShotClassifier.twoStage || this.byPhrase.size <= TWO_STAGE_MIN_PHRASES) {
      return [...this.byPhrase].map(([phraseId, list]) => ({ phraseId, distance: exact(list) }));
    }
    const first = [...this.protos]
      .map(([phraseId, ps]) => ({ phraseId, d: Math.min(...ps.map((p) => this.weighted(q, p))) }))
      .sort((a, b) => a.d - b.d);
    return first.map((f, i) => ({ phraseId: f.phraseId, distance: i < REFINE ? exact(this.byPhrase.get(f.phraseId)!) : f.d * FAR_INFLATE }));
  }

  /**
   * Un ejemplo que se parece más a otra palabra que a las suyas es un colado. Se quita si esa otra palabra tiene MÁS
   * ejemplos (entre una de 5 y otra de 3 parecidas, se van los de la de 3) o si el parecido tiene mejor respaldo
   * (el ejemplo vecino se ve muy parecido a los de su propia palabra y este no).
   */
  private dropLookAlikes(bestSame: number[], bestOther: number[], otherIdx: number[]) {
    const count = new Map<string, number>();
    for (const it of this.items) count.set(it.phraseId, (count.get(it.phraseId) ?? 0) + 1);
    const drop = new Set<Prepared>();
    const lost = new Map<string, number>();
    this.items.forEach((it, i) => {
      const j = otherIdx[i];
      if (j < 0 || !Number.isFinite(bestSame[i]) || bestOther[i] >= bestSame[i] * LOOKALIKE_RATIO) return;
      const other = this.items[j];
      const moreExamples = (count.get(other.phraseId) ?? 0) > (count.get(it.phraseId) ?? 0);
      const betterBacked = Number.isFinite(bestSame[j]) && bestSame[j] < bestSame[i] * 0.7;
      if (!moreExamples && !betterBacked) return;
      // Nunca se quita más de la mitad de una palabra, ni se la deja con menos de 2.
      const total = count.get(it.phraseId) ?? 0;
      const gone = lost.get(it.phraseId) ?? 0;
      if (gone + 1 > Math.floor(total / 2) || total - gone - 1 < 2) return;
      lost.set(it.phraseId, gone + 1);
      drop.add(it);
      this.doubtful.push({ id: it.id, phraseId: it.phraseId, ratio: bestSame[i] / Math.max(bestOther[i], 1e-6) });
    });
    if (drop.size) this.items = this.items.filter((it) => !drop.has(it));
  }

  private dropDoubtful(nearestSame: number[], scale: number) {
    const byPhrase = new Map<string, number[]>();
    this.items.forEach((it, i) => {
      if (!Number.isFinite(nearestSame[i])) return;
      const list = byPhrase.get(it.phraseId);
      if (list) list.push(i);
      else byPhrase.set(it.phraseId, [i]);
    });
    const drop = new Set<Prepared>();
    for (const [phraseId, idx] of byPhrase) {
      if (idx.length < MIN_FOR_DOUBT) continue;
      const sorted = idx.map((i) => nearestSame[i]).sort((a, b) => a - b);
      const typical = Math.max(sorted[Math.floor(sorted.length / 2)], 1e-3);
      const flagged = idx
        .map((i) => ({ i, ratio: nearestSame[i] / typical }))
        .filter((x) => x.ratio > DOUBTFUL_RATIO && nearestSame[x.i] > DOUBTFUL_GLOBAL * scale)
        .sort((a, b) => b.ratio - a.ratio);
      let left = idx.length;
      for (const f of flagged) {
        if (left - 1 < MIN_FOR_DOUBT - 1) break;
        left--;
        drop.add(this.items[f.i]);
        this.doubtful.push({ id: this.items[f.i].id, phraseId, ratio: f.ratio });
      }
    }
    if (drop.size) this.items = this.items.filter((it) => !drop.has(it));
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
    let best: { phraseId: string; distance: number } | null = null;
    for (const sc of this.scorePhrases(q)) if (!best || sc.distance < best.distance) best = sc;
    return best ? { phraseId: best.phraseId, ratio: best.distance / this.scale } : null;
  }

  predict(emb: Embedded, autoSpeakThreshold: number, topK = 3): Prediction {
    if (!this.items.length || emb.L !== this.L || emb.D !== this.D) {
      return { candidates: [], confidence: 0, ambiguous: true };
    }
    const q = this.normalize(emb.x);
    const scored = this.scorePhrases(q);
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
