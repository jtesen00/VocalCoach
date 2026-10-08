import { describe, expect, it } from 'vitest';
import { deletePhrase, distributeLyrics, mergeWithNext, naturalSplitPoint, renameSong, setPhraseLyrics, shiftPhraseOctave, splitLyricsAt, splitPhrase } from './edit';
import { allPhrases, phrasePlan } from './melody';
import { notesToSong } from './transcribe';
import type { Song } from './types';

/** Canción importada desde audio: dos líneas separadas por un silencio largo (bpm 60). */
function imported(): Song {
  const notes = [
    ...[60, 62, 64, 65].map((midi, i) => ({ midi, startS: 10 + i * 0.5, endS: 10.45 + i * 0.5 })),
    ...[67, 65, 64, 62].map((midi, i) => ({ midi, startS: 20 + i * 0.5, endS: 20.45 + i * 0.5 })),
  ];
  return notesToSong(notes, { id: 'import-x', title: 'Mi canción' });
}

describe('editar canciones importadas', () => {
  it('reparte la letra entre las notas', () => {
    expect(distributeLyrics('a-mor mí-o', 4)).toEqual(['a', 'mor', 'mí', 'o']);
    // Menos sílabas que notas: cada una empieza en su nota proporcional; el resto, melisma.
    expect(distributeLyrics('sol mar', 4)).toEqual(['sol', '', 'mar', '']);
    // Más sílabas que notas: las que sobran, en la última.
    expect(distributeLyrics('u-no dos tres', 2)).toEqual(['u', 'no dos tres']);
    expect(distributeLyrics('  ', 3)).toEqual(['', '', '']);
  });

  it('cambia la letra de una frase sin tocar su melodía ni su id', () => {
    const song = imported();
    const id = allPhrases(song)[0].phrase.id;
    const edited = setPhraseLyrics(song, id, 'Luz de puer-to');
    const p = allPhrases(edited)[0].phrase;
    expect(p.id).toBe(id);
    expect(p.lyrics).toBe('Luz de puerto');
    expect(p.notes.map((n) => n.syllable)).toEqual(['Luz', 'de', 'puer', 'to']);
    expect(p.notes.map((n) => n.midi)).toEqual([60, 62, 64, 65]);
    // La original no cambia.
    expect(allPhrases(song)[0].phrase.notes[0].syllable).toBe('');
  });

  it('renombra, borra y cambia de octava', () => {
    const song = imported();
    expect(renameSong(song, '  Otra  ').title).toBe('Otra');
    expect(renameSong(song, ' ').title).toBe('Mi canción');
    const [a, b] = allPhrases(song).map((r) => r.phrase.id);
    expect(allPhrases(deletePhrase(song, a)).map((r) => r.phrase.id)).toEqual([b]);
    expect(allPhrases(shiftPhraseOctave(song, b, -12))[1].phrase.notes[0].midi).toBe(55);
  });

  it('borrar la única frase de una parte quita la parte', () => {
    const song = imported();
    expect(song.sections.length).toBe(2);
    expect(deletePhrase(song, allPhrases(song)[0].phrase.id).sections.length).toBe(1);
  });

  it('une dos frases conservando el silencio real entre ellas', () => {
    const song = setPhraseLyrics(imported(), 'p2', 'ya me voy');
    const merged = mergeWithNext(song, 'p1');
    const refs = allPhrases(merged);
    expect(refs.length).toBe(1);
    expect(refs[0].phrase.id).toBe('p1');
    const plan = phrasePlan(refs[0]);
    // La quinta nota empieza a los 10 s de la primera, como en la original.
    expect(plan.segments[4].startS).toBeCloseTo(10, 5);
    expect(refs[0].phrase.lyrics).toBe('ya me voy');
  });

  it('divide una frase: la segunda parte empieza donde sonaba y tiene un id nuevo', () => {
    const song = setPhraseLyrics(imported(), 'p1', '¡Luz, de puer-to!');
    const split = splitPhrase(song, 'p1', 2);
    const refs = allPhrases(split);
    expect(refs.map((r) => r.phrase.id)).toEqual(['p1', 'p3', 'p2']);
    expect(refs[1].phrase.originS).toBeCloseTo(11, 5);
    expect(refs[1].phrase.notes[0].restBefore).toBe(0);
    expect(refs[0].phrase.lyrics).toBe('¡Luz, de');
    expect(refs[1].phrase.lyrics).toBe('puerto!');
    // Sin letra: cada parte con sus minutos.
    expect(allPhrases(splitPhrase(imported(), 'p1', 2))[1].phrase.lyrics).toBe('0:11 – 0:11');
    // Índices fuera de rango: sin cambios.
    expect(splitPhrase(song, 'p1', 0)).toBe(song);
  });

  it('dividir y volver a unir deja la misma melodía', () => {
    const song = imported();
    const again = mergeWithNext(splitPhrase(song, 'p1', 2), 'p1');
    const plan = (s: Song) => phrasePlan(allPhrases(s)[0]).segments.map((x) => [x.fromMidi, +x.startS.toFixed(6), +x.endS.toFixed(6)]);
    expect(plan(again)).toEqual(plan(song));
  });

  it('parte la letra conservando las palabras', () => {
    expect(splitLyricsAt('¡Luz, de puerto!', ['Luz', 'de', 'puer', 'to'], 3)).toEqual(['¡Luz, de puer', 'to!']);
    expect(splitLyricsAt('otra cosa', ['x', 'y'], 1)).toEqual(['x', 'y']);
  });

  it('el corte natural cae en la respiración más larga', () => {
    const p = allPhrases(imported())[0].phrase;
    const withBreath = { ...p, notes: p.notes.map((n, i) => (i === 3 ? { ...n, restBefore: 0.6 } : n)) };
    expect(naturalSplitPoint(withBreath)).toBe(3);
  });
});
