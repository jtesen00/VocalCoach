import { DEFAULT_A4_HZ, freqToMidi, midiToFreq } from '../music/notes';
import type { PitchFrame, RawPitchFrame } from './types';

export interface TrackerOptions {
  a4Hz: number;
  /** Clarity mínima para entrar en "voz" y para mantenerse. */
  clarityOn: number;
  clarityOff: number;
  /** Margen sobre el ruido de fondo (dB) para entrar y para mantenerse. */
  marginOnDb: number;
  marginOffDb: number;
  /** Nivel absoluto mínimo (dBFS) por debajo del cual nunca hay voz. */
  minLevelDb: number;
  /** Frames consecutivos necesarios para cambiar de estado. */
  framesToVoice: number;
  framesToSilence: number;
  /** Tamaño de la mediana sobre el MIDI (impar). */
  medianSize: number;
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  a4Hz: DEFAULT_A4_HZ,
  clarityOn: 0.85,
  clarityOff: 0.7,
  marginOnDb: 12,
  marginOffDb: 8,
  minLevelDb: -60,
  framesToVoice: 2,
  framesToSilence: 3,
  medianSize: 3,
};

/**
 * Convierte estimaciones crudas en PitchFrame: estima el ruido de fondo,
 * decide voz/silencio con histéresis y suaviza con una mediana.
 */
export class PitchTracker {
  private readonly opts: TrackerOptions;
  private floorDb = -70;
  private voiced = false;
  private streak = 0;
  private recent: number[] = [];
  private lastMidi: number | null = null;

  constructor(opts: Partial<TrackerOptions> = {}) {
    this.opts = { ...DEFAULT_TRACKER_OPTIONS, ...opts };
  }

  get noiseFloorDb(): number {
    return this.floorDb;
  }

  reset(): void {
    this.voiced = false;
    this.streak = 0;
    this.recent = [];
    this.lastMidi = null;
  }

  push(raw: RawPitchFrame): PitchFrame {
    const o = this.opts;
    const level = raw.levelDb;
    const hasPitch = raw.f0 !== null && raw.f0 > 0;

    const enters = hasPitch && raw.clarity >= o.clarityOn && level >= Math.max(o.minLevelDb, this.floorDb + o.marginOnDb);
    const stays = hasPitch && raw.clarity >= o.clarityOff && level >= Math.max(o.minLevelDb, this.floorDb + o.marginOffDb);
    const wantsChange = this.voiced ? !stays : enters;

    if (wantsChange) {
      this.streak++;
      if (this.streak >= (this.voiced ? o.framesToSilence : o.framesToVoice)) {
        this.voiced = !this.voiced;
        this.streak = 0;
        if (!this.voiced) {
          this.recent = [];
          this.lastMidi = null;
        }
      }
    } else {
      this.streak = 0;
    }

    // El ruido de fondo baja rápido y sube despacio, y solo se actualiza sin voz.
    if (!this.voiced && !enters) {
      const k = level < this.floorDb ? 0.2 : 0.01;
      this.floorDb = Math.min(-30, Math.max(-100, this.floorDb + (level - this.floorDb) * k));
    }

    if (this.voiced && hasPitch && raw.clarity >= o.clarityOff) {
      this.recent.push(freqToMidi(raw.f0!, o.a4Hz));
      if (this.recent.length > o.medianSize) this.recent.shift();
      this.lastMidi = median(this.recent);
    }

    const midi = this.voiced ? this.lastMidi : null;
    return {
      t: raw.t,
      f0: midi === null ? null : midiToFreq(midi, o.a4Hz),
      midi,
      clarity: raw.clarity,
      levelDb: level,
      voiced: this.voiced && midi !== null,
    };
  }
}

export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
