/// <reference lib="webworker" />
/**
 * Separa la voz de la mezcla con el modelo ONNX (Fase 8c), fuera del hilo principal.
 * Usa la GPU (WebGPU) si el navegador la ofrece y, si no, la CPU (WebAssembly).
 * El modelo se lee de la caché donde lo dejó `downloadModel`.
 */
import * as ort from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import { SEGMENT_SAMPLES, separateVocals } from '../core/songs/separation';
import { MODEL_CACHE, MODEL_KEY } from './separation-model';

export interface SeparationWorkerRequest {
  /** Estéreo a 44,1 kHz; `right` = null en mono. */
  left: Float32Array;
  right: Float32Array | null;
}

export type SeparationWorkerMessage =
  | { type: 'ready'; backend: 'webgpu' | 'wasm' }
  | { type: 'progress'; value: number }
  | { type: 'done'; left: Float32Array; right: Float32Array }
  | { type: 'error'; message: string };

// El .wasm de ORT, como recurso de Vite (en desarrollo y en la compilación).
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

const post = (m: SeparationWorkerMessage, transfer: Transferable[] = []) => self.postMessage(m, transfer);

async function createSession(model: Uint8Array): Promise<{ session: ort.InferenceSession; backend: 'webgpu' | 'wasm' }> {
  // Sin optimizar el grafo: al plegar las conversiones de los pesos fp16 → fp32 se agota la memoria de WASM.
  const options = { graphOptimizationLevel: 'disabled' } as const;
  if ('gpu' in navigator) {
    try {
      return { session: await ort.InferenceSession.create(model, { ...options, executionProviders: ['webgpu'] }), backend: 'webgpu' };
    } catch {
      // GPU sin soporte suficiente: se sigue con la CPU.
    }
  }
  // Varios hilos solo si la página está aislada (COOP/COEP); si no, ORT usa uno.
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  return { session: await ort.InferenceSession.create(model, { ...options, executionProviders: ['wasm'] }), backend: 'wasm' };
}

self.onmessage = async (e: MessageEvent<SeparationWorkerRequest>) => {
  try {
    const cached = await (await caches.open(MODEL_CACHE)).match(MODEL_KEY);
    if (!cached) throw new Error('Falta el modelo de separación: descárgalo primero.');
    const { session, backend } = await createSession(new Uint8Array(await cached.arrayBuffer()));
    post({ type: 'ready', backend });
    const [input] = session.inputNames;
    const [output] = session.outputNames;
    const voice = await separateVocals(
      e.data.left,
      e.data.right,
      async (planar) => {
        const out = await session.run({ [input]: new ort.Tensor('float32', planar, [1, 2, SEGMENT_SAMPLES]) });
        const stems = out[output];
        // (1, 4, 2, N) en el orden batería, bajo, otros, voz: la voz es la pista 3.
        const data = (await stems.getData()) as Float32Array;
        const vocals = data.slice(3 * 2 * SEGMENT_SAMPLES, 4 * 2 * SEGMENT_SAMPLES);
        stems.dispose();
        return vocals;
      },
      { onProgress: (value) => post({ type: 'progress', value }) },
    );
    await session.release();
    post({ type: 'done', left: voice.left, right: voice.right }, [voice.left.buffer, voice.right.buffer]);
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
