/** Historial del entrenamiento: cuánto sabe la app con los ejemplos que lleva y cómo cambió en el tiempo. */

export type WordTier = 'nueva' | 'mejorando' | 'lista';

export interface WordHealth {
  phraseId: string;
  text: string;
  samples: number;
  /** Aciertos al probar cada ejemplo contra los demás (0 a 1); null si aún no se puede medir. */
  accuracy: number | null;
  tier: WordTier;
  confusedWith: string[];
  /** Ejemplos que se parecen poco a los demás de la misma palabra y se dejaron fuera. */
  doubtful: number;
}

export interface TrainingSnapshot {
  at: number;
  words: number;
  samples: number;
  /** Aciertos globales (0 a 1); null si todavía no hay con qué medir. */
  accuracy: number | null;
  ready: number;
  health: WordHealth[];
  transitions: number;
}

const KEY = 'voz-propia:entrenamiento';
const KEEP = 40;

export const READY_ACCURACY = 0.9;

export function tierOf(samples: number, accuracy: number | null, readySamples: number): WordTier {
  if (samples < readySamples) return 'nueva';
  return accuracy !== null && accuracy >= READY_ACCURACY ? 'lista' : 'mejorando';
}

export function readHistory(): TrainingSnapshot[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as TrainingSnapshot[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function pushSnapshot(s: TrainingSnapshot): { previous: TrainingSnapshot | null } {
  const h = readHistory();
  const previous = h[h.length - 1] ?? null;
  h.push(s);
  try {
    // Se guarda sin el detalle por palabra salvo en la última medición: así pesa poco.
    const slim = h.slice(-KEEP).map((x, i, a) => (i === a.length - 1 ? x : { ...x, health: [] }));
    localStorage.setItem(KEY, JSON.stringify(slim));
  } catch {
    /* sin almacenamiento: el historial dura lo que dure la página */
  }
  return { previous };
}
