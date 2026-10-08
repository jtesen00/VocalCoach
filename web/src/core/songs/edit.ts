import { secondsPerBeat } from './melody';
import { phraseTimeLabel } from './transcribe';
import type { MelodyNote, Song, SongPhrase } from './types';

/**
 * Edición de canciones importadas (Fase 8c): título, letra y frases. Funciones puras que
 * devuelven una canción nueva. Los ids de las frases que siguen existiendo no cambian, para
 * conservar el progreso guardado de cada una.
 */

const clone = (song: Song): Song => structuredClone(song);

function findPhrase(song: Song, id: string): { s: number; p: number } {
  for (let s = 0; s < song.sections.length; s++) {
    const p = song.sections[s].phrases.findIndex((x) => x.id === id);
    if (p >= 0) return { s, p };
  }
  throw new Error(`No existe la frase ${id}`);
}

const dropEmptySections = (song: Song): Song => ({ ...song, sections: song.sections.filter((s) => s.phrases.length) });

function newPhraseId(song: Song): string {
  const used = new Set(song.sections.flatMap((s) => s.phrases.map((p) => p.id)));
  let n = used.size + 1;
  while (used.has(`p${n}`)) n++;
  return `p${n}`;
}

const durationBeats = (notes: readonly MelodyNote[]) => notes.reduce((a, n) => a + (n.restBefore ?? 0) + n.beats, 0);

/** ¿La frase tiene letra de verdad (no solo los minutos de la extracción)? */
export function hasLyrics(phrase: SongPhrase): boolean {
  return phrase.notes.some((n) => n.syllable.trim());
}

/** Sin letra: los minutos de la original ("0:12 – 0:18"), si se conocen. */
function timeLabel(song: Song, phrase: SongPhrase): string {
  return phrase.originS !== undefined ? phraseTimeLabel(phrase.originS, phrase.originS + durationBeats(phrase.notes) * secondsPerBeat(song)) : '';
}

/**
 * Parte la letra mostrada tras las sílabas de las `k` primeras notas, buscándolas en orden
 * (así se conservan las palabras y la puntuación). Si no se encuentran, se unen las sílabas.
 */
export function splitLyricsAt(lyrics: string, syllables: readonly string[], k: number): [string, string] {
  let idx = 0;
  for (const syl of syllables.slice(0, k).map((x) => x.trim()).filter(Boolean)) {
    const pos = lyrics.indexOf(syl, idx);
    if (pos < 0) {
      const join = (xs: readonly string[]) => xs.map((x) => x.trim()).filter(Boolean).join(' ');
      return [join(syllables.slice(0, k)), join(syllables.slice(k))];
    }
    idx = pos + syl.length;
  }
  return [lyrics.slice(0, idx).trim(), lyrics.slice(idx).trim()];
}

export function renameSong(song: Song, title: string): Song {
  const t = title.trim();
  return t ? { ...song, title: t } : song;
}

/**
 * Letra → sílabas de las notas. Las sílabas se separan con espacios o guiones ("a-mor mí-o").
 * - Con tantas sílabas como notas, una por nota.
 * - Con menos, cada sílaba empieza en la nota proporcional a su posición y las notas
 *   intermedias quedan sin texto (se alarga la sílaba anterior, como un melisma).
 * - Con más, las que sobran se juntan en la última nota.
 */
export function distributeLyrics(text: string, noteCount: number): string[] {
  const syl = text.split(/[\s-]+/).filter(Boolean);
  const out = new Array<string>(noteCount).fill('');
  if (!syl.length || !noteCount) return out;
  if (syl.length >= noteCount) {
    for (let i = 0; i < noteCount - 1; i++) out[i] = syl[i];
    out[noteCount - 1] = syl.slice(noteCount - 1).join(' ');
    return out;
  }
  syl.forEach((s, i) => (out[Math.floor((i * noteCount) / syl.length)] = s));
  return out;
}

/** Cambia la letra de una frase. Una letra vacía deja la frase sin letra. */
export function setPhraseLyrics(song: Song, phraseId: string, text: string): Song {
  const out = clone(song);
  const { s, p } = findPhrase(out, phraseId);
  const phrase = out.sections[s].phrases[p];
  const clean = text.replace(/\s+/g, ' ').trim();
  const syllables = distributeLyrics(clean, phrase.notes.length);
  phrase.notes.forEach((n, i) => (n.syllable = syllables[i]));
  phrase.lyrics = clean.replace(/-/g, '');
  return out;
}

export function deletePhrase(song: Song, phraseId: string): Song {
  const out = clone(song);
  const { s, p } = findPhrase(out, phraseId);
  out.sections[s].phrases.splice(p, 1);
  return dropEmptySections(out);
}

/** Toda la frase una octava arriba (+12) o abajo (−12): corrige un error típico de la extracción. */
export function shiftPhraseOctave(song: Song, phraseId: string, semitones: 12 | -12): Song {
  const out = clone(song);
  const { s, p } = findPhrase(out, phraseId);
  for (const n of out.sections[s].phrases[p].notes) n.midi += semitones;
  return out;
}

/** Une una frase con la siguiente (aunque esté en la sección siguiente); conserva el id de la primera. */
export function mergeWithNext(song: Song, phraseId: string): Song {
  const out = clone(song);
  const flat = out.sections.flatMap((sec, s) => sec.phrases.map((_, p) => ({ s, p })));
  const i = flat.findIndex(({ s, p }) => out.sections[s].phrases[p].id === phraseId);
  if (i < 0) throw new Error(`No existe la frase ${phraseId}`);
  if (i === flat.length - 1) return song;
  const a = out.sections[flat[i].s].phrases[flat[i].p];
  const b = out.sections[flat[i + 1].s].phrases[flat[i + 1].p];
  // Silencio entre las dos: del tiempo original si se conoce; si no, medio pulso.
  const spb = secondsPerBeat(out);
  const gapBeats = a.originS !== undefined && b.originS !== undefined
    ? Math.max(0, (b.originS - a.originS) / spb - durationBeats(a.notes))
    : 0.5;
  const shift = durationBeats(a.notes) + gapBeats;
  const withLyrics = [a, b].filter(hasLyrics).map((x) => x.lyrics);
  const [first, ...rest] = b.notes;
  a.notes.push({ ...first, restBefore: gapBeats + (first.restBefore ?? 0) }, ...rest);
  if (b.chords?.length) a.chords = [...(a.chords ?? []), ...b.chords.map((c) => ({ ...c, startBeat: c.startBeat + shift }))];
  a.lyrics = withLyrics.length ? withLyrics.join(' ') : timeLabel(out, a);
  out.sections[flat[i + 1].s].phrases.splice(flat[i + 1].p, 1);
  return dropEmptySections(out);
}

/** Divide una frase antes de la nota `noteIndex` (1..n−1). La segunda parte recibe un id nuevo. */
export function splitPhrase(song: Song, phraseId: string, noteIndex: number): Song {
  const out = clone(song);
  const { s, p } = findPhrase(out, phraseId);
  const a = out.sections[s].phrases[p];
  if (noteIndex < 1 || noteIndex >= a.notes.length) return song;
  const head = a.notes.slice(0, noteIndex);
  const tail = a.notes.slice(noteIndex);
  const offset = durationBeats(head) + (tail[0].restBefore ?? 0);
  const lyrics = hasLyrics(a) ? splitLyricsAt(a.lyrics, a.notes.map((n) => n.syllable), noteIndex) : null;
  const b: SongPhrase = {
    id: newPhraseId(out),
    lyrics: '',
    notes: [{ ...tail[0], restBefore: 0 }, ...tail.slice(1)],
    originS: a.originS !== undefined ? a.originS + offset * secondsPerBeat(out) : undefined,
  };
  if (a.chords?.length) {
    const headBeats = durationBeats(head);
    b.chords = a.chords
      .filter((c) => c.startBeat + c.beats > offset)
      .map((c) => ({ ...c, startBeat: Math.max(0, c.startBeat - offset), beats: c.beats - Math.max(0, offset - c.startBeat) }));
    a.chords = a.chords.filter((c) => c.startBeat < headBeats).map((c) => ({ ...c, beats: Math.min(c.beats, headBeats - c.startBeat) }));
  }
  a.notes = head;
  // Cada parte se queda con su letra (o, sin letra, con sus minutos).
  a.lyrics = lyrics ? lyrics[0] : timeLabel(out, a);
  b.lyrics = lyrics ? lyrics[1] : timeLabel(out, b);
  out.sections[s].phrases.splice(p + 1, 0, b);
  return out;
}

/** Punto de corte natural: antes de la nota con el silencio previo más largo cerca de la mitad. */
export function naturalSplitPoint(phrase: SongPhrase): number {
  const n = phrase.notes.length;
  if (n < 2) return 0;
  let best = Math.floor(n / 2);
  let bestScore = -Infinity;
  for (let i = 1; i < n; i++) {
    // Premia el silencio y penaliza alejarse del centro (en notas).
    const score = (phrase.notes[i].restBefore ?? 0) - 0.15 * Math.abs(i - n / 2) / Math.max(1, n / 2);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
