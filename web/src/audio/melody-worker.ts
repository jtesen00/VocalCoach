/// <reference lib="webworker" />
/** Analiza la melodía fuera del hilo principal para no congelar la interfaz. */
import { segmentNotes, trackPitch } from '../core/songs/transcribe';

export interface MelodyWorkerRequest {
  samples: Float32Array;
  sampleRate: number;
}

export type MelodyWorkerMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; notes: ReturnType<typeof segmentNotes> }
  | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<MelodyWorkerRequest>) => {
  try {
    const frames = trackPitch(e.data.samples, e.data.sampleRate, (value) => self.postMessage({ type: 'progress', value } satisfies MelodyWorkerMessage));
    self.postMessage({ type: 'done', notes: segmentNotes(frames) } satisfies MelodyWorkerMessage);
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies MelodyWorkerMessage);
  }
};
