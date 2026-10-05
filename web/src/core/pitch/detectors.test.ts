import { describe, expect, it } from 'vitest';
import { freqToMidi, midiToFreq, parseNote } from '../music/notes';
import { createDetector, DEFAULT_DETECTOR_OPTIONS } from './detector';
import { tone, VOICE_LIKE_HARMONICS, whiteNoise, withNoise } from './signals';
import type { DetectorKind } from './types';

const SR = 48000;
const opts = { sampleRate: SR, ...DEFAULT_DETECTOR_OPTIONS };
const N = opts.windowSize;

function centsError(kind: DetectorKind, hz: number, harmonics = VOICE_LIKE_HARMONICS) {
  const d = createDetector(kind, opts);
  const sig = tone({ sampleRate: SR, durationS: 0.2, hz, harmonics });
  const est = d.detect(sig.subarray(sig.length - N));
  expect(est.f0).not.toBeNull();
  return { cents: (freqToMidi(est.f0!) - freqToMidi(hz)) * 100, clarity: est.clarity };
}

describe.each<DetectorKind>(['mpm', 'yin'])('detector %s', (kind) => {
  it.each(['E2', 'A2', 'C3', 'G3', 'C4', 'A4', 'E5', 'C6'])('tono tipo voz en %s con error ≤ 3 cents', (name) => {
    const { cents, clarity } = centsError(kind, midiToFreq(parseNote(name)));
    expect(Math.abs(cents)).toBeLessThanOrEqual(3);
    expect(clarity).toBeGreaterThan(0.9);
  });

  it('seno puro en C4', () => {
    expect(Math.abs(centsError(kind, midiToFreq(60), [1]).cents)).toBeLessThanOrEqual(1);
  });

  it.each([10, -20, 7, -35])('distingue C4 %+d cents', (offset) => {
    const d = createDetector(kind, opts);
    const sig = tone({ sampleRate: SR, durationS: 0.2, hz: midiToFreq(60 + offset / 100), harmonics: VOICE_LIKE_HARMONICS });
    const est = d.detect(sig.subarray(sig.length - N));
    expect((freqToMidi(est.f0!) - 60) * 100).toBeCloseTo(offset, 0);
  });

  it('distingue C4, C#4 y D4', () => {
    const d = createDetector(kind, opts);
    const got = [60, 61, 62].map((m) => {
      const sig = tone({ sampleRate: SR, durationS: 0.2, hz: midiToFreq(m), harmonics: VOICE_LIKE_HARMONICS });
      return Math.round(freqToMidi(d.detect(sig.subarray(sig.length - N)).f0!));
    });
    expect(got).toEqual([60, 61, 62]);
  });

  it('sigue funcionando con ruido a 10 dB de SNR', () => {
    const d = createDetector(kind, opts);
    const sig = withNoise(tone({ sampleRate: SR, durationS: 0.2, hz: midiToFreq(57), harmonics: VOICE_LIKE_HARMONICS }), 10);
    const est = d.detect(sig.subarray(sig.length - N));
    expect(Math.abs((freqToMidi(est.f0!) - 57) * 100)).toBeLessThan(10);
  });

  it('silencio → sin pitch', () => {
    const est = createDetector(kind, opts).detect(new Float32Array(N));
    expect(est.f0).toBeNull();
    expect(est.clarity).toBe(0);
  });

  it('ruido blanco → baja confianza', () => {
    const est = createDetector(kind, opts).detect(whiteNoise(SR, N / SR, 0.3, 3));
    expect(est.clarity).toBeLessThan(0.7);
  });
});
