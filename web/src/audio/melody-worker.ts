/// <reference lib="webworker" />
/** Analiza la melodía fuera del hilo principal para no congelar la interfaz. */
import type { TimedChord } from '../core/music/chords';
import { transcribeAudio, type ExtractionQuality, type TranscribedNote } from '../core/songs/transcribe';

export interface MelodyWorkerRequest {
  left: Float32Array;
  right: Float32Array | null;
  sampleRate: number;
  /** Voz separada (Fase 8c), a la misma frecuencia de muestreo. */
  vocals?: { left: Float32Array; right: Float32Array | null };
}

export type MelodyWorkerMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; notes: TranscribedNote[]; chords: TimedChord[]; quality: ExtractionQuality }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<MelodyWorkerRequest>) => {
  try {
    const { notes, chords, quality } = transcribeAudio(e.data.left, e.data.right, e.data.sampleRate, {
      vocals: e.data.vocals,
      onProgress: (value) => self.postMessage({ type: 'progress', value } satisfies MelodyWorkerMessage),
    });
    self.postMessage({ type: 'done', notes, chords, quality } satisfies MelodyWorkerMessage);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies MelodyWorkerMessage);
  }
};
