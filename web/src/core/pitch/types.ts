export interface PitchEstimate {
  /** Frecuencia fundamental en Hz, o null si no hay periodicidad clara. */
  f0: number | null;
  /** Confianza del detector, 0..1. */
  clarity: number;
}

export interface PitchDetector {
  readonly windowSize: number;
  detect(frame: Float32Array): PitchEstimate;
}

export interface DetectorOptions {
  sampleRate: number;
  windowSize: number;
  minHz: number;
  maxHz: number;
}

export type DetectorKind = 'mpm' | 'yin';

/** Estimación cruda que emite el AudioWorklet por cada hop. */
export interface RawPitchFrame extends PitchEstimate {
  /** Tiempo del final de la ventana, en segundos del reloj del AudioContext. */
  t: number;
  /** Nivel RMS en dBFS. */
  levelDb: number;
}

/** Resultado normalizado del motor de pitch tras voicing y suavizado. */
export interface PitchFrame {
  t: number;
  f0: number | null;
  /** MIDI continuo (60.07 = C4 +7 cents). */
  midi: number | null;
  clarity: number;
  levelDb: number;
  voiced: boolean;
}
