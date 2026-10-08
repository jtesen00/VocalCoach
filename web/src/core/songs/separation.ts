/**
 * Separación de la voz (Fase 8c), parte pura: trocear la mezcla en segmentos con solapamiento,
 * pasar cada uno por un modelo (inyectado) y recomponer la voz con fundidos cruzados.
 *
 * El modelo previsto es HT-Demucs FT (especialista en voz, MIT), exportado a ONNX: recibe
 * 7,8 s de audio estéreo a 44,1 kHz y devuelve las cuatro pistas (batería, bajo, otros, voz).
 * Aquí no se sabe nada de ONNX ni del navegador: solo de muestras.
 */

export const SEPARATION_SAMPLE_RATE = 44100;
/** Muestras de un segmento del modelo (7,8 s a 44,1 kHz). */
export const SEGMENT_SAMPLES = 343980;

export interface SeparationChunk {
  /** Primera muestra del segmento en el audio completo. */
  start: number;
  /** Muestras útiles (el último segmento puede ser más corto y se rellena con silencio). */
  length: number;
}

/** Segmentos con un 25 % de solapamiento que cubren `total` muestras. */
export function separationChunks(total: number, segment = SEGMENT_SAMPLES, overlapFrac = 0.25): SeparationChunk[] {
  const stride = segment - Math.floor(segment * overlapFrac);
  const n = Math.max(1, Math.ceil(total / stride));
  const out: SeparationChunk[] = [];
  for (let i = 0; i < n; i++) {
    const start = i * stride;
    if (start >= total && i > 0) break;
    out.push({ start, length: Math.min(segment, total - start) });
  }
  return out;
}

/** Ventana de transición: rampa lineal en el 25 % de cada extremo (la del script de referencia). */
export function transitionWindow(segment = SEGMENT_SAMPLES, overlapFrac = 0.25): Float32Array {
  const w = new Float32Array(segment).fill(1);
  const tr = Math.floor(segment * overlapFrac);
  for (let i = 0; i < tr; i++) {
    const v = tr > 1 ? i / (tr - 1) : 1;
    w[i] = v;
    w[segment - 1 - i] = v;
  }
  return w;
}

/**
 * Ejecuta el modelo sobre un segmento. Entrada: estéreo plano [L…, R…] de `segment` muestras.
 * Salida: la voz, también estéreo plano [L…, R…] de `segment` muestras.
 */
export type SeparateSegment = (planar: Float32Array) => Promise<Float32Array>;

export interface SeparationOptions {
  segment?: number;
  onProgress?: (p: number) => void;
  /** Se consulta entre segmentos: si devuelve true, se cancela con un error. */
  cancelled?: () => boolean;
}

/** Mezcla completa → voz separada (misma longitud y frecuencia de muestreo). `right` = null en mono. */
export async function separateVocals(
  left: Float32Array,
  right: Float32Array | null,
  run: SeparateSegment,
  options: SeparationOptions = {},
): Promise<{ left: Float32Array; right: Float32Array }> {
  const segment = options.segment ?? SEGMENT_SAMPLES;
  const r = right ?? left;
  const total = left.length;
  const outL = new Float32Array(total);
  const outR = new Float32Array(total);
  const weight = new Float32Array(total);
  const win = transitionWindow(segment);
  const chunks = separationChunks(total, segment);
  const input = new Float32Array(2 * segment);
  for (let c = 0; c < chunks.length; c++) {
    if (options.cancelled?.()) throw new Error('Separación cancelada.');
    const { start, length } = chunks[c];
    input.fill(0);
    input.set(left.subarray(start, start + length), 0);
    input.set(r.subarray(start, start + length), segment);
    const voice = await run(input);
    for (let i = 0; i < length; i++) {
      // El primer y el último segmento no tienen vecino que funda: peso completo en el borde.
      const w = (c === 0 && i < segment / 2) || (c === chunks.length - 1 && i >= segment / 2) ? 1 : win[i];
      outL[start + i] += voice[i] * w;
      outR[start + i] += voice[segment + i] * w;
      weight[start + i] += w;
    }
    options.onProgress?.((c + 1) / chunks.length);
  }
  for (let i = 0; i < total; i++) {
    const w = Math.max(weight[i], 1e-8);
    outL[i] /= w;
    outR[i] /= w;
  }
  return { left: outL, right: outR };
}
