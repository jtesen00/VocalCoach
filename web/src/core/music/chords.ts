/** Acordes: modelo, nombres y disposición (voicing) para el acompañamiento. */

export type ChordQuality = 'maj' | 'min';

export interface Chord {
  /** Clase de altura de la fundamental (0 = Do … 11 = Si). */
  root: number;
  quality: ChordQuality;
}

/** Acorde dentro de una frase, en pulsos desde su inicio. */
export interface PhraseChord {
  startBeat: number;
  beats: number;
  chord: Chord;
}

/** Acorde en segundos (plan temporal o audio). */
export interface TimedChord {
  startS: number;
  endS: number;
  chord: Chord;
}

const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const pc = (n: number) => ((n % 12) + 12) % 12;

/** "Lam" / "Sol" o, con detalles técnicos, "Am" / "G". */
export function chordName(c: Chord, letters = false): string {
  return (letters ? LETTERS : SOLFEGE)[pc(c.root)] + (c.quality === 'min' ? 'm' : '');
}

export function transposeChord(c: Chord, semitones: number): Chord {
  return { ...c, root: pc(c.root + semitones) };
}

/** "Am" → { root: 9, quality: 'min' }. */
export function parseChord(symbol: string): Chord {
  const m = /^([A-G])([#b]?)(m?)$/.exec(symbol.trim());
  if (!m) throw new Error(`Acorde inválido: ${symbol}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return { root: pc(LETTER_PC[m[1]] + acc), quality: m[3] ? 'min' : 'maj' };
}

/** "C:4 F:2 C:2" → acordes de una frase en pulsos (con transposición opcional). */
export function phraseChords(spec: string, shift = 0): PhraseChord[] {
  let beat = 0;
  return spec
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [sym, len] = tok.split(':');
      const beats = Number(len);
      const out = { startBeat: beat, beats, chord: transposeChord(parseChord(sym), shift) };
      beat += beats;
      return out;
    });
}

export function chordPitchClasses(c: Chord): number[] {
  return [c.root, c.root + (c.quality === 'min' ? 3 : 4), c.root + 7].map(pc);
}

/**
 * Disposición para tocar el acorde: bajo (fundamental entre Mi2 y Re#3) y tríada cerrada
 * alrededor de Do4, por debajo de la melodía para no taparla.
 */
export function chordMidis(c: Chord): number[] {
  const bass = 40 + pc(c.root - 4); // E2..D#3
  const [r, t, f] = chordPitchClasses(c);
  const near = (p: number) => 52 + pc(p - 52 + 12); // F#3..F4 aprox.
  const triad = [near(r), near(t), near(f)].sort((a, b) => a - b);
  return [bass, ...triad];
}
