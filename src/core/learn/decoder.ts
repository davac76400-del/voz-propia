import type { LipSequence } from '../types';
import { mouthActivity, prepareFrames } from './embed';
import { dtw } from './dtw';
import { trimStill, withDeltas } from './sequence';

/** Longitud fija con la que se comparan los pedazos de la toma (más corta que la de una palabra suelta: es más rápido). */
const L = 16;
const BAND = 4;
/** Los pedazos con menos movimiento que esto son silencio. */
const MIN_ACTIVITY = 0.006;
/** Cuánto cuesta meter una palabra de más: evita inventar palabras en el ruido. */
const WORD_COST = 0.15;
/** Un pedazo y su rival más cercano más cerca que esto: la palabra es dudosa. */
const DOUBT_MARGIN = 0.35;
const LENGTH_FACTORS = [0.65, 0.8, 1, 1.25, 1.55];
/** Representantes por palabra que se comparan primero al buscar dónde empieza cada palabra. */
const REPS = 3;
/** Un pedazo que ni a sus representantes se parece (con este margen sobre el límite) no se compara con los demás ejemplos. */
const FAST_MARGIN = 1.3;

interface Template {
  phraseId: string;
  x: Float32Array;
}

export interface DecodedWord {
  phraseId: string;
  /** Cuadros de la toma que ocupa la palabra: [start, end). */
  start: number;
  end: number;
  /** Qué tan lejos queda de los ejemplos, en veces la variación normal (1 = idéntica). */
  ratio: number;
  /** Otras palabras posibles para el mismo pedazo, de más a menos parecida. */
  alts: { phraseId: string; ratio: number }[];
  /** Verdadero si se parece lo bastante y no hay rival cercano: se puede escribir sin preguntar. */
  confident: boolean;
}

export interface DecodeOptions {
  /** Hasta cuánto se acepta cada palabra sin preguntar (cada una puede tener su propio límite). */
  limitFor: (phraseId: string) => number;
  /** Cuánto más holgado que el límite se busca la cadena de palabras; las que pasan del límite quedan «por confirmar». */
  searchFactor?: number;
  /** Ayuda del idioma: qué tan bien va `id` después de `prev` (null = al inicio). */
  bonus: (prev: string | null, id: string) => number;
}

export const sliceSequence = (seq: LipSequence, start: number, end: number): LipSequence => ({
  dims: seq.dims,
  fps: seq.fps,
  frames: seq.frames.slice(start * seq.dims, end * seq.dims),
});

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Lee una toma con varias palabras seguidas. Prueba pedazos de la toma contra los ejemplos de cada palabra
 * y elige, con programación dinámica, la mejor cadena de palabras que no se encimen: una palabra solo entra si
 * se parece de verdad, y el modelo de lenguaje desempata entre las que se ven parecidas.
 */
export class WordDecoder {
  private templates: Template[] = [];
  private mean = new Float32Array(0);
  private std = new Float32Array(0);
  private D2 = 0;
  private scale = 1;
  /** Duración típica de cada palabra, en segundos. */
  private durations = new Map<string, number>();
  private reps = new Map<string, Template[]>();
  private counts = new Map<string, number>();
  /** Se puede apagar para comparar velocidad y exactitud en pruebas. */
  static fast = true;

  get ready() {
    return this.templates.length > 0;
  }

  fit(samples: { phraseId: string; seq: LipSequence }[]) {
    this.templates = [];
    this.durations.clear();
    if (!samples.length) return;
    const raw: Template[] = [];
    const secs = new Map<string, number[]>();
    for (const s of samples) {
      const D = s.seq.dims;
      const T = s.seq.frames.length / D;
      const { fixed } = prepareFrames(s.seq.frames, D, { speaker: true }, L);
      raw.push({ phraseId: s.phraseId, x: withDeltas(fixed, L, D) });
      this.D2 = D * 2;
      const trimmed = trimStill(s.seq.frames, T, D);
      (secs.get(s.phraseId) ?? secs.set(s.phraseId, []).get(s.phraseId)!).push(trimmed.T / Math.max(s.seq.fps, 1));
    }
    for (const [id, list] of secs) this.durations.set(id, list.sort((a, b) => a - b)[Math.floor(list.length / 2)]);

    const D2 = this.D2;
    const mean = new Float32Array(D2);
    const sq = new Float32Array(D2);
    let n = 0;
    for (const t of raw) {
      for (let k = 0; k < L; k++) {
        for (let d = 0; d < D2; d++) {
          const v = t.x[k * D2 + d];
          mean[d] += v;
          sq[d] += v * v;
        }
        n++;
      }
    }
    let avg = 0;
    for (let d = 0; d < D2; d++) {
      mean[d] /= n;
      sq[d] = Math.sqrt(Math.max(sq[d] / n - mean[d] * mean[d], 0));
      avg += sq[d];
    }
    avg = avg / D2 || 1;
    for (let d = 0; d < D2; d++) sq[d] = Math.max(sq[d], avg * 0.3);
    this.mean = mean;
    this.std = sq;
    this.templates = raw.map((t) => ({ phraseId: t.phraseId, x: this.normalize(t.x) }));
    this.scale = this.estimateScale();
    this.buildReps();
  }

  /** Por palabra: el ejemplo más central y los más distintos a él. */
  private buildReps() {
    this.reps = new Map();
    this.counts = new Map();
    const by = new Map<string, Template[]>();
    for (const t of this.templates) (by.get(t.phraseId) ?? by.set(t.phraseId, []).get(t.phraseId)!).push(t);
    for (const [id, list] of by) {
      this.counts.set(id, list.length);
      if (list.length <= REPS) {
        this.reps.set(id, list);
        continue;
      }
      const d = list.map(() => new Array<number>(list.length).fill(0));
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) d[i][j] = d[j][i] = dtw(list[i].x, list[j].x, L, this.D2, BAND);
      const central = d.map((row) => row.reduce((a, b) => a + b, 0)).reduce((best, v, i, arr) => (v < arr[best] ? i : best), 0);
      const picked = [central];
      while (picked.length < REPS) {
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
      this.reps.set(id, picked.map((i) => list[i]));
    }
  }

  private normalize(x: Float32Array) {
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = (x[i] - this.mean[i % this.D2]) / this.std[i % this.D2];
    return out;
  }

  private estimateScale() {
    const byPhrase = new Map<string, Template[]>();
    for (const t of this.templates) (byPhrase.get(t.phraseId) ?? byPhrase.set(t.phraseId, []).get(t.phraseId)!).push(t);
    const intra: number[] = [];
    for (const list of byPhrase.values()) {
      if (list.length < 2) continue;
      for (const a of list) {
        let best = Infinity;
        for (const b of list) if (a !== b) best = Math.min(best, dtw(a.x, b.x, L, this.D2, BAND));
        intra.push(best);
      }
    }
    if (intra.length) return Math.max(intra.sort((a, b) => a - b)[Math.floor(intra.length / 2)], 1e-3);
    // Un solo ejemplo por palabra: se toma una fracción de lo que se separan unas de otras.
    const inter: number[] = [];
    for (let i = 0; i < Math.min(this.templates.length, 30); i++) {
      let best = Infinity;
      for (let j = 0; j < this.templates.length; j++) if (i !== j) best = Math.min(best, dtw(this.templates[i].x, this.templates[j].x, L, this.D2, BAND));
      if (best < Infinity) inter.push(best);
    }
    return inter.length ? Math.max(inter.sort((a, b) => a - b)[Math.floor(inter.length / 2)] * 0.4, 1e-3) : 1;
  }

  private ratio(q: Float32Array, phraseId: string) {
    const ds: number[] = [];
    for (const t of this.templates) if (t.phraseId === phraseId) ds.push(dtw(q, t.x, L, this.D2, BAND));
    ds.sort((a, b) => a - b);
    const d = ds.length >= 3 ? (ds[0] + ds[1]) / 2 : ds[0];
    return d / this.scale;
  }

  /** Como `ratio`, pero primero compara con los representantes y descarta de una vez lo que no se parece. */
  private ratioFast(q: Float32Array, phraseId: string, limit: number) {
    const reps = this.reps.get(phraseId);
    if (!WordDecoder.fast || !reps || (this.counts.get(phraseId) ?? 0) <= reps.length) return this.ratio(q, phraseId);
    let d1 = Infinity;
    for (const t of reps) d1 = Math.min(d1, dtw(q, t.x, L, this.D2, BAND));
    const r1 = d1 / this.scale;
    return r1 > limit * FAST_MARGIN ? r1 : this.ratio(q, phraseId);
  }

  async decode(seq: LipSequence, opts: DecodeOptions): Promise<DecodedWord[]> {
    const D = seq.dims;
    const T = seq.frames.length / D;
    if (!this.ready || T < 8 || D * 2 !== this.D2) return [];
    const fps = Math.max(seq.fps, 1);
    const step = Math.max(1, Math.round(fps * 0.08));
    const phrases = [...this.durations.keys()];

    // Candidatos: cada palabra se prueba en pedazos con su duración típica, ±.
    const cache = new Map<string, Float32Array | null>();
    const embedSeg = (a: number, b: number) => {
      const key = `${a}:${b}`;
      if (cache.has(key)) return cache.get(key)!;
      let out: Float32Array | null = null;
      const frames = seq.frames.subarray(a * D, b * D);
      if (mouthActivity(frames, D) >= MIN_ACTIVITY) {
        const { fixed } = prepareFrames(frames, D, { speaker: true }, L);
        out = this.normalize(withDeltas(fixed, L, D));
      }
      cache.set(key, out);
      return out;
    };

    interface Seg {
      a: number;
      b: number;
      w: number;
      r: number;
      i: number;
    }
    const segs: Seg[] = [];
    let work = 0;
    for (let w = 0; w < phrases.length; w++) {
      const nw = this.durations.get(phrases[w])! * fps;
      const lens = [...new Set(LENGTH_FACTORS.map((f) => Math.max(5, Math.round(nw * f))))];
      const limit = opts.limitFor(phrases[w]) * (opts.searchFactor ?? 1.5);
      for (let a = 0; a + 5 <= T; a += step) {
        for (const len of lens) {
          const b = a + len;
          if (b > T) continue;
          const q = embedSeg(a, b);
          if (!q) continue;
          const r = this.ratioFast(q, phrases[w], limit);
          if (r < limit) segs.push({ a, b, w, r, i: segs.length });
          if (++work % 40 === 0) await tick();
        }
      }
    }
    if (!segs.length) return [];

    // Programación dinámica sobre las posiciones de la toma: f[p][e] es la mejor puntuación hasta la posición p
    // con la palabra e como la última (e = W es «ninguna todavía»). Saltar cuadros es gratis.
    const W = phrases.length;
    const P = T + 1;
    const NEG = -1e9;
    const f = Array.from({ length: P }, () => new Float32Array(W + 1).fill(NEG));
    const back: ({ from: number; prev: number; seg: number } | null)[][] = Array.from({ length: P }, () => new Array(W + 1).fill(null));
    f[0][W] = 0;
    const byStart = new Map<number, Seg[]>();
    segs.forEach((s) => (byStart.get(s.a) ?? byStart.set(s.a, []).get(s.a)!).push(s));
    for (let p = 0; p < P; p++) {
      if (p > 0) {
        for (let e = 0; e <= W; e++) {
          if (f[p - 1][e] > f[p][e]) {
            f[p][e] = f[p - 1][e];
            back[p][e] = { from: p - 1, prev: e, seg: -1 };
          }
        }
      }
      for (const s of byStart.get(p) ?? []) {
        const limit = opts.limitFor(phrases[s.w]) * (opts.searchFactor ?? 1.5);
        for (let e = 0; e <= W; e++) {
          if (f[p][e] <= NEG / 2) continue;
          const lm = opts.bonus(e === W ? null : phrases[e], phrases[s.w]);
          const v = f[p][e] + (limit - s.r) - WORD_COST + lm;
          if (v > f[s.b][s.w]) {
            f[s.b][s.w] = v;
            back[s.b][s.w] = { from: p, prev: e, seg: s.i };
          }
        }
      }
    }

    // Mejor final y recorrido hacia atrás.
    let bestE = W;
    for (let e = 0; e <= W; e++) if (f[T][e] > f[T][bestE]) bestE = e;
    const chosen: Seg[] = [];
    let p = T;
    let e = bestE;
    while (p > 0) {
      const bk = back[p][e];
      if (!bk) break;
      if (bk.seg >= 0) chosen.push(segs[bk.seg]);
      p = bk.from;
      e = bk.prev;
    }
    chosen.reverse();

    // Para cada palabra elegida, qué otras podrían ser en el mismo pedazo.
    const words: DecodedWord[] = [];
    for (const s of chosen) {
      const q = embedSeg(s.a, s.b)!;
      const alts = phrases
        .map((id, i) => ({ phraseId: id, ratio: i === s.w ? s.r : this.ratio(q, id) }))
        .filter((x) => x.phraseId !== phrases[s.w])
        .sort((x, y) => x.ratio - y.ratio);
      const rival = alts[0];
      const confident = s.r <= opts.limitFor(phrases[s.w]) && (!rival || rival.ratio - s.r >= DOUBT_MARGIN);
      words.push({ phraseId: phrases[s.w], start: s.a, end: s.b, ratio: s.r, alts: alts.slice(0, 3), confident });
    }
    return words;
  }
}
