import type { LipSequence } from '../types';
import { AMP_POWER, mouthActivity, prepareFrames, smoothSeq } from './embed';
import { dtw } from './dtw';
import { trimStill, withDeltas } from './sequence';
import { applyWeights, featureWeights } from './weights';
import { FewShotClassifier, type Embedded } from './classifier';
import { LANDMARK_DIMS } from '../vision/lip-features';
import { SPEECH_SNR, takeSnr } from '../vision/speech-detect';

/** Longitud fija con la que se comparan los pedazos de la toma (más corta que la de una palabra suelta: es más rápido). */
const L = 16;
const BAND = 4;
/** Peso de las velocidades al partir una toma en palabras. */
const DELTA_WEIGHT = 0.8;
/** Cuánto cuesta meter una palabra de más: evita inventar palabras en el ruido. */
const WORD_COST = 0.35;
/** El rival más cercano debe quedar al menos esto más lejos (proporción) para escribir la palabra sin preguntar. */
const DOUBT_MARGIN = 1.08;
/** Fracción del límite hasta donde una palabra se escribe sin preguntar; entre esto y el límite queda por confirmar. */
const SURE = 0.78;
const LENGTH_FACTORS = [0.65, 0.8, 1, 1.25, 1.55];
/** Representantes por palabra que se comparan primero al buscar dónde empieza cada palabra. */
const REPS = 3;
/** Un pedazo que ni a sus representantes se parece (con este margen sobre el límite) no se compara con los demás ejemplos. */
const FAST_MARGIN = 1.3;

/** Cuadros del tramo más quieto con que se mide el temblor de la cámara. */
const FLOOR_WIN = 8;

/** Lo que se mueve la boca en el tramo más quieto: es temblor de la cámara, no habla. */
function noiseFloor(x: Float32Array, T: number, D: number) {
  let m = Infinity;
  for (let a = 0; a + FLOOR_WIN <= T; a += 2) m = Math.min(m, mouthActivity(x.subarray(a * D, (a + FLOOR_WIN) * D), D));
  return Number.isFinite(m) ? m : 0;
}

/** Movimiento de verdad: lo medido menos el temblor. */
const cleanActivity = (x: Float32Array, D: number, floor: number) => Math.sqrt(Math.max(0, mouthActivity(x, D) ** 2 - floor ** 2));

/** Fracción de la velocidad más alta de la toma debajo de la cual la boca solo se acomoda (no habla). */
const SPEECH_SPEED = 0.35;
const SPAN_PAD = 3;

/** Velocidad de los puntos de la boca en cada cuadro, suavizada. */
function speeds(x: Float32Array, T: number, D: number) {
  const n = Math.min(LANDMARK_DIMS, D);
  const v = new Float32Array(T);
  for (let t = 1; t < T; t++) {
    let s = 0;
    for (let d = 0; d < n; d++) s += (x[t * D + d] - x[(t - 1) * D + d]) ** 2;
    v[t] = Math.sqrt(s);
  }
  v[0] = v[1] ?? 0;
  const out = new Float32Array(T);
  for (let t = 0; t < T; t++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, t - 2); k <= Math.min(T - 1, t + 2); k++, c++) s += v[k];
    out[t] = s / c;
  }
  return out;
}

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
  private w: Float32Array | null = null;
  /** Duración típica de cada palabra, en segundos. */
  private durations = new Map<string, number>();
  private reps = new Map<string, Template[]>();
  private counts = new Map<string, number>();
  /** Por palabra: compensa las de forma genérica, que se parecen un poco a todo (igual que en la lectura de una palabra). */
  private impostor = new Map<string, number>();
  /** Cuánto se mueve la boca, típicamente, al decir cada palabra. */
  private activity = new Map<string, number>();
  /** Se puede apagar para comparar velocidad y exactitud en pruebas. */
  static fast = true;
  /**
   * Puertas de movimiento. Que la toma tenga movimiento de labios (y no solo temblor) lo decide `takeSnr` antes de leer;
   * aquí solo se descartan los pedazos que se mueven mucho menos que el resto de la toma (tomar aire, acomodar la boca).
   * Son relativas y bajas a propósito: quien mueve poco los labios (o los redondea, como en «o» y «u») se mueve poco
   * frente a los ejemplos, pero aun así es habla. Medido con grabaciones reales: con movimientos a un tercio del tamaño
   * normal, leer bien pasó de 40 % a 50 %, y a un cuarto de 20 % a 36 %, sin que el temblor solo escribiera nada.
   */
  static gates = { minRel: 0.15, minPeak: 0.4, minStrength: 0.15 };
  /** Si toda la toma se parece a una sola palabra hasta aquí (en veces la variación normal), es una palabra y no se parte. */
  static oneWord = 1.9;
  /** Desde aquí hasta `oneWord` la toma también se prueba partida, por si son dos palabras cortas. */
  static maybeMany = 1.5;
  /** Cuánto pesa lo largo del pedazo: así partir una palabra larga en dos cortas no suma más (0 = no pesa). */
  static lenWeight = 1;

  get ready() {
    return this.templates.length > 0;
  }

  fit(samples: { phraseId: string; seq: LipSequence }[]) {
    this.templates = [];
    this.durations.clear();
    if (!samples.length) return;
    const raw: Template[] = [];
    const secs = new Map<string, number[]>();
    const acts = new Map<string, number[]>();
    for (const s of samples) {
      const D = s.seq.dims;
      const T = s.seq.frames.length / D;
      const { fixed } = prepareFrames(s.seq.frames, D, { speaker: true, smooth: true, ampPower: AMP_POWER }, L);
      raw.push({ phraseId: s.phraseId, x: withDeltas(fixed, L, D, DELTA_WEIGHT) });
      this.D2 = D * 2;
      const trimmed = trimStill(s.seq.frames, T, D);
      (secs.get(s.phraseId) ?? secs.set(s.phraseId, []).get(s.phraseId)!).push(trimmed.T / Math.max(s.seq.fps, 1));
      const xs = smoothSeq(s.seq.frames, T, D);
      const still = trimStill(xs, T, D);
      (acts.get(s.phraseId) ?? acts.set(s.phraseId, []).get(s.phraseId)!).push(cleanActivity(still.x, D, noiseFloor(xs, T, D)));
    }
    const median = (list: number[]) => list.sort((a, b) => a - b)[Math.floor(list.length / 2)];
    for (const [id, list] of secs) this.durations.set(id, median(list));
    for (const [id, list] of acts) this.activity.set(id, median(list));

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
    this.w = null;
    this.templates = raw.map((t) => ({ phraseId: t.phraseId, x: this.normalize(t.x) }));
    // Los rasgos que mejor separan palabras pesan más (igual que en la lectura de una palabra suelta).
    this.w = featureWeights(this.templates, L, D2, FewShotClassifier.fisher);
    if (this.w) for (const t of this.templates) t.x = applyWeights(this.w, t.x, D2);
    this.scale = this.estimateScale();
    this.buildReps();
    this.impostor = this.impostorFactors();
  }

  /** Qué tan cerca le quedan a cada palabra los ejemplos de las otras (una muestra, para no tardar). */
  private impostorFactors() {
    const out = new Map<string, number>();
    const ids = [...this.counts.keys()];
    if (ids.length < 2) return out;
    const SAMPLE = 40;
    const raw = new Map<string, number>();
    for (const id of ids) {
      const others = this.templates.filter((t) => t.phraseId !== id);
      const stride = Math.max(1, Math.floor(others.length / SAMPLE));
      const ds: number[] = [];
      for (let i = 0; i < others.length; i += stride) ds.push(this.rawDist(others[i].x, id));
      raw.set(id, ds.sort((a, b) => a - b)[Math.floor(ds.length / 2)]);
    }
    const vals = [...raw.values()].sort((a, b) => a - b);
    const mid = vals[Math.floor(vals.length / 2)];
    for (const [id, v] of raw) out.set(id, mid / Math.max(v, 1e-6));
    return out;
  }

  private rawDist(q: Float32Array, phraseId: string) {
    const ds: number[] = [];
    for (const t of this.templates) if (t.phraseId === phraseId) ds.push(dtw(q, t.x, L, this.D2, BAND));
    ds.sort((a, b) => a - b);
    return ds.length >= 3 ? (ds[0] + ds[1]) / 2 : ds[0];
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
    return this.w ? applyWeights(this.w, out, this.D2) : out;
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
    return (this.rawDist(q, phraseId) * (this.impostor.get(phraseId) ?? 1)) / this.scale;
  }

  /** Como `ratio`, pero primero compara con los representantes y descarta de una vez lo que no se parece. */
  private ratioFast(q: Float32Array, phraseId: string, limit: number) {
    const reps = this.reps.get(phraseId);
    if (!WordDecoder.fast || !reps || (this.counts.get(phraseId) ?? 0) <= reps.length) return this.ratio(q, phraseId);
    let d1 = Infinity;
    for (const t of reps) d1 = Math.min(d1, dtw(q, t.x, L, this.D2, BAND));
    const r1 = (d1 * (this.impostor.get(phraseId) ?? 1)) / this.scale;
    return r1 > limit * FAST_MARGIN ? r1 : this.ratio(q, phraseId);
  }

  /**
   * El tramo de la toma donde la boca habla de verdad: quita lo de antes y después (tomar aire, acomodar la boca).
   * Null si no hay suficiente movimiento.
   */
  speechSpan(seq: LipSequence): { start: number; end: number } | null {
    const D = seq.dims;
    const T = seq.frames.length / D;
    if (T < 6) return null;
    const v = speeds(smoothSeq(seq.frames, T, D), T, D);
    let peak = 0;
    for (const x of v) peak = Math.max(peak, x);
    if (peak <= 0) return null;
    let a = 0;
    let b = T - 1;
    while (a < T && v[a] < peak * SPEECH_SPEED) a++;
    while (b > a && v[b] < peak * SPEECH_SPEED) b--;
    a = Math.max(0, a - SPAN_PAD);
    b = Math.min(T, b + 1 + SPAN_PAD);
    return b - a >= 6 ? { start: a, end: b } : null;
  }

  /** Cuánto se movió la boca en [start, end) comparado con cómo se mueve la palabra en sus ejemplos (1 = igual). */
  strength(seq: LipSequence, start: number, end: number, phraseId: string) {
    const D = seq.dims;
    const T = seq.frames.length / D;
    const xs = smoothSeq(seq.frames, T, D);
    const act = cleanActivity(xs.subarray(start * D, end * D), D, noiseFloor(xs, T, D));
    return act / Math.max(this.activity.get(phraseId) ?? 0, 1e-6);
  }

  async decode(seq: LipSequence, opts: DecodeOptions): Promise<DecodedWord[]> {
    const D = seq.dims;
    const T = seq.frames.length / D;
    if (!this.ready || T < 8 || D * 2 !== this.D2) return [];
    const fps = Math.max(seq.fps, 1);
    const step = Math.max(1, Math.round(fps * 0.08));
    const phrases = [...this.durations.keys()];

    // Candidatos: cada palabra se prueba en pedazos con su duración típica, ±.
    const cache = new Map<string, Float32Array>();
    const xs = smoothSeq(seq.frames, T, D);
    const floor = noiseFloor(xs, T, D);
    const acts = new Map<string, number>();
    const actOf = (a: number, b: number) => {
      const key = `${a}:${b}`;
      let v = acts.get(key);
      if (v === undefined) acts.set(key, (v = cleanActivity(xs.subarray(a * D, b * D), D, floor)));
      return v;
    };
    const embedSeg = (a: number, b: number) => {
      const key = `${a}:${b}`;
      if (cache.has(key)) return cache.get(key)!;
      const { fixed } = prepareFrames(seq.frames.subarray(a * D, b * D), D, { speaker: true, smooth: true, ampPower: AMP_POWER }, L);
      const out = this.normalize(withDeltas(fixed, L, D, DELTA_WEIGHT));
      cache.set(key, out);
      return out;
    };
    // Cuánto se mueve un pedazo comparado con cómo se mueve la palabra en sus ejemplos, y lo más fuerte de la toma a ese tamaño.
    const rel = (a: number, b: number, w: number) => actOf(a, b) / Math.max(this.activity.get(phrases[w]) ?? 0, 1e-6);
    const peak = phrases.map((id, w) => {
      const len = Math.min(T, Math.max(5, Math.round(this.durations.get(id)! * fps)));
      let m = 0;
      for (let a = 0; a + len <= T; a += step) m = Math.max(m, rel(a, a + len, w));
      return m;
    });

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
      const limit = opts.limitFor(phrases[w]);
      for (let a = 0; a + 5 <= T; a += step) {
        for (const len of lens) {
          const b = a + len;
          if (b > T) continue;
          const r0 = rel(a, b, w);
          if (r0 < WordDecoder.gates.minRel || r0 < peak[w] * WordDecoder.gates.minPeak) continue;
          const r = this.ratioFast(embedSeg(a, b), phrases[w], limit);
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
    const lensAll = phrases.map((id) => this.durations.get(id)! * fps).sort((x, y) => x - y);
    const medLen = Math.max(5, lensAll[Math.floor(lensAll.length / 2)]);
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
        // Solo lo que se parece por sí mismo entra; el idioma desempata pero ni inventa ni borra una palabra bien leída.
        const gain = (opts.limitFor(phrases[s.w]) - s.r) * ((s.b - s.a) / medLen) ** WordDecoder.lenWeight - WORD_COST;
        if (gain <= 0) continue;
        for (let e = 0; e <= W; e++) {
          if (f[p][e] <= NEG / 2) continue;
          const lm = Math.max(-gain / 2, Math.min(opts.bonus(e === W ? null : phrases[e], phrases[s.w]), gain));
          const v = f[p][e] + gain + lm;
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
      const q = embedSeg(s.a, s.b);
      const alts = phrases
        .map((id, i) => ({ phraseId: id, ratio: i === s.w ? s.r : this.ratio(q, id) }))
        .filter((x) => x.phraseId !== phrases[s.w])
        .sort((x, y) => x.ratio - y.ratio);
      const rival = alts[0];
      const confident = s.r <= opts.limitFor(phrases[s.w]) * SURE && (!rival || rival.ratio / Math.max(s.r, 1e-6) >= DOUBT_MARGIN);
      words.push({ phraseId: phrases[s.w], start: s.a, end: s.b, ratio: s.r, alts: alts.slice(0, 3), confident });
    }
    return words;
  }
}

/** El segundo lugar debe quedar al menos esto más lejos para escribir una palabra suelta sin preguntar. */
const ONE_MARGIN = 1.08;

/**
 * Lee una toma completa. Primero pregunta si es UNA palabra (lo más común): si la toma entera se parece a una,
 * no se parte, y así no se inventan palabras en los movimientos chicos de antes y después. Si no, se parte en
 * varias con el decodificador. Lo que se movió muy poco no cuenta como palabra.
 */
export async function readTake(
  seq: LipSequence,
  classifier: FewShotClassifier,
  decoder: WordDecoder,
  embed: (s: LipSequence) => Promise<Embedded>,
  opts: DecodeOptions,
): Promise<DecodedWord[]> {
  // Primero, ¿hubo movimiento de labios o solo temblor de la cámara? Se mide contra el ruido de la propia toma.
  if (takeSnr(seq.frames, seq.dims) < SPEECH_SNR) return [];
  const span = decoder.speechSpan(seq);
  if (!span) return [];
  if (classifier.phraseCount >= 2) {
    const part = sliceSequence(seq, span.start, span.end);
    const e = await embed(part);
    const near = classifier.closeness(e);
    if (near && near.ratio <= WordDecoder.oneWord) {
      const { candidates } = classifier.predict(e, 0.5, 4);
      const [top, second] = candidates;
      if (decoder.strength(seq, span.start, span.end, top.phraseId) < WordDecoder.gates.minStrength) return [];
      const ratioOf = (d: number) => (near.ratio * d) / Math.max(top.distance, 1e-6);
      const confident = near.ratio <= opts.limitFor(top.phraseId) * SURE && (!second || second.distance / top.distance >= ONE_MARGIN);
      const one: DecodedWord = {
        phraseId: top.phraseId,
        start: span.start,
        end: span.end,
        ratio: near.ratio,
        alts: candidates.slice(1).map((c) => ({ phraseId: c.phraseId, ratio: ratioOf(c.distance) })),
        confident,
      };
      if (near.ratio < WordDecoder.maybeMany) return [one];
      const many = await strongWords(seq, decoder, opts);
      return many.filter((w) => w.confident).length >= 2 ? many : [one];
    }
  }
  return strongWords(seq, decoder, opts);
}

/** Las palabras de la toma partida, sin las que se movieron muy poco. */
async function strongWords(seq: LipSequence, decoder: WordDecoder, opts: DecodeOptions) {
  return (await decoder.decode(seq, opts)).filter((w) => decoder.strength(seq, w.start, w.end, w.phraseId) >= WordDecoder.gates.minStrength);
}
