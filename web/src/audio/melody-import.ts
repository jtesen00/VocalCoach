import { EXTRACTION_SAMPLE_RATE } from '../core/songs/melody-extraction';
import { notesToSong, type ExtractionQuality } from '../core/songs/transcribe';
import type { Song } from '../core/songs/types';
import type { MelodyWorkerMessage, MelodyWorkerRequest } from './melody-worker';
import { SEPARATION_SAMPLE_RATE } from '../core/songs/separation';
import type { SeparationWorkerMessage, SeparationWorkerRequest } from './separation-worker';

/** Duración máxima analizada (s): una canción completa cabe de sobra. */
export const MAX_IMPORT_S = 6 * 60;

export interface ImportOptions {
  fromS?: number;
  toS?: number;
  /** Separar antes la voz con IA (Fase 8c). El modelo tiene que estar descargado. */
  separate?: boolean;
  /** Cancela la importación (detiene los workers). */
  signal?: AbortSignal;
  onProgress?: (stage: ImportStage, value: number) => void;
}

export type ImportStage = 'decoding' | 'separating' | 'analyzing';

/** Fragmento del audio decodificado, remuestreado y con un paso alto opcional. */
async function render(decoded: AudioBuffer, from: number, to: number, sampleRate: number, highpassHz: number | null): Promise<AudioBuffer> {
  const channels = Math.min(2, decoded.numberOfChannels);
  const ctx = new OfflineAudioContext(channels, Math.ceil((to - from) * sampleRate), sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  let out: AudioNode = src;
  if (highpassHz) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpassHz;
    out = src.connect(hp);
  }
  out.connect(ctx.destination);
  src.start(0, from, to - from);
  return ctx.startRendering();
}

const channelsOf = (b: AudioBuffer) => ({ left: b.getChannelData(0).slice(), right: b.numberOfChannels > 1 ? b.getChannelData(1).slice() : null });

export const cancelledError = () => new DOMException('Importación cancelada.', 'AbortError');

/** Voz separada de la mezcla en un Web Worker (44,1 kHz). */
function separateInWorker(left: Float32Array, right: Float32Array | null, onProgress: (p: number) => void, signal?: AbortSignal): Promise<{ left: Float32Array; right: Float32Array }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(cancelledError());
    const worker = new Worker(new URL('./separation-worker.ts', import.meta.url), { type: 'module' });
    signal?.addEventListener('abort', () => {
      worker.terminate();
      reject(cancelledError());
    }, { once: true });
    worker.onmessage = (e: MessageEvent<SeparationWorkerMessage>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.value);
      else if (m.type === 'ready') onProgress(0);
      else {
        worker.terminate();
        if (m.type === 'done') resolve(m);
        else reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'La separación de la voz falló (¿falta memoria?).'));
    };
    worker.postMessage({ left, right } satisfies SeparationWorkerRequest, right ? [left.buffer, right.buffer] : [left.buffer]);
  });
}

/** Voz separada (44,1 kHz) → misma frecuencia y filtro que la mezcla para el análisis. */
async function resampleVoice(voice: { left: Float32Array; right: Float32Array }): Promise<AudioBuffer> {
  const buf = new AudioBuffer({ numberOfChannels: 2, length: voice.left.length, sampleRate: SEPARATION_SAMPLE_RATE });
  buf.copyToChannel(voice.left as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(voice.right as Float32Array<ArrayBuffer>, 1);
  return render(buf, 0, buf.duration, EXTRACTION_SAMPLE_RATE, 70);
}

/**
 * Archivo de audio (MP3, M4A, WAV, OGG… lo que decodifique el navegador) → canción practicable.
 * Todo ocurre en el dispositivo: el audio no se sube, no se guarda y no se reproduce;
 * solo se conserva la melodía extraída.
 */
export async function importSongFromFile(file: File, options: ImportOptions = {}): Promise<{ song: Song; durationS: number; quality: ExtractionQuality }> {
  options.onProgress?.('decoding', 0);
  const data = await file.arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data);
  const from = Math.max(0, options.fromS ?? 0);
  const to = Math.min(decoded.duration, options.toS ?? decoded.duration, from + MAX_IMPORT_S);
  if (to - from < 1) throw new Error('El fragmento es demasiado corto.');

  // Remuestrea a 22,05 kHz conservando el estéreo (la voz principal suele ir al centro) y quita graves profundos.
  const rendered = await render(decoded, from, to, EXTRACTION_SAMPLE_RATE, 70);
  let vocals: MelodyWorkerRequest['vocals'];
  if (options.separate) {
    // El modelo trabaja a 44,1 kHz con la banda completa.
    const full = channelsOf(await render(decoded, from, to, SEPARATION_SAMPLE_RATE, null));
    options.onProgress?.('decoding', 1);
    options.onProgress?.('separating', 0);
    const voice = await separateInWorker(full.left, full.right, (p) => options.onProgress?.('separating', p), options.signal);
    vocals = channelsOf(await resampleVoice(voice));
  } else {
    options.onProgress?.('decoding', 1);
  }

  const { left, right } = channelsOf(rendered);
  type Done = Extract<MelodyWorkerMessage, { type: 'done' }>;
  const { notes, chords, quality } = await new Promise<Done>((resolve, reject) => {
    if (options.signal?.aborted) return reject(cancelledError());
    const worker = new Worker(new URL('./melody-worker.ts', import.meta.url), { type: 'module' });
    options.signal?.addEventListener('abort', () => {
      worker.terminate();
      reject(cancelledError());
    }, { once: true });
    worker.onmessage = (e: MessageEvent<MelodyWorkerMessage>) => {
      if (e.data.type === 'progress') options.onProgress?.('analyzing', e.data.value);
      else {
        worker.terminate();
        if (e.data.type === 'done') resolve(e.data);
        else reject(new Error(e.data.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    const buffers = [left, right, vocals?.left, vocals?.right].filter((b): b is Float32Array => !!b).map((b) => b.buffer);
    worker.postMessage({ left, right, vocals, sampleRate: EXTRACTION_SAMPLE_RATE } satisfies MelodyWorkerRequest, buffers);
  });

  // Los tiempos de las frases se muestran respecto al archivo original.
  const shifted = notes.map((n) => ({ ...n, startS: n.startS + from, endS: n.endS + from }));
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Canción importada';
  const shiftedChords = chords.map((c) => ({ ...c, startS: c.startS + from, endS: c.endS + from }));
  const song = notesToSong(shifted, { id: `import-${Date.now().toString(36)}`, title }, { chords: shiftedChords });
  song.extraction = { quality: quality.level, stereo: quality.stereo, separated: quality.separated, fromS: from, toS: to };
  return { song, durationS: decoded.duration, quality };
}
