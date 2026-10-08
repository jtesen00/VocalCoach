/**
 * Modelo de separación de voz (Fase 8c): HT-Demucs FT, especialista en voz, exportado a ONNX
 * con los pesos en fp16. Licencia MIT (Meta, Demucs; exportación de StemSplit).
 *
 * Se descarga solo si el usuario lo pide, una vez, y se guarda en la Cache API del navegador
 * (no en el precaché de la PWA: pesa demasiado). Solo se descarga el modelo: el audio del
 * usuario nunca sale del dispositivo.
 */

const REVISION = '2ef0d757d3e226d0da85fb8c71514f464fcabdd0';

export const SEPARATION_MODEL = {
  name: 'HT-Demucs FT (voz)',
  license: 'MIT',
  /** Se puede servir desde otro sitio (p. ej. el propio dominio) con `VITE_SEPARATION_MODEL_URL`. */
  url:
    (import.meta.env.VITE_SEPARATION_MODEL_URL as string | undefined) ||
    `https://huggingface.co/StemSplitio/htdemucs-ft-vocals-onnx/resolve/${REVISION}/htdemucs_ft_vocals_fp16weights.onnx`,
  bytes: 165_612_636,
  /** SHA-256 publicado del archivo: se comprueba tras descargarlo. */
  sha256: '0cbe651f535415c9d26a7bb614f7d322dd5a080fa0298f2e50f478030a994dce',
};

export const MODEL_CACHE = 'vocalcoach-models-v1';
/** Clave fija en la caché, independiente de la URL de descarga. */
export const MODEL_KEY = '/models/htdemucs-ft-vocals.onnx';

export const modelSizeLabel = `${Math.round(SEPARATION_MODEL.bytes / 1e6)} MB`;

const hasCaches = () => typeof caches !== 'undefined';

export async function isModelDownloaded(): Promise<boolean> {
  if (!hasCaches()) return false;
  try {
    return !!(await (await caches.open(MODEL_CACHE)).match(MODEL_KEY));
  } catch {
    return false;
  }
}

export async function deleteModel(): Promise<void> {
  if (hasCaches()) await caches.delete(MODEL_CACHE);
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Descarga el modelo con progreso (0..1), comprueba su huella y lo guarda en la caché. */
export async function downloadModel(onProgress?: (p: number) => void, signal?: AbortSignal): Promise<void> {
  if (!hasCaches()) throw new Error('Este navegador no permite guardar el modelo.');
  if (await isModelDownloaded()) return;
  const res = await fetch(SEPARATION_MODEL.url, { signal });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar el modelo (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || SEPARATION_MODEL.bytes;
  const data = new Uint8Array(total);
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (got + value.length > data.length) throw new Error('El modelo descargado no es el esperado.');
    data.set(value, got);
    got += value.length;
    onProgress?.(got / total);
  }
  if (got !== total) throw new Error('La descarga del modelo se cortó. Vuelve a intentarlo.');
  if (hex(await crypto.subtle.digest('SHA-256', data)) !== SEPARATION_MODEL.sha256) {
    throw new Error('El modelo descargado no es el esperado.');
  }
  const cache = await caches.open(MODEL_CACHE);
  await cache.put(MODEL_KEY, new Response(data, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(got) } }));
  // Que el navegador no lo borre si le falta espacio (ya se pide al instalar la PWA; aquí es más importante).
  await navigator.storage?.persist?.().catch(() => false);
}
