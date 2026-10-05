import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jgddkuelxaunustjcqfe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nvRnk3rltdG43D9S1cS3sg_R5EIU2BE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const DEFAULT_FOLDER = 'Sin carpeta';

export interface DevClip {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
  frame_count: number;
  folder: string;
  source_name: string | null;
  created_at: string;
  /** Nombre que tenía antes de fusionarse con otra frase; sirve para desfusionar. */
  orig_text: string | null;
}

export interface NewDevClip {
  text: string;
  start_time: number;
  end_time: number;
  frame_count: number;
  folder: string;
  source_name: string;
  lip_points: unknown;
}

const LIGHT_COLUMNS = 'id,text,start_time,end_time,frame_count,folder,source_name,created_at,orig_text';

export async function listClips(): Promise<DevClip[]> {
  const { data, error } = await supabase
    .from('programmer_videos')
    .select(LIGHT_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DevClip[];
}

export async function listFolders(): Promise<string[]> {
  const { data, error } = await supabase.from('programmer_folders').select('name').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.name as string);
}

export async function createFolder(name: string): Promise<void> {
  const { error } = await supabase.from('programmer_folders').insert([{ name }]);
  if (error) throw new Error(error.message);
}

export async function deleteFolder(name: string): Promise<void> {
  const moved = await supabase.from('programmer_videos').update({ folder: DEFAULT_FOLDER }).eq('folder', name);
  if (moved.error) throw new Error(moved.error.message);
  const { error } = await supabase.from('programmer_folders').delete().eq('name', name);
  if (error) throw new Error(error.message);
}

export async function insertClips(clips: NewDevClip[]): Promise<void> {
  const { error } = await supabase.from('programmer_videos').insert(clips);
  if (error) throw new Error(error.message);
}

export async function deleteClips(ids: number[]): Promise<void> {
  const { error } = await supabase.from('programmer_videos').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

export async function moveClips(ids: number[], folder: string): Promise<void> {
  const { error } = await supabase.from('programmer_videos').update({ folder }).in('id', ids);
  if (error) throw new Error(error.message);
}

export function watchDevData(onChange: () => void): () => void {
  let timer = 0;
  const ping = () => {
    clearTimeout(timer);
    timer = window.setTimeout(onChange, 150);
  };
  const channel = supabase
    .channel('dev-panel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'programmer_videos' }, ping)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'programmer_folders' }, ping)
    .subscribe();
  return () => {
    clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}

/** Fusiona frases: los ejemplos de `from` pasan a llamarse como `into`, recordando su nombre anterior. */
export async function mergeClips(from: DevClip[], intoText: string, intoFolder: string): Promise<void> {
  const groups = new Map<string, { ids: number[]; orig: string }>();
  for (const c of from) {
    const orig = c.orig_text ?? c.text;
    const key = orig;
    const g = groups.get(key) ?? groups.set(key, { ids: [], orig }).get(key)!;
    g.ids.push(c.id);
  }
  for (const g of groups.values()) {
    const { error } = await supabase
      .from('programmer_videos')
      .update({ text: intoText, orig_text: g.orig.trim().toLowerCase() === intoText.trim().toLowerCase() ? null : g.orig, folder: intoFolder })
      .in('id', g.ids);
    if (error) throw new Error(error.message);
  }
}

/** Devuelve cada ejemplo fusionado a la frase que era antes. */
export async function unmergeClips(clips: DevClip[]): Promise<void> {
  const groups = new Map<string, number[]>();
  for (const c of clips) {
    if (!c.orig_text) continue;
    (groups.get(c.orig_text) ?? groups.set(c.orig_text, []).get(c.orig_text)!).push(c.id);
  }
  for (const [orig, ids] of groups) {
    const { error } = await supabase.from('programmer_videos').update({ text: orig, orig_text: null }).in('id', ids);
    if (error) throw new Error(error.message);
  }
}

/** Deja los ejemplos exactamente como estaban antes de una fusión (para «Deshacer»). */
export async function restoreClips(prev: DevClip[]): Promise<void> {
  const groups = new Map<string, { ids: number[]; text: string; orig: string | null; folder: string }>();
  for (const c of prev) {
    const k = JSON.stringify([c.text, c.orig_text, c.folder]);
    const g = groups.get(k) ?? groups.set(k, { ids: [], text: c.text, orig: c.orig_text, folder: c.folder }).get(k)!;
    g.ids.push(c.id);
  }
  for (const g of groups.values()) {
    const { error } = await supabase.from('programmer_videos').update({ text: g.text, orig_text: g.orig, folder: g.folder }).in('id', g.ids);
    if (error) throw new Error(error.message);
  }
}
