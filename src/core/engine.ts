import { FewShotClassifier, type Embedded } from './learn/classifier';
import { NeuralEncoder } from './learn/neural-encoder';
import { resample, TARGET_LEN, trimStill, withDeltas } from './learn/sequence';
import { db, uid } from './storage/db';
import type { LipSequence, Phrase, Prediction, Sample } from './types';
import { DEFAULT_PHRASES } from '../data/default-phrases';

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
    this.samples = await db.samples();
    await this.retrain();
    void this.tryNeural();
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
    const T = seq.frames.length / D;
    const trimmed = trimStill(seq.frames, T, D);
    const fixed = resample(trimmed.x, trimmed.T, D);
    if (this.neural) {
      const out = await this.neural.embed(fixed, TARGET_LEN, D);
      return { x: out.x, L: TARGET_LEN, D: out.D };
    }
    return { x: withDeltas(fixed, TARGET_LEN, D), L: TARGET_LEN, D: D * 2 };
  }

  private async retrain() {
    const valid = new Set(this.phrases.map((p) => p.id));
    const embedded = await Promise.all(
      this.samples.filter((s) => valid.has(s.phraseId)).map(async (s) => ({ phraseId: s.phraseId, emb: await this.embed(s.seq) })),
    );
    this.classifier.fit(embedded);
    this.emit();
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
  async applyShared(items: { key: string; text: string; seqs: LipSequence[] }[], removedKeys: string[]) {
    const dropShared = async (key: string) => {
      const prefix = `${SHARED_PREFIX}${key}:`;
      for (const s of this.samples.filter((x) => x.id.startsWith(prefix))) await db.deleteSample(s.id);
      this.samples = this.samples.filter((x) => !x.id.startsWith(prefix));
    };
    for (const it of items) {
      const phrase =
        this.phrases.find((p) => p.text.trim().toLowerCase() === it.key) ??
        (await this.savePhrase({ text: it.text, icon: 'sparkles', category: 'necesidad' }));
      await dropShared(it.key);
      const now = Date.now();
      for (const [i, seq] of it.seqs.entries()) {
        const s: Sample = { id: `${SHARED_PREFIX}${it.key}:${i}`, phraseId: phrase.id, seq, source: 'grabacion', createdAt: now + i };
        this.samples.push(s);
        await db.putSample(s);
      }
    }
    for (const key of removedKeys) await dropShared(key);
    await this.retrain();
  }

  /** Mide la precisión con los ejemplos que ya hay: cada uno se clasifica sin contarse a sí mismo. */
  async evaluate(onProgress?: (done: number, total: number) => void) {
    const textOf = (id: string) => this.phrase(id)?.text ?? '?';
    const n = this.classifier.itemCount;
    const stride = n > 400 ? Math.ceil(n / 400) : 1;
    const perPhrase = new Map<string, { total: number; correct: number; confused: Map<string, number> }>();
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
      const row = perPhrase.get(name) ?? perPhrase.set(name, { total: 0, correct: 0, confused: new Map() }).get(name)!;
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
