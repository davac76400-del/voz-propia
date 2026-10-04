import type { FrameFeatures } from './video-processor';
import type { Segment } from './transcriber';

export interface VideoClip {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  frames: FrameFeatures[];
}

const PAD_MS = 150;
const MIN_FRAMES = 8;

/** Corta el video según los tiempos de cada frase dicha. */
export function segmentClips(frames: FrameFeatures[], segments: Segment[]): VideoClip[] {
  const clips: VideoClip[] = [];
  for (const seg of segments) {
    const startMs = seg.start * 1000;
    const endMs = seg.end * 1000;
    const inside = frames.filter((f) => f.t >= startMs - PAD_MS && f.t <= endMs + PAD_MS);
    if (inside.length >= MIN_FRAMES) clips.push({ id: `clip-${clips.length}`, text: seg.text, startMs, endMs, frames: inside });
  }
  return clips;
}

/** Sin audio: separa por pausas de la boca. Las frases quedan vacías para escribirlas a mano. */
export function segmentByMotion(frames: FrameFeatures[]): VideoClip[] {
  if (frames.length < MIN_FRAMES) return [];
  const THRESH = 0.012;
  const PAUSE_MS = 700;
  const MIN_MS = 400;
  const active: boolean[] = [];
  let motion = 0;
  for (let i = 0; i < frames.length; i++) {
    const d = i === 0 ? 0 : Math.abs(frames[i].openness - frames[i - 1].openness);
    motion = motion * 0.5 + d * 0.5;
    active.push(motion > THRESH);
  }
  const clips: VideoClip[] = [];
  let start = -1;
  let lastActive = -1;
  const close = () => {
    if (start < 0) return;
    const seg = frames.slice(start, lastActive + 1);
    if (seg.length >= MIN_FRAMES && seg[seg.length - 1].t - seg[0].t >= MIN_MS) {
      clips.push({ id: `clip-${clips.length}`, text: '', startMs: seg[0].t, endMs: seg[seg.length - 1].t, frames: seg });
    }
    start = -1;
  };
  for (let i = 0; i < frames.length; i++) {
    if (active[i]) {
      if (start < 0) start = i;
      lastActive = i;
    } else if (start >= 0 && frames[i].t - frames[lastActive].t > PAUSE_MS) {
      close();
    }
  }
  close();
  return clips;
}
