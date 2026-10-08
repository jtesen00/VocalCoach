import { secondsPerBeat } from './melody';
import { fitSyllables, syllabifyText, syllabifyWord } from './syllables';
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
 * Letra → sílabas de las notas. Las palabras se separan solas en sílabas; los guiones que
 * escriba el usuario mandan («a-mor»).
 * - Con tantas sílabas como notas, una por nota.
 * - Si sobran, se unen las sinalefas («de_es») y, si aún sobran, las últimas en la última nota.
 * - Si faltan, cada sílaba empieza en la nota proporcional y las demás alargan la anterior (melisma).
 */
export function distributeLyrics(text: string, noteCount: number): string[] {
  return fitSyllables(syllabifyText(text), noteCount);
}

/** Cambia la letra de una frase. Una letra vacía deja la frase sin letra. */
export function setPhraseLyrics(song: Song, phraseId: string, text: string): Song {
  const out = clone(song);
  const { s, p } = findPhrase(out, phraseId);
  const phrase = out.sections[s].phrases[p];
  const clean = text.replace(/\s+/g, ' ').trim();
  const syllables = distributeLyrics(clean, phrase.notes.length);
  phrase.notes.forEach((n, i) => (n.syllable = syllables[i]));
  phrase.lyrics = clean.replace(/-/g, '').replace(/_/g, ' ');
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

/**
 * Letra completa de la canción → letra de cada frase. Se cuentan las sílabas de cada palabra y
 * se reparten las palabras entre las frases (en orden, sin partir palabras) con programación
 * dinámica: cada frase debería recibir tantas sílabas como notas tiene, y se prefiere cortar
 * donde el usuario puso un salto de línea. Con tantas líneas como frases, una línea por frase.
 */
export function splitSongLyrics(text: string, noteCounts: readonly number[]): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const K = noteCounts.length;
  if (!K) return [];
  if (lines.length === K) return lines;
  const words: { text: string; syl: number; lineEnd: boolean }[] = [];
  for (const line of lines) {
    const ws = line.split(' ');
    ws.forEach((w, i) => words.push({ text: w, syl: w.includes('-') ? w.split('-').filter(Boolean).length : syllabifyWord(w).length, lineEnd: i === ws.length - 1 }));
  }
  const W = words.length;
  if (!W) return new Array<string>(K).fill('');
  // cost[k][i]: mejor coste repartiendo las palabras [0, i) entre las frases [0, k).
  const INF = Number.POSITIVE_INFINITY;
  const cost = Array.from({ length: K + 1 }, () => new Array<number>(W + 1).fill(INF));
  const from = Array.from({ length: K + 1 }, () => new Array<number>(W + 1).fill(0));
  cost[0][0] = 0;
  for (let k = 1; k <= K; k++) {
    for (let j = 0; j <= W; j++) {
      let syl = 0;
      for (let i = j; i >= 0; i--) {
        if (i < j) syl += words[i].syl;
        if (cost[k - 1][i] === INF) continue;
        const target = noteCounts[k - 1];
        // Frase vacía: muy mal (salvo que no queden palabras). Cortar fuera de un final de línea: penaliza.
        const fill = syl === 0 ? (j < W ? 50 : 4) : (syl - target) ** 2;
        const cut = j > 0 && j < W && !words[j - 1].lineEnd ? 3 : 0;
        const c = cost[k - 1][i] + fill + cut;
        if (c < cost[k][j]) {
          cost[k][j] = c;
          from[k][j] = i;
        }
        if (syl > 3 * target + 6) break;
      }
    }
  }
  const out = new Array<string>(K).fill('');
  for (let k = K, j = W; k > 0; k--) {
    const i = from[k][j];
    out[k - 1] = words.slice(i, j).map((w) => w.text).join(' ');
    j = i;
  }
  return out;
}

/** Aplica la letra completa a todas las frases de la canción. */
export function setSongLyrics(song: Song, text: string): Song {
  const refs = song.sections.flatMap((sec) => sec.phrases);
  const parts = splitSongLyrics(text, refs.map((p) => p.notes.length));
  return refs.reduce((acc, p, k) => setPhraseLyrics(acc, p.id, parts[k] ?? ''), song);
}

/** Sube o baja una nota (en semitonos). */
export function shiftNote(song: Song, phraseId: string, noteIndex: number, semitones: number): Song {
  const out = clone(song);
  const { s, p } = findPhrase(out, phraseId);
  const n = out.sections[s].phrases[p].notes[noteIndex];
  if (n) n.midi += semitones;
  return out;
}

/** Borra una nota: su tiempo pasa a ser silencio antes de la siguiente (la frase no se mueve). */
export function deleteNote(song: Song, phraseId: string, noteIndex: number): Song {
  const out = clone(song);
  const { s, p } = findPhrase(out, phraseId);
  const phrase = out.sections[s].phrases[p];
  if (phrase.notes.length <= 1 || !phrase.notes[noteIndex]) return song;
  const [gone] = phrase.notes.splice(noteIndex, 1);
  const next = phrase.notes[noteIndex];
  if (noteIndex === 0) {
    // La frase empieza más tarde: se desplaza su origen en lugar de dejar un silencio inicial.
    const spb = secondsPerBeat(out);
    if (phrase.originS !== undefined) phrase.originS += ((gone.restBefore ?? 0) + gone.beats + (next.restBefore ?? 0)) * spb;
    next.restBefore = 0;
  } else if (next) {
    next.restBefore = (next.restBefore ?? 0) + (gone.restBefore ?? 0) + gone.beats;
  }
  // La sílaba no se pierde: pasa a la siguiente si esa no tiene (melisma); si no, se junta a la anterior.
  const syl = gone.syllable.trim();
  if (syl) {
    const prev = phrase.notes[noteIndex - 1];
    if (next && !next.syllable.trim()) next.syllable = syl;
    else if (prev) prev.syllable = `${prev.syllable.trim()} ${syl}`.trim();
    else if (next) next.syllable = `${syl} ${next.syllable.trim()}`.trim();
  }
  return out;
}
