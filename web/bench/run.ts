/**
 * Benchmark del motor de pitch con el mismo código que corre en el AudioWorklet.
 *
 *   pnpm bench                     → señales sintéticas: precisión, errores de octava, falsos positivos y coste
 *   pnpm bench -- voz.wav [ref.csv] → trayectoria de un WAV; con ref.csv (t,hz) calcula RPA contra la referencia
 *
 * Criterios de aceptación: docs/PLAN.md §9.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { freqToMidi, midiToFreq, noteName } from '../src/core/music/notes';
import { createDetector, DEFAULT_DETECTOR_OPTIONS, rmsDb } from '../src/core/pitch/detector';
import { frames, mix, tone, VOICE_LIKE_HARMONICS, whiteNoise, withNoise } from '../src/core/pitch/signals';
import { PitchTracker } from '../src/core/pitch/tracker';
import type { DetectorKind, PitchFrame } from '../src/core/pitch/types';
import { readWav } from './wav';

const DETECTORS: DetectorKind[] = ['mpm', 'yin'];
const { windowSize, hopSize } = DEFAULT_DETECTOR_OPTIONS;

function analyse(kind: DetectorKind, signal: Float32Array, sampleRate: number) {
  const detector = createDetector(kind, { sampleRate, ...DEFAULT_DETECTOR_OPTIONS });
  const tracker = new PitchTracker();
  const out: PitchFrame[] = [];
  let ms = 0;
  for (const { frame, end } of frames(signal, windowSize, hopSize)) {
    const t0 = performance.now();
    const est = detector.detect(frame);
    ms += performance.now() - t0;
    out.push(tracker.push({ t: end / sampleRate, levelDb: rmsDb(frame), ...est }));
  }
  return { frames: out, msPerFrame: ms / Math.max(1, out.length) };
}

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function synthetic() {
  const SR = 48000;
  const notes: number[] = [];
  for (let m = 40; m <= 84; m++) notes.push(m); // E2..C6
  const cases: { name: string; make: (m: number) => { signal: Float32Array; truth: (t: number) => number } }[] = [
    { name: 'limpio', make: (m) => ({ signal: tone({ sampleRate: SR, durationS: 1, hz: midiToFreq(m), harmonics: VOICE_LIKE_HARMONICS }), truth: () => m }) },
    { name: '+10 c', make: (m) => ({ signal: tone({ sampleRate: SR, durationS: 1, hz: midiToFreq(m + 0.1), harmonics: VOICE_LIKE_HARMONICS }), truth: () => m + 0.1 }) },
    { name: '−20 c', make: (m) => ({ signal: tone({ sampleRate: SR, durationS: 1, hz: midiToFreq(m - 0.2), harmonics: VOICE_LIKE_HARMONICS }), truth: () => m - 0.2 }) },
    {
      name: 'vibrato 5,5 Hz ±50 c',
      make: (m) => {
        const truth = (t: number) => m + 0.5 * Math.sin(2 * Math.PI * 5.5 * t);
        return { signal: tone({ sampleRate: SR, durationS: 1, hz: (t) => midiToFreq(truth(t)), harmonics: VOICE_LIKE_HARMONICS }), truth };
      },
    },
    { name: 'ruido SNR 20 dB', make: (m) => ({ signal: withNoise(tone({ sampleRate: SR, durationS: 1, hz: midiToFreq(m), harmonics: VOICE_LIKE_HARMONICS }), 20), truth: () => m }) },
    { name: 'ruido SNR 10 dB', make: (m) => ({ signal: withNoise(tone({ sampleRate: SR, durationS: 1, hz: midiToFreq(m), harmonics: VOICE_LIKE_HARMONICS }), 10), truth: () => m }) },
  ];

  console.log(`\nSeñales sintéticas · ${SR} Hz · ventana ${windowSize} · salto ${hopSize} · notas ${noteName(notes[0])}–${noteName(notes[notes.length - 1])}\n`);
  console.log('detector  caso                    voz     RPA(<50c)  err. mediano  octava   ms/frame');
  for (const kind of DETECTORS) {
    for (const c of cases) {
      let voiced = 0, total = 0, within = 0, octave = 0, ms = 0;
      const errors: number[] = [];
      for (const m of notes) {
        const { signal, truth } = c.make(m);
        const r = analyse(kind, signal, SR);
        ms += r.msPerFrame;
        // Se descartan los primeros 100 ms (llenado de ventana y entrada en voz).
        for (const f of r.frames.filter((f) => f.t > 0.1)) {
          total++;
          if (!f.voiced || f.midi === null) continue;
          voiced++;
          // La referencia se evalúa en el centro de la ventana analizada.
          const err = (f.midi - truth(f.t - windowSize / 2 / SR)) * 100;
          errors.push(Math.abs(err));
          if (Math.abs(err) < 50) within++;
          if (Math.abs(Math.abs(err) - 1200) < 100) octave++;
        }
      }
      errors.sort((a, b) => a - b);
      console.log(
        `${kind.padEnd(9)} ${c.name.padEnd(23)} ${pct(voiced / total).padStart(6)}  ${pct(within / Math.max(1, voiced)).padStart(9)}  ${(errors[errors.length >> 1] ?? NaN).toFixed(2).padStart(9)} c  ${pct(octave / Math.max(1, voiced)).padStart(6)}  ${(ms / notes.length).toFixed(3).padStart(8)}`,
      );
    }
  }

  console.log('\nFalsos positivos de voz (debería ser ≈ 0%)\n');
  const noiseCases: [string, Float32Array][] = [
    ['silencio', new Float32Array(SR * 3)],
    ['ruido blanco suave (−40 dBFS)', whiteNoise(SR, 3, 0.017, 11)],
    ['ruido blanco fuerte (−20 dBFS)', whiteNoise(SR, 3, 0.17, 12)],
    ['zumbido 50 Hz + ruido', mix(tone({ sampleRate: SR, durationS: 3, hz: 50, amplitude: 0.05 }), whiteNoise(SR, 3, 0.01, 13))],
  ];
  for (const kind of DETECTORS) {
    for (const [name, signal] of noiseCases) {
      const r = analyse(kind, signal, SR);
      const fp = r.frames.filter((f) => f.voiced).length / r.frames.length;
      console.log(`${kind.padEnd(9)} ${name.padEnd(32)} ${pct(fp).padStart(6)}`);
    }
  }
}

function fromWav(path: string, refPath?: string) {
  const { sampleRate, samples } = readWav(path);
  const ref = refPath
    ? readFileSync(refPath, 'utf8').trim().split(/\r?\n/).filter((l) => /^[\d.]/.test(l)).map((l) => l.split(/[,;\s]+/).map(Number) as [number, number])
    : null;
  const refAt = (t: number) => {
    if (!ref) return null;
    let best = ref[0];
    for (const r of ref) if (Math.abs(r[0] - t) < Math.abs(best[0] - t)) best = r;
    return Math.abs(best[0] - t) < 0.02 && best[1] > 0 ? best[1] : null;
  };
  console.log(`\n${path} · ${sampleRate} Hz · ${(samples.length / sampleRate).toFixed(2)} s\n`);
  for (const kind of DETECTORS) {
    const r = analyse(kind, samples, sampleRate);
    const voiced = r.frames.filter((f) => f.voiced);
    let line = `${kind}: ${pct(voiced.length / r.frames.length)} frames con voz · ${r.msPerFrame.toFixed(3)} ms/frame`;
    if (ref) {
      let n = 0, within = 0;
      for (const f of voiced) {
        const hz = refAt(f.t - windowSize / 2 / sampleRate);
        if (hz === null) continue;
        n++;
        if (Math.abs((f.midi! - freqToMidi(hz)) * 100) < 50) within++;
      }
      line += ` · RPA ${pct(within / Math.max(1, n))} sobre ${n} frames con referencia`;
    }
    console.log(line);
  }
  console.log('\nt(s),hz,nota,cents,clarity,nivel_db (MPM)');
  const r = analyse('mpm', samples, sampleRate);
  for (const f of r.frames.filter((_, i) => i % 5 === 0)) {
    if (!f.voiced || f.midi === null) continue;
    const n = Math.round(f.midi);
    console.log(`${f.t.toFixed(3)},${f.f0!.toFixed(2)},${noteName(n)},${((f.midi - n) * 100).toFixed(1)},${f.clarity.toFixed(3)},${f.levelDb.toFixed(1)}`);
  }
}

const [wavPath, refPath] = process.argv.slice(2).filter((a) => a !== '--');
if (wavPath) fromWav(wavPath, refPath);
else synthetic();
