/// <reference lib="webworker" />
/** Analiza la melodía fuera del hilo principal para no congelar la interfaz. */
import { transcribeAudio, type ExtractionQuality, type TranscribedNote } from '../core/songs/transcribe';

export interface MelodyWorkerRequest {
  left: Float32Array;
  right: Float32Array | null;
  sampleRate: number;
}

export type MelodyWorkerMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; notes: TranscribedNote[]; quality: ExtractionQuality }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<MelodyWorkerRequest>) => {
  try {
    const { notes, quality } = transcribeAudio(e.data.left, e.data.right, e.data.sampleRate, (value) =>
      self.postMessage({ type: 'progress', value } satisfies MelodyWorkerMessage),
    );
    self.postMessage({ type: 'done', notes, quality } satisfies MelodyWorkerMessage);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies MelodyWorkerMessage);
  }
};
