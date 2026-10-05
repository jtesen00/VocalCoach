/**
 * AudioWorkletProcessor: acumula audio en un ring buffer y cada `hopSize` muestras
 * ejecuta el detector sobre la ventana más reciente. Envía estimaciones crudas al hilo principal.
 */
import { createDetector, rmsDb } from '../core/pitch/detector';
import type { DetectorKind, PitchDetector, RawPitchFrame } from '../core/pitch/types';

declare const sampleRate: number;
declare const currentTime: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

export interface PitchProcessorOptions {
  detector: DetectorKind;
  windowSize: number;
  hopSize: number;
  minHz: number;
  maxHz: number;
}

export interface WorkletMessage extends RawPitchFrame {
  /** Tiempo de cómputo del detector (ms), o null si no se puede medir en este navegador. */
  processMs: number | null;
}

const clock: (() => number) | null =
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : null;

class PitchProcessor extends AudioWorkletProcessor {
  private readonly ring: Float32Array;
  private readonly window: Float32Array;
  private readonly hop: number;
  private writePos = 0;
  private filled = 0;
  private sinceLast = 0;
  private detector: PitchDetector;
  private readonly opts: PitchProcessorOptions;

  constructor(options: { processorOptions: PitchProcessorOptions }) {
    super();
    this.opts = options.processorOptions;
    this.ring = new Float32Array(this.opts.windowSize);
    this.window = new Float32Array(this.opts.windowSize);
    this.hop = this.opts.hopSize;
    this.detector = createDetector(this.opts.detector, { sampleRate, ...this.opts });
    this.port.onmessage = (e: MessageEvent<{ detector?: DetectorKind }>) => {
      if (e.data.detector) this.detector = createDetector(e.data.detector, { sampleRate, ...this.opts });
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input) return true;
    const n = this.ring.length;
    for (let i = 0; i < input.length; i++) {
      this.ring[this.writePos] = input[i];
      this.writePos = (this.writePos + 1) % n;
    }
    this.filled = Math.min(n, this.filled + input.length);
    this.sinceLast += input.length;
    if (this.filled < n || this.sinceLast < this.hop) return true;
    this.sinceLast = 0;

    // Linealiza el ring buffer: la muestra más antigua está en writePos.
    const tail = n - this.writePos;
    this.window.set(this.ring.subarray(this.writePos), 0);
    this.window.set(this.ring.subarray(0, this.writePos), tail);

    const t0 = clock?.() ?? 0;
    const est = this.detector.detect(this.window);
    const msg: WorkletMessage = {
      t: currentTime + input.length / sampleRate,
      f0: est.f0,
      clarity: est.clarity,
      levelDb: rmsDb(this.window),
      processMs: clock ? clock() - t0 : null,
    };
    this.port.postMessage(msg);
    return true;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
