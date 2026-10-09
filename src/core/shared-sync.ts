import { isRaw, unpackRaw, type RemoteRaw } from './vision/raw-store';
import { engine, MAX_SAMPLES_PER_PHRASE } from './engine';
import { keyOf } from './language/key';
import { curateExamples } from './learn/curate';
import { dtw } from './learn/dtw';
import { allRows, dbError, supabase } from './supabase';
import type { LipSequence } from './types';


interface Versions {
  [key: string]: string;
}

const VERSIONS_KEY = 'voz-propia:shared-versions';


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

/** Qué pasó al juntar todas las grabaciones de una palabra. */
export interface PublishSummary {
  text: string;
  /** Repeticiones guardadas de esta palabra, de todas las grabaciones. */
  clips: number;
  recordings: number;
  /** Ejemplos con los que se queda la palabra. */
  kept: number;
  /** Patrones distintos que sirvieron. */
  patterns: number;
}

const MAX_FOR_CURATION = 220;

/**
 * Programador: junta TODAS las grabaciones guardadas de la palabra (de cualquier video), quita las raras y se queda
 * con los mejores ejemplos, repartidos entre las grabaciones, y los publica para que todos los dispositivos los usen.
 */
export async function publishPhrase(text: string): Promise<PublishSummary | null> {
  const key = keyOf(text);
  // Más antiguo primero: la palabra se llama como el primer archivo que se subió.
  const names = await allRows<{ text: string }>((a, b) =>
    supabase.from('programmer_videos').select('text').order('created_at', { ascending: true }).order('id').range(a, b),
  );
  const same = [...new Set(names.map((r) => r.text).filter((t) => keyOf(t) === key))];
  const name = same[0]?.trim() || text.trim();
  const found = same.length
    ? await allRows<{ lip_points: unknown; folder: string; source_name: string | null }>(
        (a, b) => supabase.from('programmer_videos').select('lip_points,folder,source_name').in('text', same).order('id').range(a, b),
        200,
      )
    : [];
  // Una fila dañada no debe romper la palabra entera: solo cuentan las que se pueden leer.
  const all = found.flatMap((r) => {
    const seq = isRaw(r.lip_points) ? unpackRaw(r.lip_points) : null;
    return seq ? [{ ...r, raw: r.lip_points as RemoteRaw, seq }] : [];
  });
  const counts = new Map<string, number>();
  for (const r of all) counts.set(r.folder, (counts.get(r.folder) ?? 0) + 1);
  const folder = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Sin carpeta';

  if (!all.length) {
    const del = await supabase.from('shared_phrases').delete().eq('text_key', key);
    if (del.error) throw dbError(del.error);
    return null;
  }

  // Con demasiadas repeticiones se revisan, repartidas parejo, las que alcanzan para decidir.
  const step = Math.max(1, Math.ceil(all.length / MAX_FOR_CURATION));
  const pool = all.filter((_, i) => i % step === 0);
  const rows = pool.map((r) => r.raw);
  const sources = pool.map((r) => String(r.source_name ?? 'sin nombre'));

  let chosen = rows;
  let patterns = 1;
  if (rows.length > 3) {
    const emb = await Promise.all(pool.map((r) => engine.embed(r.seq)));
    const { L, D } = emb[0];
    const dist = rows.map(() => new Array<number>(rows.length).fill(0));
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) dist[i][j] = dist[j][i] = dtw(emb[i].x, emb[j].x, L, D);
    const cur = curateExamples(sources.map((source) => ({ source })), dist, MAX_SAMPLES_PER_PHRASE);
    chosen = cur.chosen.map((i) => rows[i]);
    patterns = cur.patterns;
  }

  const { error: up } = await supabase
    .from('shared_phrases')
    .upsert({ text_key: key, text: name, folder, samples: chosen, updated_at: new Date().toISOString() }, { onConflict: 'text_key' });
  if (up) throw dbError(up);
  return { text: name, clips: all.length, recordings: new Set(sources).size, kept: chosen.length, patterns };
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
    const seqs = ((full?.samples ?? []) as unknown[]).filter(isRaw).map(unpackRaw).filter((q): q is LipSequence => !!q);
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
