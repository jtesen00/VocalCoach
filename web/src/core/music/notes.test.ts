import { describe, expect, it } from 'vitest';
import { freqToMidi, midiToFreq, nearestNote, noteName, parseNote } from './notes';

describe('notes', () => {
  it('A4 = 440 Hz = MIDI 69', () => {
    expect(freqToMidi(440)).toBeCloseTo(69, 10);
    expect(midiToFreq(69)).toBeCloseTo(440, 10);
  });

  it('C4 = 261.63 Hz = MIDI 60', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
    expect(noteName(60)).toBe('C4');
  });

  it('respeta una referencia A4 distinta', () => {
    expect(freqToMidi(442, 442)).toBeCloseTo(69, 10);
  });

  it('conserva los cents (no clasifica solo la nota)', () => {
    const plus7 = nearestNote(freqToMidi(midiToFreq(60.07)));
    expect(plus7.name).toBe('C4');
    expect(plus7.cents).toBeCloseTo(7, 6);
    const minus35 = nearestNote(60 - 0.35);
    expect(minus35.name).toBe('C4');
    expect(minus35.cents).toBeCloseTo(-35, 6);
  });

  it('parsea y nombra notas, incluidas alteraciones y octavas negativas', () => {
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('F#3')).toBe(54);
    expect(parseNote('Bb2')).toBe(46);
    expect(noteName(parseNote('C-1'))).toBe('C-1');
    expect(noteName(61)).toBe('C#4');
  });
});
