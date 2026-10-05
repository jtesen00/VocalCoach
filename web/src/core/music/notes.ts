/** Conversión frecuencia ↔ MIDI ↔ nombre de nota. MIDI 69 = A4. */

export const DEFAULT_A4_HZ = 440;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** MIDI continuo: 60.07 = C4 +7 cents. */
export function freqToMidi(hz: number, a4Hz = DEFAULT_A4_HZ): number {
  return 69 + 12 * Math.log2(hz / a4Hz);
}

export function midiToFreq(midi: number, a4Hz = DEFAULT_A4_HZ): number {
  return a4Hz * 2 ** ((midi - 69) / 12);
}

/** Nombre de una nota MIDI entera, p. ej. 60 → "C4". */
export function noteName(midi: number): string {
  const n = Math.round(midi);
  const pitchClass = ((n % 12) + 12) % 12;
  const octave = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[pitchClass]}${octave}`;
}

/** "C4", "F#3", "Bb2" → MIDI entero. */
export function parseNote(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`Nota inválida: ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C'];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + base + accidental;
}

export interface NearestNote {
  midi: number;
  name: string;
  /** Desviación respecto a la nota más cercana, en [-50, +50]. */
  cents: number;
}

export function nearestNote(midi: number): NearestNote {
  const n = Math.round(midi);
  return { midi: n, name: noteName(n), cents: (midi - n) * 100 };
}
