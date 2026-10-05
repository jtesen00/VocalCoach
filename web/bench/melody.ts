/**
 * Benchmark de extracción de melodía en canciones sintéticas (voz + piano + guitarra + bajo + batería):
 * detector monofónico anterior frente a la extracción polifónica. `pnpm bench:melody`
 */
import { performance } from 'node:perf_hooks';
import { extractMelody } from '../src/core/songs/melody-extraction';
import { makeMix, scoreExtraction, type MixOptions } from '../src/core/songs/test-mix';
import { segmentNotes, trackPitch } from '../src/core/songs/transcribe';

const CASES: [string, MixOptions][] = [
  ['estéreo, voz a 0 dB', {}],
  ['estéreo, voz a −3 dB', { vocalDb: -3 }],
  ['estéreo, voz a −6 dB', { vocalDb: -6 }],
  ['mono, voz a 0 dB', { stereo: false }],
  ['sin vibrato', { vibrato: 0 }],
  ['voz grave (−12)', { transpose: -12 }],
  ['voz grave, mono', { transpose: -12, stereo: false }],
  ['voz aguda (+7)', { transpose: 7 }],
  ['notas rápidas (×0,6)', { speed: 0.6 }],
];

const pct = (v: number) => `${Math.round(v * 100)} %`.padStart(6);
console.log('\nCaso                      Método        Altura  Voz   Falsos  Notas   Tiempo');
for (const [name, o] of CASES) {
  const mix = makeMix(o);
  const mono = mix.left.map((v, i) => (v + mix.right[i]) / 2);
  let t0 = performance.now();
  const old = trackPitch(mono, mix.sampleRate);
  const oldMs = performance.now() - t0;
  const so = scoreExtraction(old, segmentNotes(old), mix);
  t0 = performance.now();
  const line = extractMelody(mix.left, mix.right, mix.sampleRate);
  const newMs = performance.now() - t0;
  const frames = line.map((f) => ({ t: f.t, midi: f.midi, f0: null, clarity: 1, levelDb: 0, voiced: f.midi !== null }));
  const sn = scoreExtraction(frames, segmentNotes(frames), mix);
  const dur = mix.left.length / mix.sampleRate;
  for (const [method, s, ms] of [['anterior', so, oldMs], ['polifónico', sn, newMs]] as const) {
    console.log(`${name.padEnd(25)} ${method.padEnd(12)} ${pct(s.rawPitchAccuracy)} ${pct(s.voicingRecall)} ${pct(s.voicingFalseAlarm)} ${pct(s.noteRecall)}   ${(ms / dur).toFixed(0)} ms/s`);
  }
}
console.log('\nAltura = frames con voz con la nota correcta (< 50 c) · Falsos = frames sin voz marcados como voz · ±50 ms en los bordes de nota no cuentan.');
