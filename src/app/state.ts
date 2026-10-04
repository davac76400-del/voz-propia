import { db } from '../core/storage/db';
import { DEFAULT_SETTINGS, type Settings } from '../core/types';

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();

export const state = {
  settings: { ...DEFAULT_SETTINGS } as Settings,
  /** Últimas frases dichas en esta sesión (ids). */
  history: [] as string[],
};

export async function loadSettings() {
  state.settings = await db.settings();
}

export async function updateSettings(patch: Partial<Settings>) {
  state.settings = { ...state.settings, ...patch };
  await db.putSettings(state.settings);
  for (const fn of listeners) fn(state.settings);
}

export function onSettings(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pushHistory(phraseId: string) {
  state.history = [phraseId, ...state.history.filter((id) => id !== phraseId)].slice(0, 6);
}
