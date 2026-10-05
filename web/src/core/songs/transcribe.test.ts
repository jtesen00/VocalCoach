import { describe, expect, it } from 'vitest';
import { midiToFreq } from '../music/notes';
import { tone, VOICE_LIKE_HARMONICS, whiteNoise, withNoise } from '../pitch/signals';
import { allPhrases } from './melody';
import { EXTRACTION_SAMPLE_RATE } from './melody-extraction';
import { cleanNotes, estimateKey, karaokeLines, notesToSong, trackPitch, transcribeAudio, tuningOffsetCents } from './transcribe';

const SR = EXTRACTION_SAMPLE_RATE;

/** "Canta" una lista de [midi | null(silencio), segundos] con una voz sintética. */
function sing(parts: [number | null, number][], detuneCents = 0, vibrato = 0): Float32Array {
  const chunks = parts.map(([m, d]) =>
    m === null
      ? new Float32Array(Math.round(d * SR))
      : tone({ sampleRate: SR, durationS: d, hz: (t) => midiToFreq(m + detuneCents / 100 + vibrato * Math.sin(2 * Math.PI * 5.5 * t)), harmonics: VOICE_LIKE_HARMONICS }),
  );
  const out = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// Dos frases: do-re-mi-fa-sol (C4…G4) y sol-mi-do, separadas por 0,6 s de silencio.
const MELODY: [number | null, number][] = [
  [null, 0.3], [60, 0.4], [62, 0.4], [64, 0.4], [65, 0.4], [67, 0.8],
  [null, 0.6], [67, 0.5], [64, 0.5], [60, 1.0], [null, 0.3],
];
const EXPECTED = [60, 62, 64, 65, 67, 67, 64, 60];

const transcribe = (audio: Float32Array) => transcribeAudio(audio, null, SR).notes;

describe('transcripción de la melodía (importar audio)', () => {
  it('recupera las notas de una voz limpia', () => {
    const notes = transcribe(sing(MELODY));
    expect(notes.map((n) => n.midi)).toEqual(EXPECTED);
    expect(notes[4].endS - notes[4].startS).toBeCloseTo(0.8, 1);
  });

  it('corrige una grabación desafinada en bloque (+35 cents, p. ej. otra referencia)', () => {
    expect(tuningOffsetCents(trackPitch(sing(MELODY, 35), SR))).toBeCloseTo(35, -1);
    expect(transcribe(sing(MELODY, 35)).map((n) => n.midi)).toEqual(EXPECTED);
  });

  it('el vibrato no parte una nota en varias', () => {
    expect(transcribe(sing(MELODY, 0, 0.3)).map((n) => n.midi)).toEqual(EXPECTED);
  });

  it('tolera ruido de fondo moderado (SNR 15 dB)', () => {
    const notes = transcribe(withNoise(sing(MELODY), 15));
    expect(notes.map((n) => n.midi)).toEqual(EXPECTED);
  });

  it('el ruido solo no produce notas', () => {
    expect(transcribe(whiteNoise(SR, 2, 0.1, 4))).toEqual([]);
  });

  it('una respiración corta no parte la línea (estilo karaoke) y genera una canción practicable', () => {
    const song = notesToSong(transcribe(sing(MELODY)), { id: 'import-test', title: 'Prueba' });
    const phrases = allPhrases(song);
    // 2,4 s + 0,6 s de respiración + 2 s: una sola línea de 8 notas, como en un karaoke.
    expect(phrases).toHaveLength(1);
    expect(phrases[0].phrase.notes).toHaveLength(8);
    expect(phrases[0].phrase.lyrics).toBe('0:00 – 0:05');
    expect(phrases[0].phrase.originS).toBeCloseTo(0.3, 1);
    expect(song.license).toBe('user-provided');
    expect(song.bpm).toBe(60);
  });

  it('parte las líneas demasiado largas por su mayor silencio', () => {
    const notes = Array.from({ length: 12 }, (_, i) => ({ midi: 60 + (i % 3), startS: i * 1 + (i === 6 ? 0.25 : 0), endS: i * 1 + 0.8 }));
    const song = notesToSong(notes, { id: 'x', title: 'x' });
    expect(allPhrases(song).map((p) => p.phrase.notes.length)).toEqual([6, 6]);
  });

  it('estima la tonalidad', () => {
    const n = (midi: number, d = 1) => ({ midi, startS: 0, endS: d });
    // Do mayor: escala con tónica y quinta largas.
    expect(estimateKey([n(60, 3), n(62), n(64, 2), n(65), n(67, 3), n(69), n(71), n(72, 2)])).toEqual({ tonic: 60, mode: 'mayor' });
    // La menor: insistiendo en La, Do y Mi.
    expect(estimateKey([n(57, 4), n(59), n(60, 2), n(62), n(64, 3), n(65), n(67), n(69, 3)])).toEqual({ tonic: 69, mode: 'menor' });
  });

  it('limpia la línea: funde notas cortísimas, quita saltos sueltos y liga los huecos breves', () => {
    const n = (midi: number, a: number, b: number) => ({ midi, startS: a, endS: b });
    const out = cleanNotes([n(60, 0, 0.5), n(61, 0.52, 0.6), n(62, 0.6, 1), n(80, 1.0, 1.15), n(64, 1.1, 1.8)]);
    expect(out.map((x) => x.midi)).toEqual([60, 62, 64]);
    expect(out[0].endS).toBeCloseTo(0.6, 6); // la nota de 80 ms se fundió con la vecina
    expect(out[1].endS).toBeCloseTo(1.1, 6); // el hueco de 100 ms se cerró (legato)
  });
});

describe('líneas tipo karaoke', () => {
  /** Canción con respiraciones cortas (0,3 s) cada 2,5 s y una parte instrumental de 4 s. */
  function song() {
    const notes = [];
    let t = 0;
    for (let k = 0; k < 24; k++) {
      notes.push({ midi: 60 + (k % 5), startS: t, endS: t + 0.4 });
      t += (k + 1) % 6 === 0 ? 0.7 : 0.5; // cada 6 notas, una respiración algo más larga
      if (k === 11) t += 4; // parte instrumental
    }
    return notes;
  }

  it('líneas de 4–9 s cortadas en las respiraciones, nunca en mitad de un legato', () => {
    const { lines } = karaokeLines(song());
    for (const l of lines) {
      const d = l[l.length - 1].endS - l[0].startS;
      expect(d).toBeGreaterThanOrEqual(2.5);
      expect(d).toBeLessThanOrEqual(9);
    }
    expect(lines.length).toBeLessThanOrEqual(4);
  });

  it('la parte instrumental separa secciones', () => {
    const s = notesToSong(song(), { id: 'x', title: 'x' });
    expect(s.sections.length).toBe(2);
  });

  it('los acordes reconocidos se reparten entre las frases', () => {
    const chords = [
      { startS: 0, endS: 3, chord: { root: 0, quality: 'maj' as const } },
      { startS: 3, endS: 30, chord: { root: 7, quality: 'maj' as const } },
    ];
    const s = notesToSong(song(), { id: 'x', title: 'x' }, { chords });
    const first = allPhrases(s)[0].phrase;
    expect(first.chords![0]).toMatchObject({ startBeat: 0, chord: { root: 0 } });
    expect(first.chords!.some((c) => c.chord.root === 7)).toBe(true);
  });
});
