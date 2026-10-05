import { McLeodDetector } from './mpm';
import { YinDetector } from './yin';
import type { DetectorKind, DetectorOptions, PitchDetector } from './types';

/** Parámetros por defecto validados en el benchmark (docs/planning/PLAN.md §4.2). */
export const DEFAULT_DETECTOR_OPTIONS = {
  windowSize: 2048,
  hopSize: 512,
  minHz: 70,
  maxHz: 1100,
} as const;

export function createDetector(kind: DetectorKind, opts: DetectorOptions): PitchDetector {
  return kind === 'yin' ? new YinDetector(opts) : new McLeodDetector(opts);
}

export function rmsDb(x: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  const rms = Math.sqrt(sum / x.length);
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}
