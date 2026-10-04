import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jgddkuelxaunustjcqfe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nvRnk3rltdG43D9S1cS3sg_R5EIU2BE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface ProgrammerVideo {
  id?: number;
  text: string;
  start_time: number;
  end_time: number;
  lip_points: unknown;
  created_at?: string;
  imported_by?: string;
}

export async function saveProgrammerVideo(video: ProgrammerVideo): Promise<ProgrammerVideo | null> {
  const { data, error } = await supabase
    .from('programmer_videos')
    .insert([video])
    .select()
    .single();

  if (error) {
    console.error('Error saving video:', error);
    return null;
  }

  return data;
}

export async function getProgrammerVideos(): Promise<ProgrammerVideo[]> {
  const { data, error } = await supabase
    .from('programmer_videos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching videos:', error);
    return [];
  }

  return data || [];
}

export function subscribeToProgrammerVideos(callback: (videos: ProgrammerVideo[]) => void) {
  const subscription = supabase
    .channel('programmer_videos')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'programmer_videos',
      },
      async () => {
        const videos = await getProgrammerVideos();
        callback(videos);
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}
