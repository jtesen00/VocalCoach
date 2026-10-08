import type { Consonant, Phone, Vowel } from './phonemes';

/**
 * Formantes de la voz cantada (Fase 9): lo que hace que una «a» suene a «a». Valores medios
 * del español (5 vocales) para voz grave y aguda, con ganancias relativas, como en los
 * sintetizadores de formantes clásicos. Puro: lo usa el sintetizador de `audio/singer.ts`.
 */
export type VoiceType = 'grave' | 'aguda';

export interface FormantSet {
  /** Frecuencias (Hz) de F1–F5. */
  f: readonly number[];
  /** Anchos de banda (Hz). */
  bw: readonly number[];
  /** Ganancias relativas (dB). */
  gainDb: readonly number[];
}

const BW = [80, 90, 120, 150, 200];

const VOWELS: Record<VoiceType, Record<Vowel, { f: number[]; gainDb: number[] }>> = {
  grave: {
    a: { f: [700, 1250, 2550, 3300, 3800], gainDb: [0, -5, -16, -20, -28] },
    e: { f: [450, 1850, 2500, 3300, 3800], gainDb: [0, -9, -14, -20, -28] },
    i: { f: [290, 2250, 2900, 3400, 3900], gainDb: [0, -14, -12, -20, -28] },
    o: { f: [460, 950, 2450, 3300, 3800], gainDb: [0, -6, -22, -26, -32] },
    u: { f: [320, 780, 2350, 3300, 3800], gainDb: [0, -10, -28, -30, -36] },
  },
  aguda: {
    a: { f: [850, 1450, 2850, 3900, 4600], gainDb: [0, -5, -18, -24, -30] },
    e: { f: [500, 2100, 2850, 3900, 4600], gainDb: [0, -10, -16, -22, -30] },
    i: { f: [330, 2600, 3200, 4000, 4600], gainDb: [0, -14, -14, -22, -30] },
    o: { f: [520, 1050, 2800, 3900, 4600], gainDb: [0, -6, -24, -28, -34] },
    u: { f: [360, 850, 2700, 3900, 4600], gainDb: [0, -12, -30, -32, -38] },
  },
};

/** Consonantes sonoras sin ruido (nasales, líquidas, «y» y las b/d/g suaves): su propio filtro. */
const VOICED_SHAPES: Partial<Record<Consonant, { f: number[]; gainDb: number[] }>> = {
  m: { f: [250, 1100, 2300, 3300, 3800], gainDb: [0, -20, -26, -32, -38] },
  n: { f: [250, 1500, 2400, 3300, 3800], gainDb: [0, -18, -24, -32, -38] },
  ny: { f: [260, 1900, 2600, 3300, 3800], gainDb: [0, -16, -22, -30, -38] },
  l: { f: [360, 1150, 2600, 3300, 3800], gainDb: [0, -10, -18, -26, -32] },
  y: { f: [260, 2100, 2800, 3300, 3800], gainDb: [-2, -14, -14, -24, -30] },
  r: { f: [420, 1300, 2500, 3300, 3800], gainDb: [0, -8, -16, -24, -30] },
  rr: { f: [420, 1300, 2500, 3300, 3800], gainDb: [0, -8, -16, -24, -30] },
  b: { f: [250, 900, 2300, 3300, 3800], gainDb: [0, -16, -26, -32, -38] },
  d: { f: [280, 1600, 2600, 3300, 3800], gainDb: [0, -16, -24, -32, -38] },
  g: { f: [260, 1200, 2400, 3300, 3800], gainDb: [0, -16, -26, -32, -38] },
};

/** Cuánta voz (vibración) tiene cada sonido: 1 en las vocales, 0 en las sordas. */
export const VOICING: Record<Phone, number> = {
  a: 1, e: 1, i: 1, o: 1, u: 1,
  m: 0.55, n: 0.55, ny: 0.55, l: 0.65, y: 0.6, r: 0.7, rr: 0.7,
  b: 0.35, d: 0.35, g: 0.35,
  p: 0, t: 0, k: 0, f: 0, s: 0, x: 0, ch: 0,
};

/** Ruido de las consonantes: banda (Hz), Q, nivel y si es una explosión breve al final (oclusivas). */
export interface NoiseShape {
  hz: number;
  q: number;
  level: number;
  burst: boolean;
}

export function noiseShape(c: Phone, voice: VoiceType): NoiseShape | null {
  const k = voice === 'aguda' ? 1.15 : 1;
  switch (c) {
    case 's': return { hz: 6500 * k, q: 2, level: 0.45, burst: false };
    case 'f': return { hz: 4000, q: 0.6, level: 0.12, burst: false };
    case 'x': return { hz: 1800, q: 1.2, level: 0.28, burst: false };
    case 'ch': return { hz: 3500 * k, q: 1.5, level: 0.4, burst: false };
    case 'p': return { hz: 900, q: 0.8, level: 0.3, burst: true };
    case 't': return { hz: 4000, q: 1, level: 0.32, burst: true };
    case 'k': return { hz: 2000, q: 1.4, level: 0.32, burst: true };
    case 'b': case 'd': case 'g': return { hz: c === 'b' ? 900 : c === 'd' ? 3500 : 2000, q: 1, level: 0.08, burst: true };
    default: return null;
  }
}

/**
 * Formantes del sonido a una altura dada. Como hacen los cantantes, F1 sube hasta la
 * fundamental cuando la nota es más aguda que él (si no, la nota pierde fuerza).
 */
export function formantsFor(phone: Phone, voice: VoiceType, f0: number): FormantSet {
  const table = VOWELS[voice];
  const shape = phone in table ? table[phone as Vowel] : VOICED_SHAPES[phone as Consonant] ?? table.a;
  const f = [...shape.f];
  if (f0 * 1.1 > f[0]) f[0] = Math.min(f0 * 1.1, f[1] * 0.8);
  return { f, bw: BW, gainDb: shape.gainDb };
}

/** Tipo de voz según el rango cómodo del usuario: centro bajo Sol3–La3 → grave. */
export function voiceTypeFor(range: { lowMidi: number; highMidi: number } | null | undefined): VoiceType {
  if (!range) return 'aguda';
  return (range.lowMidi + range.highMidi) / 2 < 58 ? 'grave' : 'aguda';
}
