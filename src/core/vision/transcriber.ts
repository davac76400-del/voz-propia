export interface Segment {
  text: string;
  /** Segundos. */
  start: number;
  end: number;
}

export type Say = (message: string, pct?: number) => void;

const MODEL = 'Xenova/whisper-base';
const SAMPLE_RATE = 16000;

type Recognizer = (audio: Float32Array, opts: Record<string, unknown>) => Promise<unknown>;
let recognizerPromise: Promise<Recognizer> | null = null;

async function decodeAudio(file: File): Promise<Float32Array | null> {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE)), SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    return (await offline.startRendering()).getChannelData(0);
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

function loadRecognizer(say: Say): Promise<Recognizer> {
  recognizerPromise ??= (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    const files = new Map<string, { loaded: number; total: number }>();
    const make = pipeline as unknown as (task: string, model: string, opts: Record<string, unknown>) => Promise<Recognizer>;
    return make('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== 'progress' || !p.file || !p.total) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        say('Descargando el modelo de voz (solo la primera vez)…', Math.round((loaded / total) * 100));
      },
    });
  })();
  recognizerPromise.catch(() => {
    recognizerPromise = null;
  });
  return recognizerPromise;
}

/** Escucha el audio del video y devuelve frases con su tiempo. Devuelve [] si no hay audio o no se pudo. */
export async function transcribeVideoAudio(file: File, say: Say): Promise<Segment[]> {
  say('Preparando el audio…');
  const audio = await decodeAudio(file);
  if (!audio || audio.length < SAMPLE_RATE) return [];

  const recognizer = await loadRecognizer(say);
  say('Escuchando lo que dices…');
  const out = (await recognizer(audio, {
    language: 'spanish',
    task: 'transcribe',
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  })) as { chunks?: { text: string; timestamp: [number, number | null] }[] } | { chunks?: { text: string; timestamp: [number, number | null] }[] }[];

  const chunks = (Array.isArray(out) ? out[0]?.chunks : out.chunks) ?? [];
  const total = audio.length / SAMPLE_RATE;
  return chunks
    .map((c) => ({
      text: c.text.trim().replace(/^[¿¡]?\s*/, ''),
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1] ?? total,
    }))
    .filter((s) => s.text.length > 0 && s.end > s.start);
}
