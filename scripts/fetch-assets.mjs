// Copia el runtime de MediaPipe y descarga el modelo de rostro a /public para que la app funcione sin internet.
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe');
const modelDst = join(root, 'public/models/face_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const exists = (p) => stat(p).then(() => true, () => false);

await mkdir(wasmDst, { recursive: true });
for (const f of [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]) {
  await copyFile(join(wasmSrc, f), join(wasmDst, f));
}

if (!(await exists(modelDst))) {
  await mkdir(dirname(modelDst), { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`No se pudo descargar el modelo (${res.status})`);
  await writeFile(modelDst, Buffer.from(await res.arrayBuffer()));
  console.log('Modelo de rostro descargado.');
}
console.log('Recursos offline listos.');
