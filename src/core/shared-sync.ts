import { engine, MAX_SAMPLES_PER_PHRASE } from './engine';
import { dtw } from './learn/dtw';
import { supabase } from './supabase';
import type { LipSequence } from './types';

interface RemoteSeq {
  dims: number;
  fps: number;
  frames: number[];
}

interface Versions {
  [key: string]: string;
}

const VERSIONS_KEY = 'voz-propia:shared-versions';
const keyOf = (text: string) => text.trim().toLowerCase();
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const toSeq = (r: RemoteSeq): LipSequence => ({ dims: r.dims, fps: r.fps, frames: Float32Array.from(r.frames) });

function readVersions(): Versions {
  try {
    return JSON.parse(localStorage.getItem(VERSIONS_KEY) ?? '{}') as Versions;
  } catch {
    return {};
  }
}

function writeVersions(v: Versions) {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(v));
  } catch {
    /* sin almacenamiento: en la próxima visita se vuelve a descargar */
  }
}

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/**
 * Programador: reúne todos los ejemplos guardados de una frase, se queda con los más representativos
 * y los publica para que todos los dispositivos los usen.
 */
export async function publishPhrase(text: string): Promise<void> {
  const key = keyOf(text);
  const { data, error } = await supabase.from('programmer_videos').select('lip_points,folder').ilike('text', escapeLike(text.trim()));
  if (error) throw new Error(error.message);
  const all = (data ?? []).filter((r) => (r.lip_points as RemoteSeq)?.frames?.length);
  const rows = all.map((r) => r.lip_points as RemoteSeq);
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.folder as string, (counts.get(r.folder as string) ?? 0) + 1);
  const folder = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sin carpeta';

  if (!rows.length) {
    const del = await supabase.from('shared_phrases').delete().eq('text_key', key);
    if (del.error) throw new Error(del.error.message);
    return;
  }

  let chosen = rows;
  if (rows.length > MAX_SAMPLES_PER_PHRASE) {
    const emb = await Promise.all(rows.map((r) => engine.embed(toSeq(r))));
    const { L, D } = emb[0];
    const step = Math.max(1, Math.ceil((rows.length - 1) / 30));
    const scores = emb.map((e, i) => median(emb.filter((_, j) => j !== i && (j % step === 0 || step === 1)).map((o) => dtw(e.x, o.x, L, D))));
    chosen = scores
      .map((score, i) => ({ score, i }))
      .sort((a, b) => a.score - b.score)
      .slice(0, MAX_SAMPLES_PER_PHRASE)
      .map(({ i }) => rows[i]);
  }

  const { error: up } = await supabase
    .from('shared_phrases')
    .upsert({ text_key: key, text: text.trim(), folder, samples: chosen, updated_at: new Date().toISOString() }, { onConflict: 'text_key' });
  if (up) throw new Error(up.message);
}

let running: Promise<void> | null = null;
let again = false;

/** Todos los dispositivos: baja lo que el programador publicó y lo pone en el motor. Sin internet no hace nada. */
export function syncShared(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } catch (err) {
      console.warn('No se pudo sincronizar con el programador:', err);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce() {
  const { data, error } = await supabase.from('shared_phrases').select('text_key,text,folder,updated_at');
  if (error) throw new Error(error.message);
  const remote = data ?? [];
  // Si el navegador borró los ejemplos locales pero recuerda versiones, se vuelve a descargar todo.
  const hasLocal = engine.samples.some((x) => x.id.startsWith('shared:'));
  const known = hasLocal ? readVersions() : {};
  const remoteKeys = new Set(remote.map((r) => r.text_key as string));

  const changed = remote.filter((r) => known[r.text_key as string] !== r.updated_at);
  const removed = Object.keys(known).filter((k) => !remoteKeys.has(k));
  if (!changed.length && !removed.length) return;

  const items: { key: string; text: string; folder: string; seqs: LipSequence[] }[] = [];
  for (const r of changed) {
    const { data: full, error: e2 } = await supabase.from('shared_phrases').select('samples').eq('text_key', r.text_key).single();
    if (e2) throw new Error(e2.message);
    const seqs = ((full?.samples ?? []) as RemoteSeq[]).filter((s) => s?.frames?.length).map(toSeq);
    items.push({ key: r.text_key as string, text: r.text as string, folder: (r.folder as string) || 'Sin carpeta', seqs });
  }

  await engine.applyShared(items, removed);

  const next: Versions = {};
  for (const r of remote) next[r.text_key as string] = r.updated_at as string;
  writeVersions(next);
}

/** Escucha cambios del programador y los aplica al momento. */
export function watchShared(): () => void {
  let timer = 0;
  const channel = supabase
    .channel('shared-phrases')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_phrases' }, () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => void syncShared(), 400);
    })
    .subscribe();
  return () => {
    clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
