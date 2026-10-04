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

const LIGHT_COLUMNS = 'id,text,start_time,end_time,frame_count,folder,source_name,created_at';

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
