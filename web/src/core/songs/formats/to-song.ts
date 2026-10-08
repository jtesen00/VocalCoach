import { karaokeLines, estimateKey } from '../transcribe';
import type { MelodyNote, Song, SongPhrase, SongSection } from '../types';
import type { ParsedMelody, TimedNote } from './types';

export type MelodyFileFormat = 'ultrastar' | 'midi' | 'musicxml';

const SECTION_GAP_S = 2.5;
const MAX_LINE_S = 14;
const MAX_PHRASES_PER_SECTION = 6;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Sílaba para mostrar bajo su nota: sin espacios ni marcas de melisma ("~") de UltraStar. */
const cleanSyllable = (s: string | undefined) => (s ?? '').replace(/~/g, '').trim();

/** Letra de una línea: las sílabas unidas tal cual (las que empiezan palabra traen su espacio). */
function lineLyrics(notes: readonly TimedNote[]): string {
  return notes.map((n) => (n.syllable ?? '').replace(/~/g, '')).join('').replace(/\s+/g, ' ').trim();
}

/** Corta en líneas: las del archivo si las trae; si no (o si alguna es demasiado larga), tipo karaoke. */
function splitLines(notes: TimedNote[], lineStarts: readonly number[]): TimedNote[][] {
  const lines: TimedNote[][] = [];
  if (lineStarts.length >= 2) {
    const starts = [...lineStarts].sort((a, b) => a - b);
    let li = 0;
    for (const n of notes) {
      while (li + 1 < starts.length && n.startS >= starts[li + 1] - 1e-6) li++;
      (lines[li] ??= []).push(n);
    }
  } else {
    lines.push(notes);
  }
  return lines
    .filter((l) => l?.length)
    .flatMap((l) => {
      if (lineStarts.length >= 2 && l[l.length - 1].endS - l[0].startS <= MAX_LINE_S) return [l];
      // Sin cortes en el archivo, o línea demasiado larga: líneas tipo karaoke conservando las sílabas.
      const index = new Map(l.map((n, i) => [n, i]));
      return karaokeLines(l).lines.map((group) => group.map((g) => l[index.get(g as TimedNote)!]));
    });
}

/**
 * Melodía de archivo → canción practicable. La melodía es exacta (no hay que extraerla) y,
 * si el archivo trae letra, cada frase la muestra sílaba a sílaba.
 */
export function melodyToSong(parsed: ParsedMelody, meta: { id: string; format: MelodyFileFormat }): Song {
  // Una nota a la vez, ordenadas, sin duraciones nulas.
  const notes = parsed.notes
    .filter((n) => n.endS - n.startS > 0.02)
    .sort((a, b) => a.startS - b.startS)
    .map((n) => ({ ...n }));
  for (let i = 0; i + 1 < notes.length; i++) notes[i].endS = Math.min(notes[i].endS, notes[i + 1].startS);

  const lines = splitLines(notes, parsed.lineStartsS);
  const phrases: { phrase: SongPhrase; startS: number; endS: number }[] = lines.map((line, i) => {
    const origin = line[0].startS;
    const end = line[line.length - 1].endS;
    const lyrics = lineLyrics(line);
    return {
      startS: origin,
      endS: end,
      phrase: {
        id: `p${i + 1}`,
        lyrics: lyrics || `${clock(origin)} – ${clock(end)}`,
        originS: origin,
        notes: line.map(
          (n, j): MelodyNote => ({
            midi: n.midi,
            beats: n.endS - n.startS,
            restBefore: j ? Math.max(0, n.startS - line[j - 1].endS) : 0,
            syllable: cleanSyllable(n.syllable),
          }),
        ),
      },
    };
  });

  const sections: SongSection[] = [];
  phrases.forEach((p, i) => {
    const cur = sections[sections.length - 1];
    const gap = i ? p.startS - phrases[i - 1].endS : Infinity;
    if (!cur || gap >= SECTION_GAP_S || cur.phrases.length >= MAX_PHRASES_PER_SECTION) sections.push({ name: `Parte ${sections.length + 1}`, phrases: [] });
    sections[sections.length - 1].phrases.push(p.phrase);
  });

  const label = { ultrastar: 'UltraStar', midi: 'MIDI', musicxml: 'MusicXML' }[meta.format];
  return {
    id: meta.id,
    title: parsed.title,
    credit: `${parsed.artist ? `${parsed.artist} · ` : ''}importada por ti desde un archivo ${label} · solo en este dispositivo · uso educativo personal`,
    license: 'user-provided',
    bpm: 60, // un pulso = un segundo: las duraciones ya vienen en segundos
    key: estimateKey(notes),
    sections,
    source: { format: meta.format, warnings: parsed.warnings },
  };
}
