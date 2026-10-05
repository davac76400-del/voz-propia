import type { FrameFeatures } from './video-processor';

export interface Repetition {
  startMs: number;
  endMs: number;
  frames: FrameFeatures[];
}

export type Pause = 'corta' | 'normal' | 'larga';

/** Cuánto silencio de la boca separa una repetición de otra. */
export const PAUSE_MS: Record<Pause, number> = { corta: 90, normal: 160, larga: 320 };

/** Duración mínima del tramo en movimiento, antes de agregar el margen de cada lado. */
const MIN_MS = 120;
const MIN_FRAMES = 8;
const PAD_MS = 120;
const MAX_FRAME_GAP_MS = 220;

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];

function featureEnergy(frames: FrameFeatures[]): number[] {
  return frames.map((f, i) => {
    if (i === 0) return 0;
    const a = frames[i - 1].features;
    const b = f.features;
    let s = 0;
    for (let d = 0; d < b.length; d++) {
      const v = b[d] - a[d];
      s += v * v;
    }
    return Math.sqrt(s);
  });
}

function smooth(v: number[]): number[] {
  return v.map((_, i) => (v[Math.max(0, i - 1)] + 2 * v[i] + v[Math.min(v.length - 1, i + 1)]) / 4);
}

/**
 * Separa un video en las veces que se dijo la frase. Una repetición es un tramo en que la boca se mueve,
 * entre pausas en que se queda quieta o cerrada.
 */
export function splitRepetitions(frames: FrameFeatures[], pause: Pause = 'normal'): Repetition[] {
  if (frames.length < MIN_FRAMES) return [];

  const opening = smooth(frames.map((f) => f.openness));
  const energy = smooth(featureEnergy(frames));
  const sortedOpen = [...opening].sort((a, b) => a - b);
  const openRange = percentile(sortedOpen, 0.9) - percentile(sortedOpen, 0.1);
  // Con la boca casi quieta en apertura se usa el movimiento de todos los rasgos.
  const useOpening = openRange >= 0.05;
  const signal = useOpening ? opening : energy;
  const sorted = [...signal].sort((a, b) => a - b);
  const lo = percentile(sorted, 0.1);
  const hi = percentile(sorted, 0.9);
  const range = hi - lo;
  if (range <= 1e-6) return [];

  const enter = lo + range * 0.4;
  const leave = lo + range * 0.25;
  const gapMs = PAUSE_MS[pause];

  interface Run {
    a: number;
    b: number;
  }
  const runs: Run[] = [];
  let start = -1;
  for (let i = 0; i < frames.length; i++) {
    if (start < 0) {
      if (signal[i] > enter) start = i;
    } else if (signal[i] < leave) {
      runs.push({ a: start, b: i - 1 });
      start = -1;
    }
  }
  if (start >= 0) runs.push({ a: start, b: frames.length - 1 });

  const merged: Run[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev && frames[r.a].t - frames[prev.b].t < gapMs) prev.b = r.b;
    else merged.push({ ...r });
  }

  const durations = merged.map((r) => frames[r.b].t - frames[r.a].t).sort((a, b) => a - b);
  const medianDur = durations.length ? durations[Math.floor(durations.length / 2)] : 0;

  // Un tramo mucho más largo que los demás suele ser varias repeticiones sin pausa: se corta en sus valles.
  const pieces: Run[] = [];
  for (const r of merged) {
    const dur = frames[r.b].t - frames[r.a].t;
    if (dur > 1500 && dur > medianDur * 2.2 && merged.length > 1) pieces.push(...splitAtValleys(r, signal, frames, lo + range * 0.55));
    else pieces.push(r);
  }

  const out: Repetition[] = [];
  for (let k = 0; k < pieces.length; k++) {
    const r = pieces[k];
    const t0 = frames[r.a].t;
    const t1 = frames[r.b].t;
    if (t1 - t0 < MIN_MS) continue;
    const prevEnd = k > 0 ? frames[pieces[k - 1].b].t : -Infinity;
    const nextStart = k < pieces.length - 1 ? frames[pieces[k + 1].a].t : Infinity;
    const from = Math.max(t0 - PAD_MS, (prevEnd + t0) / 2);
    const to = Math.min(t1 + PAD_MS, (t1 + nextStart) / 2);
    const inside = frames.filter((f) => f.t >= from && f.t <= to);
    if (inside.length < MIN_FRAMES) continue;
    let gap = 0;
    for (let i = 1; i < inside.length; i++) gap = Math.max(gap, inside[i].t - inside[i - 1].t);
    if (gap > MAX_FRAME_GAP_MS) continue;
    out.push({ startMs: inside[0].t, endMs: inside[inside.length - 1].t, frames: inside });
  }
  return out;
}

function splitAtValleys(r: { a: number; b: number }, signal: number[], frames: FrameFeatures[], valleyLevel: number) {
  const cuts: number[] = [];
  for (let i = r.a + 2; i < r.b - 2; i++) {
    const isMin = signal[i] <= signal[i - 1] && signal[i] <= signal[i + 1] && signal[i] < valleyLevel;
    if (isMin && frames[i].t - frames[r.a].t > MIN_MS && (cuts.length === 0 || frames[i].t - frames[cuts[cuts.length - 1]].t > MIN_MS)) cuts.push(i);
  }
  if (!cuts.length) return [r];
  const out: { a: number; b: number }[] = [];
  let a = r.a;
  for (const c of cuts) {
    out.push({ a, b: c });
    a = c + 1;
  }
  out.push({ a, b: r.b });
  return out;
}

/** Línea de la apertura de la boca para ver de un vistazo cómo se movió. */
export function sparkline(frames: FrameFeatures[], w = 84, h = 26): string {
  if (frames.length < 2) return '';
  const t0 = frames[0].t;
  const span = frames[frames.length - 1].t - t0 || 1;
  const vals = frames.map((f) => f.openness);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const range = hi - lo || 1;
  return frames
    .map((f, i) => `${i === 0 ? 'M' : 'L'}${(((f.t - t0) / span) * w).toFixed(1)} ${(h - 2 - ((f.openness - lo) / range) * (h - 4)).toFixed(1)}`)
    .join(' ');
}
