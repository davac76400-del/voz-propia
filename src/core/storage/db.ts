import { DEFAULT_SETTINGS, type Phrase, type Sample, type Settings } from '../types';

const DB_NAME = 'voz-propia';
const DB_VERSION = 1;

type StoreName = 'phrases' | 'samples' | 'audio' | 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onblocked = () => reject(new Error('IndexedDB bloqueado'));
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('phrases', { keyPath: 'id' });
      db.createObjectStore('samples', { keyPath: 'id' }).createIndex('phraseId', 'phraseId');
      db.createObjectStore('audio');
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name: StoreName, mode: IDBTransactionMode = 'readonly') {
  return (await open()).transaction(name, mode).objectStore(name);
}

export const uid = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Respaldo en memoria si el navegador bloquea IndexedDB (modo privado, iframes): la app sigue funcionando. */
const mem = {
  phrases: new Map<string, Phrase>(),
  samples: new Map<string, Sample>(),
  audio: new Map<string, Blob>(),
  settings: null as Settings | null,
};
let backend: Promise<'idb' | 'mem'> | null = null;
const useMemory = async () =>
  (await (backend ??= open().then(
    () => 'idb' as const,
    () => 'mem' as const,
  ))) === 'mem';

const idb = {
  async phrases(): Promise<Phrase[]> {
    const all = await wrap((await store('phrases')).getAll() as IDBRequest<Phrase[]>);
    return all.sort((a, b) => a.order - b.order);
  },
  async putPhrase(p: Phrase) {
    await wrap((await store('phrases', 'readwrite')).put(p));
  },
  async deletePhrase(id: string) {
    const d = await open();
    const tx = d.transaction(['phrases', 'samples', 'audio'], 'readwrite');
    const phrase = await wrap(tx.objectStore('phrases').get(id) as IDBRequest<Phrase | undefined>);
    tx.objectStore('phrases').delete(id);
    if (phrase?.audioId) tx.objectStore('audio').delete(phrase.audioId);
    const keys = await wrap(tx.objectStore('samples').index('phraseId').getAllKeys(id));
    for (const k of keys) tx.objectStore('samples').delete(k);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },

  async samples(): Promise<Sample[]> {
    return wrap((await store('samples')).getAll() as IDBRequest<Sample[]>);
  },
  async putSample(s: Sample) {
    await wrap((await store('samples', 'readwrite')).put(s));
  },
  async deleteSample(id: string) {
    await wrap((await store('samples', 'readwrite')).delete(id));
  },

  async audio(id: string): Promise<Blob | undefined> {
    return wrap((await store('audio')).get(id) as IDBRequest<Blob | undefined>);
  },
  async putAudio(id: string, blob: Blob) {
    await wrap((await store('audio', 'readwrite')).put(blob, id));
  },
  async deleteAudio(id: string) {
    await wrap((await store('audio', 'readwrite')).delete(id));
  },

  async settings(): Promise<Settings> {
    const saved = await wrap((await store('kv')).get('settings') as IDBRequest<Partial<Settings> | undefined>);
    return { ...DEFAULT_SETTINGS, ...saved };
  },
  async putSettings(s: Settings) {
    await wrap((await store('kv', 'readwrite')).put(s, 'settings'));
  },

  async wipe() {
    if (await useMemory()) {
      mem.phrases.clear();
      mem.samples.clear();
      mem.audio.clear();
      mem.settings = null;
      return;
    }
    const d = await open();
    const names: StoreName[] = ['phrases', 'samples', 'audio', 'kv'];
    const tx = d.transaction(names, 'readwrite');
    for (const n of names) tx.objectStore(n).clear();
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};

export const db: typeof idb & { persistent: () => Promise<boolean> } = {
  persistent: async () => !(await useMemory()),
  phrases: async () =>
    (await useMemory()) ? [...mem.phrases.values()].sort((a, b) => a.order - b.order) : idb.phrases(),
  putPhrase: async (p) => void ((await useMemory()) ? mem.phrases.set(p.id, p) : await idb.putPhrase(p)),
  deletePhrase: async (id) => {
    if (!(await useMemory())) return idb.deletePhrase(id);
    const audioId = mem.phrases.get(id)?.audioId;
    if (audioId) mem.audio.delete(audioId);
    mem.phrases.delete(id);
    for (const [k, s] of mem.samples) if (s.phraseId === id) mem.samples.delete(k);
  },
  samples: async () => ((await useMemory()) ? [...mem.samples.values()] : idb.samples()),
  putSample: async (s) => void ((await useMemory()) ? mem.samples.set(s.id, s) : await idb.putSample(s)),
  deleteSample: async (id) => void ((await useMemory()) ? mem.samples.delete(id) : await idb.deleteSample(id)),
  audio: async (id) => ((await useMemory()) ? mem.audio.get(id) : idb.audio(id)),
  putAudio: async (id, b) => void ((await useMemory()) ? mem.audio.set(id, b) : await idb.putAudio(id, b)),
  deleteAudio: async (id) => void ((await useMemory()) ? mem.audio.delete(id) : await idb.deleteAudio(id)),
  settings: async () => ((await useMemory()) ? { ...DEFAULT_SETTINGS, ...mem.settings } : idb.settings()),
  putSettings: async (s) => void ((await useMemory()) ? (mem.settings = s) : await idb.putSettings(s)),
  wipe: () => idb.wipe(),
};
