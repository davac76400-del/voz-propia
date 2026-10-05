import { FEATURE_DIMS } from './vision/lip-features';
import { FewShotClassifier, type Embedded } from './learn/classifier';
import { NeuralEncoder } from './learn/neural-encoder';
import { mouthActivity, prepareFrames } from './learn/embed';
import { TARGET_LEN, withDeltas } from './learn/sequence';
import { sliceSequence, WordDecoder, type DecodedWord } from './learn/decoder';
import { bigramBonus } from './language/spanish';
import { learnedBonus, recordSentence, setSeeds, transitionCount } from './language/learned';
import { pushSnapshot, readHistory, tierOf, type TrainingSnapshot, type WordHealth } from './learn/progress';
import { db, uid } from './storage/db';
import type { LipSequence, Phrase, Prediction, Sample } from './types';
import { DEFAULT_PHRASES, RETIRED_DEFAULTS } from '../data/default-phrases';

type Listener = () => void;

export const MAX_SAMPLES_PER_PHRASE = 12;
const SHARED_PREFIX = 'shared:';
/** Ejemplos con los que una frase se considera lista. */
export const READY_SAMPLES = 3;

export interface PhraseSnapshot {
  phrase: Phrase;
  samples: Sample[];
  audio?: Blob;
}

/** Orquesta frases, ejemplos y clasificador. Es la única puerta de la interfaz hacia el aprendizaje. */
class Engine {
  phrases: Phrase[] = [];
  samples: Sample[] = [];
  private classifier = new FewShotClassifier();
  private neural: NeuralEncoder | null = null;
  private listeners = new Set<Listener>();
  encoderName = 'Geometría de labios';
  /** Quién decide si se entrena sola tras cada cambio (solo el programador, para no gastar batería del usuario). */
  autoTrainWhen: () => boolean = () => false;
  training = false;
  lastTraining: TrainingSnapshot | null = readHistory().at(-1) ?? null;
  /** Se avisa al terminar una medición automática, con la anterior para poder decir si mejoró. */
  onTrained: ((now: TrainingSnapshot, before: TrainingSnapshot | null) => void) | null = null;
  private trainTimer = 0;

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  async load() {
    this.phrases = await db.phrases();
    if (!this.phrases.length) {
      const now = Date.now();
      this.phrases = DEFAULT_PHRASES.map((p, i) => ({ ...p, id: uid(), order: i, createdAt: now }));
      for (const p of this.phrases) await db.putPhrase(p);
    }
    // Los ejemplos de versiones anteriores (menos puntos) ya no sirven: se ignoran.
    this.samples = (await db.samples()).filter((x) => x.seq.dims === FEATURE_DIMS);
    await this.syncDefaults();
    await this.retrain();
    void this.tryNeural();
  }

  /** Agrega las palabras recomendadas que falten (vacías, en orden) y quita las frases largas de fábrica sin ejemplos. */
  private async syncDefaults() {
    const key = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const retired = new Set(RETIRED_DEFAULTS.map(key));
    for (const p of this.phrases.filter((x) => retired.has(key(x.text)) && !this.samples.some((s) => s.phraseId === x.id))) {
      await db.deletePhrase(p.id);
      this.phrases = this.phrases.filter((x) => x.id !== p.id);
    }
    const have = new Set(this.phrases.map((p) => key(p.text)));
    let order = Math.max(-1, ...this.phrases.map((p) => p.order)) + 1;
    const now = Date.now();
    for (const d of DEFAULT_PHRASES) {
      if (have.has(key(d.text))) continue;
      const full: Phrase = { ...d, id: uid(), order: order++, createdAt: now };
      await db.putPhrase(full);
      this.phrases.push(full);
    }
  }

  private async tryNeural() {
    if (!(await NeuralEncoder.isInstalled())) return;
    try {
      const enc = new NeuralEncoder();
      await enc.load();
      this.neural = enc;
      this.encoderName = `Codificador neuronal (${enc.backend === 'webgpu' ? 'WebGPU' : 'WASM'})`;
      await this.retrain();
    } catch {
      this.neural = null;
    }
  }

  async embed(seq: LipSequence): Promise<Embedded> {
    const D = seq.dims;
    // Se quita la forma media de la boca y la amplitud: otra persona u otra cámara se leen igual.
    const { fixed } = prepareFrames(seq.frames, D, { speaker: true });
    if (this.neural) {
      const out = await this.neural.embed(fixed, TARGET_LEN, D);
      return { x: out.x, L: TARGET_LEN, D: out.D };
    }
    return { x: withDeltas(fixed, TARGET_LEN, D), L: TARGET_LEN, D: D * 2 };
  }

  private decoder = new WordDecoder();
  private decoderStale = true;

  private async retrain() {
    const valid = new Set(this.phrases.map((p) => p.id));
    const embedded = await Promise.all(
      this.samples.filter((s) => valid.has(s.phraseId)).map(async (s) => ({ id: s.id, phraseId: s.phraseId, emb: await this.embed(s.seq) })),
    );
    this.classifier.fit(embedded);
    this.decoderStale = true;
    this.learnTransitions();
    this.emit();
    this.scheduleTraining();
  }

  /** Frases largas del programador que se pueden partir en palabras ya conocidas: de ahí salen parejas de palabras. */
  private learnTransitions() {
    const known = this.phrases.map((p) => p.text.trim().toLowerCase()).filter(Boolean).sort((a, b) => b.length - a.length);
    const sentences: string[][] = [];
    for (const p of this.phrases) {
      const text = p.text.trim().toLowerCase();
      if (!/\s/.test(text)) continue;
      const parts: string[] = [];
      let rest = text;
      while (rest) {
        const hit = known.find((k) => k !== text && (rest === k || rest.startsWith(k + ' ')));
        if (!hit) break;
        parts.push(hit);
        rest = rest.slice(hit.length).trim();
      }
      if (!rest && parts.length >= 2) sentences.push(parts);
    }
    setSeeds(sentences);
  }

  /** Una frase armada y aceptada: la app aprende qué palabras van juntas. */
  recordSentence(phraseIds: string[]) {
    recordSentence(phraseIds.map((id) => this.phrase(id)?.text ?? '').filter(Boolean));
  }

  /** Tras subir o cambiar ejemplos, mide en segundo plano cómo va cada palabra (solo si está activado). */
  private scheduleTraining() {
    clearTimeout(this.trainTimer);
    if (!this.autoTrainWhen() || this.classifier.phraseCount < 2) return;
    this.trainTimer = window.setTimeout(() => void this.trainNow(), 2500);
  }

  /** Mide y guarda cómo va cada palabra. Con `quick` revisa menos ejemplos para no trabar la pantalla. */
  async trainNow(onProgress?: (done: number, total: number) => void, quick = true): Promise<TrainingSnapshot | null> {
    if (this.training) return null;
    this.training = true;
    this.emit();
    try {
      const r = await this.evaluate(onProgress, quick ? 160 : 400);
      const doubtfulBy = new Map<string, number>();
      for (const d of this.classifier.doubtful) doubtfulBy.set(d.phraseId, (doubtfulBy.get(d.phraseId) ?? 0) + 1);
      const rowBy = new Map(r.rows.map((row) => [row.phraseId, row]));
      const health: WordHealth[] = this.phrases
        .filter((p) => this.sampleCount(p.id) > 0)
        .map((p) => {
          const row = rowBy.get(p.id);
          const accuracy = row && row.total ? row.correct / row.total : null;
          const samples = this.sampleCount(p.id);
          return {
            phraseId: p.id,
            text: p.text,
            samples,
            accuracy,
            tier: tierOf(samples, accuracy, READY_SAMPLES),
            confusedWith: row ? row.confused.slice(0, 2).map((c) => c.text) : [],
            doubtful: doubtfulBy.get(p.id) ?? 0,
          };
        })
        .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));
      const snap: TrainingSnapshot = {
        at: Date.now(),
        words: health.length,
        samples: this.samples.length,
        accuracy: r.total ? r.correct / r.total : null,
        ready: health.filter((h) => h.tier === 'lista').length,
        health,
        transitions: transitionCount(),
      };
      const { previous } = pushSnapshot(snap);
      this.lastTraining = snap;
      this.onTrained?.(snap, previous);
      return snap;
    } finally {
      this.training = false;
      this.emit();
    }
  }

  /** Ejemplos que se dejaron fuera por no parecerse a los demás de su palabra. */
  get doubtfulSamples() {
    return this.classifier.doubtful;
  }

  sampleCount(phraseId: string) {
    return this.samples.filter((s) => s.phraseId === phraseId).length;
  }

  get trainedPhrases() {
    return this.phrases.filter((p) => this.sampleCount(p.id) > 0);
  }

  get ready() {
    return this.classifier.size > 0;
  }

  phrase(id: string) {
    return this.phrases.find((p) => p.id === id);
  }

  /**
   * Con una sola frase preparada no hay con qué compararla: se mide qué tan parecida es la toma a los ejemplos.
   * `ratio` 1 es como un ejemplo propio; mientras más grande, menos se parece.
   */
  async verify(seq: LipSequence): Promise<{ phrase: Phrase; ratio: number; personal: number } | null> {
    const r = this.classifier.closeness(await this.embed(seq));
    const phrase = r && this.phrase(r.phraseId);
    if (!r || !phrase) return null;
    return { phrase, ratio: r.ratio, personal: this.personalCount(phrase.id) };
  }

  /** Cuántos ejemplos de esta frase son de esta persona (los demás vienen del programador). */
  personalCount(phraseId: string) {
    return this.samples.filter((x) => x.phraseId === phraseId && !x.id.startsWith(SHARED_PREFIX)).length;
  }

  /** Hasta cuánto se acepta una palabra sin preguntar; con ejemplos propios se exige más. */
  limitFor(phraseId: string) {
    return this.personalCount(phraseId) >= 3 ? 2.2 : 2.8;
  }

  /**
   * Lee una toma con una o varias palabras seguidas. Cada palabra trae sus alternativas y si es segura;
   * las poco seguras quedan por confirmar en vez de escribirse.
   */
  async decode(seq: LipSequence): Promise<(DecodedWord & { seq: LipSequence })[]> {
    if (this.decoderStale) {
      const valid = new Set(this.phrases.map((p) => p.id));
      this.decoder.fit(this.samples.filter((s) => valid.has(s.phraseId)).map((s) => ({ phraseId: s.phraseId, seq: s.seq })));
      this.decoderStale = false;
    }
    const words = await this.decoder.decode(seq, {
      limitFor: (id) => this.limitFor(id),
      searchFactor: 1.35,
      bonus: (prev, id) => {
        const before = prev ? (this.phrase(prev)?.text ?? null) : null;
        const word = this.phrase(id)?.text ?? '';
        return bigramBonus(before, word) + learnedBonus(before, word);
      },
    });
    return words.map((w) => ({ ...w, seq: sliceSequence(seq, w.start, w.end) }));
  }

  /** Cuánto se movieron los labios en la toma; 0 si se quedó quieta. */
  activity(seq: LipSequence): number {
    return mouthActivity(seq.frames, seq.dims);
  }

  async recognize(seq: LipSequence, threshold: number): Promise<Prediction> {
    const pred = this.classifier.predict(await this.embed(seq), threshold);
    // Con una sola frase entrenada no hay contra qué comparar: siempre se pide confirmar.
    if (this.classifier.phraseCount < 2) pred.ambiguous = true;
    return pred;
  }

  async addSample(phraseId: string, seq: LipSequence, source: Sample['source'] = 'grabacion') {
    const s: Sample = { id: uid(), phraseId, seq, source, createdAt: Date.now() };
    this.samples.push(s);
    await db.putSample(s);
    // Al pasar del máximo se descarta el ejemplo más viejo: la app se adapta a cómo hablas hoy.
    const own = this.samples.filter((x) => x.phraseId === phraseId && !x.id.startsWith(SHARED_PREFIX)).sort((a, b) => a.createdAt - b.createdAt);
    while (own.length > MAX_SAMPLES_PER_PHRASE) {
      const old = own.shift()!;
      this.samples = this.samples.filter((x) => x.id !== old.id);
      await db.deleteSample(old.id);
    }
    await this.retrain();
  }

  /** Agrega varios ejemplos de una frase y entrena una sola vez. */
  async addSamples(phraseId: string, seqs: LipSequence[], source: Sample['source'] = 'grabacion') {
    const base = Date.now();
    for (const [i, seq] of seqs.entries()) {
      const s: Sample = { id: uid(), phraseId, seq, source, createdAt: base + i };
      this.samples.push(s);
      await db.putSample(s);
    }
    const own = this.samples.filter((x) => x.phraseId === phraseId && !x.id.startsWith(SHARED_PREFIX)).sort((a, b) => a.createdAt - b.createdAt);
    while (own.length > MAX_SAMPLES_PER_PHRASE) {
      const old = own.shift()!;
      this.samples = this.samples.filter((x) => x.id !== old.id);
      await db.deleteSample(old.id);
    }
    await this.retrain();
  }

  async clearSamples(phraseId: string) {
    for (const s of this.samples.filter((x) => x.phraseId === phraseId && !x.id.startsWith(SHARED_PREFIX))) await db.deleteSample(s.id);
    this.samples = this.samples.filter((x) => x.phraseId !== phraseId || x.id.startsWith(SHARED_PREFIX));
    await this.retrain();
  }

  /**
   * Pone en este dispositivo las frases y ejemplos que el programador publicó.
   * Los ejemplos compartidos se reemplazan por completo; los que grabó la persona no se tocan.
   */
  async applyShared(items: { key: string; text: string; folder: string; seqs: LipSequence[] }[], removedKeys: string[]) {
    const dropShared = async (key: string) => {
      const prefix = `${SHARED_PREFIX}${key}:`;
      for (const s of this.samples.filter((x) => x.id.startsWith(prefix))) await db.deleteSample(s.id);
      this.samples = this.samples.filter((x) => !x.id.startsWith(prefix));
    };
    for (const it of items) {
      let phrase =
        this.phrases.find((p) => p.text.trim().toLowerCase() === it.key) ??
        (await this.savePhrase({ text: it.text, icon: 'sparkles', category: 'necesidad', folder: it.folder }));
      if (phrase.folder !== it.folder) phrase = await this.savePhrase({ ...phrase, folder: it.folder });
      await dropShared(it.key);
      const now = Date.now();
      for (const [i, seq] of it.seqs.filter((q) => q.dims === FEATURE_DIMS).entries()) {
        const s: Sample = { id: `${SHARED_PREFIX}${it.key}:${i}`, phraseId: phrase.id, seq, source: 'grabacion', createdAt: now + i };
        this.samples.push(s);
        await db.putSample(s);
      }
    }
    for (const key of removedKeys) await dropShared(key);
    await this.retrain();
  }

  /** Mide la precisión con los ejemplos que ya hay: cada uno se clasifica sin contarse a sí mismo. */
  async evaluate(onProgress?: (done: number, total: number) => void, maxQueries = 400) {
    const textOf = (id: string) => this.phrase(id)?.text ?? '?';
    const n = this.classifier.itemCount;
    const stride = n > maxQueries ? Math.ceil(n / maxQueries) : 1;
    const perPhrase = new Map<string, { id: string; total: number; correct: number; confused: Map<string, number> }>();
    let total = 0;
    let correct = 0;
    let done = 0;
    for (let i = 0; i < n; i += stride) {
      const r = this.classifier.leaveOneOut(i);
      done++;
      if (done % 10 === 0) {
        onProgress?.(done, Math.ceil(n / stride));
        await new Promise((res) => setTimeout(res));
      }
      if (!r) continue;
      const name = textOf(r.actual);
      const row = perPhrase.get(name) ?? perPhrase.set(name, { id: r.actual, total: 0, correct: 0, confused: new Map() }).get(name)!;
      row.total++;
      total++;
      if (r.actual === r.predicted) {
        row.correct++;
        correct++;
      } else {
        const other = textOf(r.predicted);
        row.confused.set(other, (row.confused.get(other) ?? 0) + 1);
      }
    }
    const rows = [...perPhrase].map(([text, v]) => ({
      phraseId: v.id,
      text,
      total: v.total,
      correct: v.correct,
      confused: [...v.confused].sort((a, b) => b[1] - a[1]).map(([t, c]) => ({ text: t, count: c })),
    }));
    rows.sort((a, b) => a.correct / a.total - b.correct / b.total);
    return { total, correct, rows, phrasesWithTooFew: this.phrases.filter((p) => this.sampleCount(p.id) === 1).map((p) => p.text) };
  }

  async savePhrase(p: Omit<Phrase, 'id' | 'order' | 'createdAt'> & Partial<Phrase>) {
    const existing = p.id ? this.phrase(p.id) : undefined;
    const full: Phrase = {
      id: existing?.id ?? uid(),
      order: existing?.order ?? Math.max(-1, ...this.phrases.map((x) => x.order)) + 1,
      createdAt: existing?.createdAt ?? Date.now(),
      ...existing,
      ...p,
    } as Phrase;
    await db.putPhrase(full);
    this.phrases = existing ? this.phrases.map((x) => (x.id === full.id ? full : x)) : [...this.phrases, full];
    this.emit();
    return full;
  }

  /** Borra la frase y devuelve una copia para poder deshacer. */
  async deletePhrase(id: string): Promise<PhraseSnapshot | null> {
    const phrase = this.phrase(id);
    if (!phrase) return null;
    const snap: PhraseSnapshot = {
      phrase,
      samples: this.samples.filter((s) => s.phraseId === id),
      audio: phrase.audioId ? await db.audio(phrase.audioId) : undefined,
    };
    await db.deletePhrase(id);
    this.phrases = this.phrases.filter((p) => p.id !== id);
    this.samples = this.samples.filter((s) => s.phraseId !== id);
    await this.retrain();
    return snap;
  }

  async restore(snap: PhraseSnapshot) {
    await db.putPhrase(snap.phrase);
    if (snap.audio && snap.phrase.audioId) await db.putAudio(snap.phrase.audioId, snap.audio);
    for (const s of snap.samples) await db.putSample(s);
    this.phrases = [...this.phrases, snap.phrase].sort((a, b) => a.order - b.order);
    this.samples.push(...snap.samples);
    await this.retrain();
  }

  async setAudio(phraseId: string, blob: Blob | null) {
    const p = this.phrase(phraseId);
    if (!p) return;
    if (p.audioId) await db.deleteAudio(p.audioId);
    let audioId: string | undefined;
    if (blob) {
      audioId = uid();
      await db.putAudio(audioId, blob);
    }
    await this.savePhrase({ ...p, audioId });
  }

  async reload() {
    this.phrases = [];
    this.samples = [];
    await this.load();
  }
}

export const engine = new Engine();
