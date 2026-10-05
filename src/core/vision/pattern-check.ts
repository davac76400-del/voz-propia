/**
 * Revisión de patrones de un video con la misma palabra repetida muchas veces. Solo mira los labios.
 *
 * - Agrupa las repeticiones que se ven iguales (un «patrón»).
 * - Un patrón sirve si se repite varias veces y al menos dos seguidas; los que salen una o dos veces se descartan.
 * - Descarta las repeticiones donde el video se trabó (cuadros repetidos) o que duran mucho más o menos que las demás.
 * - Mide cada cuánto se dice la palabra.
 */

/** Veces mínimas que debe repetirse un patrón para usarse. */
export const MIN_PATTERN_REPEATS = 3;
/** Veces seguidas mínimas (sin otra cosa en medio). */
export const MIN_PATTERN_RUN = 2;
/**
 * Un patrón agrupa a las repeticiones a menos de tantas veces la distancia a su vecina más cercana, medida en las
 * repeticiones que mejor se parecen entre sí (el cuartil bajo), para que las raras no vuelvan flojo el criterio.
 */
const RADIUS_FACTOR = 2.2;
const RADIUS_QUANTILE = 0.3;
/** Más cuadros repetidos que esto en una repetición significa que el video se trabó. */
const STALL_RATIO = 0.2;
const DURATION_HIGH = 2.5;
const DURATION_LOW = 0.4;
/** Una pausa más larga que esto, respecto a lo normal, indica un corte o un descanso. */
const LONG_GAP = 2.5;

export interface RepInput {
  startMs: number;
  endMs: number;
  /** Fracción de cuadros idénticos al anterior (0 a 1): sube cuando el video se traba. */
  stallRatio: number;
}

export type Reason = 'raro' | 'pocas' | 'trabado' | 'duracion';

export interface RepVerdict {
  /** Letra del patrón (A, B…), de mayor a menor número de repeticiones. */
  pattern: string;
  ok: boolean;
  reason: Reason | null;
}

export interface PatternCluster {
  label: string;
  members: number[];
  longestRun: number;
  accepted: boolean;
}

export interface PatternReport {
  verdicts: RepVerdict[];
  clusters: PatternCluster[];
  cadence: { medianMs: number; regular: boolean } | null;
  longGaps: number;
  /** Con menos de 4 repeticiones no hay con qué comparar. */
  tooFew: boolean;
  /** Ningún patrón se repitió lo suficiente. */
  noClearPattern: boolean;
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function longestRun(members: Set<number>, n: number) {
  let best = 0;
  let cur = 0;
  for (let i = 0; i < n; i++) {
    cur = members.has(i) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}


/** Radio dentro del cual dos repeticiones se consideran del mismo patrón. */
export function patternRadius(dist: number[][], indices: number[]): number {
  const nearest = indices.map((i) => Math.min(...indices.map((j) => (j === i ? Infinity : dist[i][j]))));
  const sorted = nearest.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1e-6;
  return Math.max(sorted[Math.floor(RADIUS_QUANTILE * (sorted.length - 1))] * RADIUS_FACTOR, 1e-6);
}

/** Agrupa las repeticiones que se ven iguales. Devuelve los grupos de índices, el primero es el más numeroso. */
export function clusterBySimilarity(dist: number[][], indices: number[], radius: number): number[][] {
  const left = new Set(indices);
  const groups: number[][] = [];
  while (left.size) {
    let center = -1;
    let bestCount = -1;
    let bestMean = Infinity;
    for (const i of left) {
      const near = [...left].filter((j) => dist[i][j] <= radius);
      const mean = near.reduce((s, j) => s + dist[i][j], 0) / near.length;
      if (near.length > bestCount || (near.length === bestCount && mean < bestMean)) {
        center = i;
        bestCount = near.length;
        bestMean = mean;
      }
    }
    const members = [...left].filter((j) => dist[center][j] <= radius).sort((a, b) => a - b);
    members.forEach((j) => left.delete(j));
    groups.push(members);
  }
  return groups.sort((a, b) => b.length - a.length);
}

/** `dist[i][j]` es qué tan distintas se ven las repeticiones i y j (0 = iguales). */
export function checkPatterns(reps: RepInput[], dist: number[][]): PatternReport {
  const n = reps.length;
  const verdicts: RepVerdict[] = reps.map(() => ({ pattern: '-', ok: true, reason: null }));
  const empty: PatternReport = { verdicts, clusters: [], cadence: null, longGaps: 0, tooFew: n < 4, noClearPattern: false };
  if (n === 0) return empty;

  // Cadencia: cada cuánto empieza una repetición nueva.
  const starts = reps.map((r) => r.startMs);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  let cadence: PatternReport['cadence'] = null;
  let longGaps = 0;
  if (gaps.length >= 2) {
    const m = median(gaps);
    const dev = median(gaps.map((g) => Math.abs(g - m)));
    cadence = { medianMs: m, regular: m > 0 && dev / m < 0.25 };
    longGaps = gaps.filter((g) => g > m * LONG_GAP).length;
  }

  // Duración y video trabado: se revisan siempre, aunque haya pocas repeticiones.
  const durations = reps.map((r) => r.endMs - r.startMs);
  const typicalDur = median(durations);
  reps.forEach((r, i) => {
    if (r.stallRatio > STALL_RATIO) verdicts[i] = { pattern: '-', ok: false, reason: 'trabado' };
    else if (n >= 4 && (durations[i] > typicalDur * DURATION_HIGH || durations[i] < typicalDur * DURATION_LOW)) verdicts[i] = { pattern: '-', ok: false, reason: 'duracion' };
  });

  if (n < 4) return { ...empty, cadence, longGaps };

  // Patrones: se parte de la repetición con más parecidas cerca, y se repite con las que quedan.
  const candidates = reps.map((_, i) => i).filter((i) => verdicts[i].reason !== 'trabado' && verdicts[i].reason !== 'duracion');
  const radius = patternRadius(dist, candidates);
  const clusters: PatternCluster[] = clusterBySimilarity(dist, candidates, radius).map((members) => {
    const run = longestRun(new Set(members), n);
    return { label: '', members, longestRun: run, accepted: members.length >= MIN_PATTERN_REPEATS && run >= MIN_PATTERN_RUN };
  });
  clusters.sort((a, b) => b.members.length - a.members.length);
  clusters.forEach((c, k) => {
    c.label = LABELS[k] ?? String(k + 1);
    for (const j of c.members) verdicts[j] = c.accepted ? { pattern: c.label, ok: true, reason: null } : { pattern: c.label, ok: false, reason: c.members.length === 1 ? 'raro' : 'pocas' };
  });
  return { verdicts, clusters, cadence, longGaps, tooFew: false, noClearPattern: !clusters.some((c) => c.accepted) };
}

/** Fracción de cuadros idénticos al anterior: cuando el video se traba, el mismo cuadro se repite. */
export function stallRatio(raws: Int16Array[]): number {
  if (raws.length < 2) return 0;
  let same = 0;
  for (let i = 1; i < raws.length; i++) {
    const a = raws[i - 1];
    const b = raws[i];
    let equal = a.length === b.length;
    for (let d = 0; equal && d < a.length; d++) if (a[d] !== b[d]) equal = false;
    if (equal) same++;
  }
  return same / (raws.length - 1);
}

export const REASON_TEXT: Record<Reason, string> = {
  raro: 'se ve distinta a las demás',
  pocas: 'ese patrón se repite muy pocas veces',
  trabado: 'el video se trabó aquí',
  duracion: 'dura mucho más o menos que las demás',
};
