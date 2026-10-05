import { describe, expect, it } from 'vitest';
import { extractMelody } from './melody-extraction';
import { makeMix, scoreExtraction, type MixOptions } from './test-mix';
import { segmentNotes, trackPitch, transcribeAudio } from './transcribe';
import type { PitchFrame } from '../pitch/types';

const toFrames = (line: ReturnType<typeof extractMelody>): PitchFrame[] =>
  line.map((f) => ({ t: f.t, midi: f.midi, f0: null, clarity: 1, levelDb: 0, voiced: f.midi !== null }));

function evaluate(options: MixOptions) {
  const mix = makeMix(options);
  const frames = toFrames(extractMelody(mix.left, mix.right, mix.sampleRate));
  return scoreExtraction(frames, segmentNotes(frames), mix);
}

/**
 * Canción sintética con voz centrada, piano, guitarra arpegiada en el registro de la voz,
 * bajo y batería. Umbrales: los medidos menos un margen (docs/research/fuentes-de-melodia.md).
 */
describe('extracción de la melodía de una canción completa (voz + instrumentos)', () => {
  it.each<[string, MixOptions, { rpa: number; fa: number; notes: number }]>([
    ['estéreo, voz al nivel de los instrumentos', {}, { rpa: 0.95, fa: 0.1, notes: 0.9 }],
    ['mono (sin información estéreo)', { stereo: false }, { rpa: 0.9, fa: 0.25, notes: 0.85 }],
    ['voz 6 dB por debajo', { vocalDb: -6 }, { rpa: 0.85, fa: 0.35, notes: 0.85 }],
    ['voz recta, sin vibrato', { vibrato: 0 }, { rpa: 0.95, fa: 0.1, notes: 0.9 }],
    ['voz grave (una octava abajo)', { transpose: -12 }, { rpa: 0.95, fa: 0.15, notes: 0.9 }],
    ['voz aguda', { transpose: 7 }, { rpa: 0.9, fa: 0.1, notes: 0.85 }],
    ['notas rápidas', { speed: 0.6 }, { rpa: 0.95, fa: 0.1, notes: 0.9 }],
  ])('%s', (_, options, min) => {
    const s = evaluate(options);
    expect(s.rawPitchAccuracy).toBeGreaterThanOrEqual(min.rpa);
    expect(s.voicingFalseAlarm).toBeLessThanOrEqual(min.fa);
    expect(s.noteRecall).toBeGreaterThanOrEqual(min.notes);
  });

  it('el detector monofónico anterior no sirve para mezclas (referencia del problema)', () => {
    const mix = makeMix({ sampleRate: 16000 });
    const mono = mix.left.map((v, i) => (v + mix.right[i]) / 2);
    const frames = trackPitch(mono, 16000);
    expect(scoreExtraction(frames, segmentNotes(frames), mix).rawPitchAccuracy).toBeLessThan(0.1);
  });

  it('separa sílabas repetidas en la misma nota', () => {
    const mix = makeMix({});
    const { notes } = transcribeAudio(mix.left, mix.right, mix.sampleRate);
    // La melodía empieza con dos Mi (64-64) y el estribillo tiene dos Do agudos (72-72).
    const seq = notes.map((n) => n.midi);
    expect(seq.slice(0, 2)).toEqual([64, 64]);
    expect(seq.join(',')).toContain('72,72');
  });

  it('calidad de la extracción: buena en una mezcla estéreo con la voz clara', () => {
    const mix = makeMix({});
    expect(transcribeAudio(mix.left, mix.right, mix.sampleRate).quality).toMatchObject({ stereo: true, level: 'buena' });
  });
});
