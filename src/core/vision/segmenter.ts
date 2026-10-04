import type { FrameLandmarks } from './video-processor';
import type { Segment } from './transcriber';

export interface VideoClip {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
  lipPoints: FrameLandmarks[];
}

export function segmentClips(frames: FrameLandmarks[], segments: Segment[]): VideoClip[] {
  const clips: VideoClip[] = [];

  segments.forEach((seg) => {
    if (!seg.text.trim()) return;

    const startMs = seg.start * 1000;
    const endMs = seg.end * 1000;

    const clipFrames = frames.filter((f) => f.timestamp >= startMs && f.timestamp <= endMs);

    if (clipFrames.length > 0) {
      clips.push({
        id: `clip-${clips.length}`,
        text: seg.text.trim(),
        startTime: startMs,
        endTime: endMs,
        startFrame: clipFrames[0].frameIndex,
        endFrame: clipFrames[clipFrames.length - 1].frameIndex,
        lipPoints: clipFrames,
      });
    }
  });

  return clips;
}