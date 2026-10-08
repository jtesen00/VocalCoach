import type { NotesExercise, ExercisePlan, PlanSegment } from '../exercises/types';
import { phraseChords, transposeChord, type PhraseChord } from '../music/chords';
import type { MelodyNote, PhraseRef, Song, SongPhrase } from './types';

/**
 * Construye las notas de una frase a partir de:
 * - `lyrics` con sílabas separadas por "-" y palabras por espacios; "_" une dos sílabas en una nota
 *   (sinalefa: "dón-de_es-tás" son 3 notas);
 * - alturas MIDI y duraciones en pulsos, una por sílaba.
 */
export function phrase(id: string, lyrics: string, midis: readonly number[], beats: readonly number[], shift = 0, chords?: string): SongPhrase {
  const syllables = lyrics.split(/[\s-]+/).filter(Boolean).map((s) => s.replace(/_/g, ' '));
  if (syllables.length !== midis.length || midis.length !== beats.length) {
    throw new Error(`Frase ${id}: ${syllables.length} sílabas, ${midis.length} notas y ${beats.length} duraciones`);
  }
  const notes: MelodyNote[] = midis.map((m, i) => ({ midi: m + shift, beats: beats[i], syllable: syllables[i] }));
  const total = beats.reduce((a, b) => a + b, 0);
  const pc: PhraseChord[] | undefined = chords ? phraseChords(chords, shift) : undefined;
  if (pc && Math.abs(pc.reduce((a, c) => a + c.beats, 0) - total) > 1e-6) {
    throw new Error(`Frase ${id}: los acordes duran ${pc.reduce((a, c) => a + c.beats, 0)} pulsos y la melodía ${total}`);
  }
  return { id, lyrics: lyrics.replace(/-/g, '').replace(/_/g, ' '), notes, chords: pc };
}

export function allPhrases(song: Song): PhraseRef[] {
  const out: PhraseRef[] = [];
  for (const section of song.sections) for (const p of section.phrases) out.push({ song, section, phrase: p, index: out.length });
  return out;
}

export function allNotes(song: Song): MelodyNote[] {
  return song.sections.flatMap((s) => s.phrases.flatMap((p) => p.notes));
}

export function secondsPerBeat(song: Song, tempo = 1): number {
  return 60 / song.bpm / tempo;
}

/**
 * Convierte una frase en el mismo plan temporal que usan los ejercicios, para reutilizar
 * el motor de pitch, la evaluación, la línea de tiempo y el profesor sin duplicar código.
 * `transpose` en semitonos; `tempo` < 1 la hace más lenta.
 */
export function phrasePlan(ref: PhraseRef, transpose = 0, tempo = 1): ExercisePlan {
  const spb = secondsPerBeat(ref.song, tempo);
  const segments: PlanSegment[] = [];
  let t = 0;
  for (const n of ref.phrase.notes) {
    t += (n.restBefore ?? 0) * spb;
    const d = n.beats * spb;
    segments.push({ startS: t, endS: t + d, fromMidi: n.midi + transpose, toMidi: n.midi + transpose, label: n.syllable });
    t += d;
  }
  const def: NotesExercise = {
    id: `${ref.song.id}/${ref.phrase.id}`,
    kind: 'sequence',
    title: `Frase ${ref.index + 1}`,
    summary: ref.phrase.lyrics,
    instructions: ref.phrase.lyrics,
    level: 'intermediate',
    notes: ref.phrase.notes.map((n) => ({ offset: n.midi - ref.phrase.notes[0].midi, durationMs: n.beats * spb * 1000 })),
  };
  const chords = ref.phrase.chords?.map((c) => ({
    startS: c.startBeat * spb,
    endS: (c.startBeat + c.beats) * spb,
    chord: transposeChord(c.chord, transpose),
  }));
  return { def, rootMidi: ref.phrase.notes[0].midi + transpose, segments, durationS: t, chords };
}
