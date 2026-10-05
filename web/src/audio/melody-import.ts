import { EXTRACTION_SAMPLE_RATE } from '../core/songs/melody-extraction';
import { notesToSong, type ExtractionQuality } from '../core/songs/transcribe';
import type { Song } from '../core/songs/types';
import type { MelodyWorkerMessage, MelodyWorkerRequest } from './melody-worker';

/** Duración máxima analizada (s): una canción completa cabe de sobra. */
export const MAX_IMPORT_S = 6 * 60;

export interface ImportOptions {
  fromS?: number;
  toS?: number;
  onProgress?: (stage: 'decoding' | 'analyzing', value: number) => void;
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
  const channels = Math.min(2, decoded.numberOfChannels);
  const ctx = new OfflineAudioContext(channels, Math.ceil((to - from) * EXTRACTION_SAMPLE_RATE), EXTRACTION_SAMPLE_RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 70;
  src.connect(hp).connect(ctx.destination);
  src.start(0, from, to - from);
  const rendered = await ctx.startRendering();
  options.onProgress?.('decoding', 1);

  const left = rendered.getChannelData(0).slice();
  const right = channels > 1 ? rendered.getChannelData(1).slice() : null;
  const { notes, quality } = await new Promise<{ notes: Extract<MelodyWorkerMessage, { type: 'done' }>['notes']; quality: ExtractionQuality }>((resolve, reject) => {
    const worker = new Worker(new URL('./melody-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<MelodyWorkerMessage>) => {
      if (e.data.type === 'progress') options.onProgress?.('analyzing', e.data.value);
      else {
        worker.terminate();
        if (e.data.type === 'done') resolve({ notes: e.data.notes, quality: e.data.quality });
        else reject(new Error(e.data.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    const transfer = right ? [left.buffer, right.buffer] : [left.buffer];
    worker.postMessage({ left, right, sampleRate: EXTRACTION_SAMPLE_RATE } satisfies MelodyWorkerRequest, transfer);
  });

  // Los tiempos de las frases se muestran respecto al archivo original.
  const shifted = notes.map((n) => ({ ...n, startS: n.startS + from, endS: n.endS + from }));
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Canción importada';
  const song = notesToSong(shifted, { id: `import-${Date.now().toString(36)}`, title });
  song.extraction = { quality: quality.level, stereo: quality.stereo, fromS: from, toS: to };
  return { song, durationS: decoded.duration, quality };
}
