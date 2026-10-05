import { describe, expect, it } from 'vitest';
import { midiToFreq } from '../music/notes';
import { tone, VOICE_LIKE_HARMONICS, whiteNoise, withNoise } from '../pitch/signals';
import { allPhrases } from './melody';
import { EXTRACTION_SAMPLE_RATE } from './melody-extraction';
import { estimateKey, notesToSong, trackPitch, transcribeAudio, tuningOffsetCents } from './transcribe';

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

  it('separa en frases por los silencios y genera una canción practicable', () => {
    const song = notesToSong(transcribe(sing(MELODY)), { id: 'import-test', title: 'Prueba' });
    const phrases = allPhrases(song);
    expect(phrases).toHaveLength(2);
    expect(phrases.map((p) => p.phrase.notes.length)).toEqual([5, 3]);
    expect(phrases[0].phrase.lyrics).toBe('0:00 – 0:02');
    expect(song.license).toBe('user-provided');
    expect(song.bpm).toBe(60);
  });

  it('parte las frases demasiado largas por su mayor silencio', () => {
    const notes = Array.from({ length: 12 }, (_, i) => ({ midi: 60 + (i % 3), startS: i * 1 + (i === 6 ? 0.25 : 0), endS: i * 1 + 0.8 }));
    const song = notesToSong(notes, { id: 'x', title: 'x' }, { phraseGapS: 0.35, maxPhraseS: 8 });
    expect(allPhrases(song).map((p) => p.phrase.notes.length)).toEqual([6, 6]);
  });

  it('estima la tonalidad', () => {
    const n = (midi: number, d = 1) => ({ midi, startS: 0, endS: d });
    // Do mayor: escala con tónica y quinta largas.
    expect(estimateKey([n(60, 3), n(62), n(64, 2), n(65), n(67, 3), n(69), n(71), n(72, 2)])).toEqual({ tonic: 60, mode: 'mayor' });
    // La menor: insistiendo en La, Do y Mi.
    expect(estimateKey([n(57, 4), n(59), n(60, 2), n(62), n(64, 3), n(65), n(67), n(69, 3)])).toEqual({ tonic: 69, mode: 'menor' });
  });
});
