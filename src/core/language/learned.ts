import { wordKey } from './spanish';

/**
 * Qué palabras van juntas según lo que la app ha visto: frases que alguien armó al usarla (se guardan)
 * y frases del programador que se pueden partir en palabras ya conocidas (se recalculan cada vez).
 * Sirve de ayuda extra al decodificador; nunca decide sola.
 */
const KEY = 'voz-propia:transiciones';
const START = '#inicio#';
const MAX_BONUS = 0.35;
const SATURATES_AT = 6;

type Pairs = Record<string, number>;

const read = (): Pairs => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Pairs;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};

let usage: Pairs = read();
let seeds: Pairs = {};

const pairKey = (prev: string | null, word: string) => `${prev ? wordKey(prev) : START}>${wordKey(word)}`;

const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(usage));
  } catch {
    /* sin almacenamiento: se aprende solo mientras la página siga abierta */
  }
};

/** Una frase armada y aceptada por la persona: suma una vez cada pareja de palabras seguidas. */
export function recordSentence(texts: string[]) {
  const t = texts.map((x) => x.trim()).filter(Boolean);
  if (!t.length) return;
  for (let i = 0; i < t.length; i++) {
    const k = pairKey(i ? t[i - 1] : null, t[i]);
    usage[k] = (usage[k] ?? 0) + 1;
  }
  save();
}

/** Parejas que salen de partir las frases largas del programador en palabras ya conocidas. */
export function setSeeds(sentences: string[][]) {
  seeds = {};
  for (const s of sentences) {
    for (let i = 0; i < s.length; i++) {
      const k = pairKey(i ? s[i - 1] : null, s[i]);
      seeds[k] = (seeds[k] ?? 0) + 1;
    }
  }
}

/** De 0 a 0.35: cuánto más probable es esta palabra después de la anterior, según lo visto. Nunca resta. */
export function learnedBonus(prev: string | null, word: string): number {
  const k = pairKey(prev, word);
  const c = (usage[k] ?? 0) + (seeds[k] ?? 0);
  return c > 0 ? MAX_BONUS * Math.min(1, Math.log1p(c) / Math.log1p(SATURATES_AT)) : 0;
}

export interface Transition {
  from: string | null;
  to: string;
  count: number;
}

export function topTransitions(n = 8): Transition[] {
  const all = new Map<string, number>();
  for (const src of [usage, seeds]) for (const [k, v] of Object.entries(src)) all.set(k, (all.get(k) ?? 0) + v);
  return [...all]
    .map(([k, count]) => {
      const [from, to] = k.split('>');
      return { from: from === START ? null : from, to, count };
    })
    .filter((t) => t.from !== null)
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export const transitionCount = () => new Set([...Object.keys(usage), ...Object.keys(seeds)]).size;

export function resetLearned() {
  usage = {};
  seeds = {};
  save();
}
