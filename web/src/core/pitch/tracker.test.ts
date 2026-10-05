import { describe, expect, it } from 'vitest';
import { midiToFreq } from '../music/notes';
import { createDetector, DEFAULT_DETECTOR_OPTIONS, rmsDb } from './detector';
import { frames, tone, VOICE_LIKE_HARMONICS, whiteNoise } from './signals';
import { PitchTracker } from './tracker';
import type { PitchFrame, RawPitchFrame } from './types';

const SR = 48000;
const { windowSize, hopSize } = DEFAULT_DETECTOR_OPTIONS;

function run(signal: Float32Array): PitchFrame[] {
  const detector = createDetector('mpm', { sampleRate: SR, ...DEFAULT_DETECTOR_OPTIONS });
  const tracker = new PitchTracker();
  const out: PitchFrame[] = [];
  for (const { frame, end } of frames(signal, windowSize, hopSize)) {
    out.push(tracker.push({ t: end / SR, levelDb: rmsDb(frame), ...detector.detect(frame) }));
  }
  return out;
}

const raw = (t: number, f0: number | null, clarity = 0.95, levelDb = -20): RawPitchFrame => ({ t, f0, clarity, levelDb });

describe('PitchTracker', () => {
  it('no detecta voz en silencio', () => {
    expect(run(new Float32Array(SR)).some((f) => f.voiced)).toBe(false);
  });

  it('no detecta voz en ruido blanco', () => {
    const out = run(whiteNoise(SR, 2, 0.1));
    expect(out.filter((f) => f.voiced).length / out.length).toBeLessThan(0.02);
  });

  it('detecta una nota sostenida en pocos frames', () => {
    const out = run(tone({ sampleRate: SR, durationS: 1, hz: midiToFreq(60), harmonics: VOICE_LIKE_HARMONICS }));
    const firstVoiced = out.findIndex((f) => f.voiced);
    expect(firstVoiced).toBeGreaterThanOrEqual(0);
    expect(firstVoiced).toBeLessThanOrEqual(2);
    expect(out[out.length - 1].midi!).toBeCloseTo(60, 1);
  });

  it('la mediana elimina un error de octava aislado', () => {
    const tr = new PitchTracker();
    const hz = midiToFreq(60);
    const out = [hz, hz, hz, hz * 2, hz, hz].map((f, i) => tr.push(raw(i * 0.01, f)));
    for (const f of out.slice(2)) expect(Math.round(f.midi!)).toBe(60);
  });

  it('histéresis: un frame sin pitch no corta la voz', () => {
    const tr = new PitchTracker();
    const hz = midiToFreq(60);
    const seq = [hz, hz, hz, null, hz, hz];
    const out = seq.map((f, i) => tr.push(raw(i * 0.01, f, f ? 0.95 : 0)));
    expect(out.slice(1).every((f) => f.voiced)).toBe(true);
  });

  it('vuelve a silencio tras varios frames sin voz', () => {
    const tr = new PitchTracker();
    const hz = midiToFreq(60);
    for (let i = 0; i < 5; i++) tr.push(raw(i * 0.01, hz));
    const tail = [0, 1, 2, 3].map((i) => tr.push(raw(0.1 + i * 0.01, null, 0, -80)));
    expect(tail[tail.length - 1].voiced).toBe(false);
  });
});
