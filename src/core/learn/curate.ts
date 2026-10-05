import { clusterBySimilarity, MIN_PATTERN_REPEATS, patternRadius } from '../vision/pattern-check';

/**
 * Elige los mejores ejemplos de una palabra cuando hay muchos, de varias grabaciones juntas.
 *
 * - Agrupa los que se ven iguales y se queda con los patrones que se repiten varias veces; los raros se descartan.
 * - Entre los que se quedan, escoge los más representativos (los más centrales de su patrón).
 * - Reparte los lugares entre las grabaciones (cada una es otro día, otra luz u otra persona), para que la palabra
 *   quede bien en todas las condiciones y no solo en la grabación que más veces se repitió.
 */

export interface Clip {
  /** Grabación de la que salió (nombre del archivo o de la persona). */
  source: string;
}

export interface Curation {
  /** Índices de los ejemplos que se quedan, en el orden original. */
  chosen: number[];
  /** Ejemplos que se descartaron y por qué. */
  dropped: { index: number; why: 'raro' | 'pocas' | 'sobra' }[];
  /** Cuántos patrones distintos sirvieron. */
  patterns: number;
  perSource: Record<string, { total: number; kept: number }>;
}

/** Cuántos lugares le toca a cada grupo, en proporción a su tamaño y con al menos uno. */
function allocate(sizes: number[], total: number): number[] {
  const sum = sizes.reduce((a, b) => a + b, 0);
  const base = sizes.map((s) => Math.min(s, Math.max(1, Math.floor((s / sum) * total))));
  let left = total - base.reduce((a, b) => a + b, 0);
  const order = sizes.map((s, i) => ({ i, frac: (s / sum) * total - Math.floor((s / sum) * total) })).sort((a, b) => b.frac - a.frac);
  for (let round = 0; left > 0 && round < 4; round++) {
    for (const { i } of order) {
      if (left > 0 && base[i] < sizes[i]) {
        base[i]++;
        left--;
      }
    }
  }
  return base;
}

/** Dentro de un grupo: de cada grabación, por turnos, el más central que falte (los más representativos). */
function pickFromCluster(members: number[], clips: Clip[], dist: number[][], slots: number): number[] {
  if (slots >= members.length) return members;
  const meanTo = (i: number) => members.reduce((s, j) => s + dist[i][j], 0) / members.length;
  const central = [...members].sort((a, b) => meanTo(a) - meanTo(b));
  const bySource = new Map<string, number[]>();
  for (const i of central) (bySource.get(clips[i].source) ?? bySource.set(clips[i].source, []).get(clips[i].source)!).push(i);
  // Las grabaciones cuyo mejor ejemplo es más central van primero.
  const sources = [...bySource.keys()].sort((a, b) => central.indexOf(bySource.get(a)![0]) - central.indexOf(bySource.get(b)![0]));
  const chosen: number[] = [];
  const next = new Map(sources.map((src) => [src, 0]));
  while (chosen.length < slots) {
    let progressed = false;
    for (const src of sources) {
      if (chosen.length >= slots) break;
      const k = next.get(src)!;
      const list = bySource.get(src)!;
      if (k >= list.length) continue;
      chosen.push(list[k]);
      next.set(src, k + 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  return chosen;
}

export function curateExamples(clips: Clip[], dist: number[][], max: number): Curation {
  const n = clips.length;
  const all = clips.map((_, i) => i);
  const perSource: Curation['perSource'] = {};
  for (const c of clips) (perSource[c.source] ??= { total: 0, kept: 0 }).total++;
  const finish = (chosen: number[], dropped: Curation['dropped'], patterns: number): Curation => {
    chosen.sort((a, b) => a - b);
    for (const i of chosen) perSource[clips[i].source].kept++;
    return { chosen, dropped, patterns, perSource };
  };
  if (n <= 3) return finish(all, [], n ? 1 : 0);

  const groups = clusterBySimilarity(dist, all, patternRadius(dist, all));
  let good = groups.filter((g) => g.length >= MIN_PATTERN_REPEATS);
  // Si ningún grupo se repite lo suficiente, se toma el más grande en vez de dejar la palabra vacía.
  if (!good.length) good = [groups[0]];
  const dropped: Curation['dropped'] = groups.filter((g) => !good.includes(g)).flatMap((g) => g.map((index) => ({ index, why: (g.length === 1 ? 'raro' : 'pocas') as 'raro' | 'pocas' })));

  const pool = good.reduce((s, g) => s + g.length, 0);
  const total = Math.min(max, pool);
  const slots = allocate(good.map((g) => g.length), total);
  const chosen: number[] = [];
  good.forEach((g, k) => {
    const picked = pickFromCluster(g, clips, dist, slots[k]);
    chosen.push(...picked);
    for (const i of g) if (!picked.includes(i)) dropped.push({ index: i, why: 'sobra' });
  });
  return finish(chosen, dropped, good.length);
}
