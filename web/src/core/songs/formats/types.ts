/**
 * Melodía leída de un archivo (UltraStar, MIDI o MusicXML), en segundos y antes de
 * convertirla en canción. Formato común para todos los lectores.
 */
export interface TimedNote {
  startS: number;
  endS: number;
  midi: number;
  /** Sílaba de la letra (puede incluir el espacio inicial de una palabra nueva). */
  syllable?: string;
}

export interface ParsedMelody {
  title: string;
  artist?: string;
  notes: TimedNote[];
  /** Inicios de línea de la letra (s): cortes de frase del propio archivo, si los trae. */
  lineStartsS: number[];
  /** Avisos para el usuario (pista elegida, partes ignoradas…). */
  warnings: string[];
}

export class MelodyFormatError extends Error {}
