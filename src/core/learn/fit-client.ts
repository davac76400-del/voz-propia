import type { FitReply, FitRequest } from './fit-worker';

type Job = { resolve: (r: FitReply | null) => void };

let worker: Worker | null | undefined;
let nextId = 0;
const jobs = new Map<number, Job>();

/** Si el hilo aparte falla, todo lo que esperaba cae al camino de siempre (entrenar aquí mismo). */
function giveUp() {
  worker?.terminate();
  worker = null;
  for (const j of jobs.values()) j.resolve(null);
  jobs.clear();
}

function spawn(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL('./fit-worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FitReply>) => {
      const j = jobs.get(e.data.id);
      jobs.delete(e.data.id);
      j?.resolve(e.data);
    };
    w.onerror = giveUp;
    w.onmessageerror = giveUp;
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Entrena los dos modelos en otro hilo. Devuelve null si no se pudo (sin soporte o falló): entonces quien llama
 * entrena en el hilo principal, más lento pero igual de correcto.
 */
export function fitInWorker(embedded: FitRequest['embedded'], raw: FitRequest['raw']): Promise<FitReply | null> {
  const w = spawn();
  if (!w) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = ++nextId;
    jobs.set(id, { resolve });
    try {
      w.postMessage({ id, embedded, raw } satisfies FitRequest);
    } catch {
      jobs.delete(id);
      resolve(null);
    }
  });
}
