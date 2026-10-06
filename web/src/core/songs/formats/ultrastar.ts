import { MelodyFormatError, type ParsedMelody, type TimedNote } from './types';

/**
 * UltraStar `.txt` (formato de karaoke de UltraStar Deluxe / Vocaluxe / Performous):
 *
 *   #TITLE:…  #ARTIST:…  #BPM:300  #GAP:12000 (ms)  #RELATIVE:yes (opcional)
 *   : 0 4 5 Ho      ← tipo, pulso inicial, duración (pulsos), altura (0 = C4), sílaba
 *   * 4 4 7 la      ← nota dorada        F / R / G: libre o rap (sin altura que puntuar)
 *   - 10            ← salto de línea de la letra (en modo relativo: "- 10 12")
 *   E               ← fin
 *
 * Un pulso dura 60 / (BPM × 4) s. Solo se lee la voz principal (P1 en los dúos).
 */
export function parseUltraStar(text: string): ParsedMelody {
  const header: Record<string, string> = {};
  const notes: TimedNote[] = [];
  const lineStarts: number[] = [];
  const warnings: string[] = [];
  let pendingLine = true;
  let lineOffset = 0; // modo relativo
  let player = 1;
  let freestyle = 0;

  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (line.startsWith('#')) {
      const i = line.indexOf(':');
      if (i > 0) header[line.slice(1, i).trim().toUpperCase()] = line.slice(i + 1).trim();
      continue;
    }
    const kind = line[0];
    if (kind === 'E') break;
    if (kind === 'P') {
      player = Number(line.slice(1).trim()) || 1;
      continue;
    }
    if (player !== 1) continue; // dúos: solo la primera voz
    const bpm = Number((header.BPM ?? '').replace(',', '.'));
    if (!(bpm > 0)) throw new MelodyFormatError('El archivo UltraStar no indica el tempo (#BPM).');
    const beatS = 60 / (bpm * 4);
    const gapS = Number((header.GAP ?? '0').replace(',', '.')) / 1000;
    const relative = (header.RELATIVE ?? '').toLowerCase() === 'yes';

    if (kind === '-') {
      const parts = line.slice(1).trim().split(/\s+/).map(Number);
      if (relative) lineOffset += parts[1] ?? parts[0] ?? 0;
      pendingLine = true;
      continue;
    }
    const m = /^([:*FRG])\s*(-?\d+)\s+(\d+)\s+(-?\d+)\s?(.*)$/.exec(line);
    if (!m) continue;
    const [, type, start, length, pitch, syllable] = m;
    const startBeat = Number(start) + (relative ? lineOffset : 0);
    const startS = gapS + startBeat * beatS;
    const endS = startS + Math.max(1, Number(length)) * beatS;
    if (pendingLine) {
      lineStarts.push(startS);
      pendingLine = false;
    }
    if (type === 'F' || type === 'R' || type === 'G') {
      freestyle++;
      // Sin altura que cantar: la sílaba se conserva en la nota anterior para no perder la letra.
      if (notes.length && syllable) notes[notes.length - 1].syllable = (notes[notes.length - 1].syllable ?? '') + syllable;
      continue;
    }
    notes.push({ startS, endS, midi: 60 + Number(pitch), syllable });
  }

  if (!notes.length) throw new MelodyFormatError('El archivo UltraStar no tiene notas.');
  if (freestyle) warnings.push(`${freestyle} sílabas habladas o libres (rap) no tienen nota que cantar.`);
  if (header.DUETSINGERP1 || header.P1) warnings.push('Es un dúo: se usa la primera voz.');
  notes.sort((a, b) => a.startS - b.startS);
  return { title: header.TITLE || 'Canción importada', artist: header.ARTIST, notes, lineStartsS: lineStarts, warnings };
}

/** Los .txt de UltraStar suelen venir en UTF-8, pero muchos antiguos están en Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
