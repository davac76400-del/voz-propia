import type { InferenceSession } from 'onnxruntime-web';

const MODEL_PATH = 'models/lip-encoder.onnx';

/**
 * Codificador neuronal opcional (ONNX Runtime Web, WebGPU con respaldo a WASM).
 * Entrada [1, L, D] con los rasgos de labios; salida [1, L, E] con embeddings contrastivos
 * al estilo LipLearner. Si el archivo del modelo no existe, la app usa la geometría de labios directa.
 */
export class NeuralEncoder {
  private session: InferenceSession | null = null;
  backend: 'webgpu' | 'wasm' | null = null;

  static async isInstalled(): Promise<boolean> {
    try {
      const res = await fetch(new URL(MODEL_PATH, document.baseURI), { method: 'HEAD' });
      return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
    } catch {
      return false;
    }
  }

  async load(): Promise<void> {
    const ort = await import('onnxruntime-web');
    const url = new URL(MODEL_PATH, document.baseURI).href;
    const providers: ('webgpu' | 'wasm')[] = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'];
    for (const ep of providers) {
      try {
        this.session = await ort.InferenceSession.create(url, { executionProviders: [ep] });
        this.backend = ep;
        return;
      } catch {
        // Se intenta el siguiente proveedor.
      }
    }
    throw new Error('No se pudo cargar el codificador neuronal');
  }

  async embed(x: Float32Array, L: number, D: number): Promise<{ x: Float32Array; D: number }> {
    if (!this.session) throw new Error('Codificador sin cargar');
    const ort = await import('onnxruntime-web');
    const input = new ort.Tensor('float32', x, [1, L, D]);
    const out = await this.session.run({ [this.session.inputNames[0]]: input });
    const t = out[this.session.outputNames[0]];
    return { x: t.data as Float32Array, D: t.dims[2] };
  }
}
