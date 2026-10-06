import { parseMidi } from './midi';
import { parseMusicXml } from './musicxml';
import { melodyToSong, type MelodyFileFormat } from './to-song';
import { decodeText, parseUltraStar } from './ultrastar';
import { MelodyFormatError, type ParsedMelody } from './types';

export { MelodyFormatError } from './types';
export type { MelodyFileFormat } from './to-song';

/** Extensiones de archivo de melodía (sin comprimir). Los .mxl (MusicXML comprimido) se descomprimen antes en el navegador. */
export const MELODY_EXTENSIONS = ['.txt', '.mid', '.midi', '.kar', '.musicxml', '.xml', '.mxl'];

export function isMelodyFile(name: string): boolean {
  const n = name.toLowerCase();
  return MELODY_EXTENSIONS.some((e) => n.endsWith(e));
}

/** Reconoce el formato por el contenido (y, si hace falta, la extensión) y lo lee. */
export function parseMelodyFile(name: string, bytes: Uint8Array): { format: MelodyFileFormat; melody: ParsedMelody } {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 512));
  if (head.startsWith('MThd')) return { format: 'midi', melody: parseMidi(bytes, name) };
  const text = decodeText(bytes);
  if (/<score-(partwise|timewise)/.test(text.slice(0, 4000))) return { format: 'musicxml', melody: parseMusicXml(text) };
  if (/^﻿?#/m.test(text) && /#BPM\s*:/i.test(text)) return { format: 'ultrastar', melody: parseUltraStar(text) };
  throw new MelodyFormatError('No reconocemos el archivo. Usa UltraStar (.txt), MIDI (.mid, .kar) o MusicXML (.musicxml, .xml, .mxl).');
}

/** Archivo de melodía → canción lista para practicar. */
export function songFromMelodyFile(name: string, bytes: Uint8Array, id: string) {
  const { format, melody } = parseMelodyFile(name, bytes);
  return melodyToSong(melody, { id, format });
}
