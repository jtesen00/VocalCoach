/**
 * Benchmark de la separación de voz (Fase 8c) en la mezcla sintética: extracción de la melodía
 * de la mezcla frente a la de la voz separada con HT-Demucs FT (ONNX, mismo runtime WASM que el
 * navegador). Necesita el modelo en `.models/` (no se versiona):
 *
 *   curl -L -o .models/htdemucs_ft_vocals_fp16weights.onnx \
 *     https://huggingface.co/StemSplitio/htdemucs-ft-vocals-onnx/resolve/main/htdemucs_ft_vocals_fp16weights.onnx
 *
 * `pnpm bench:separation`
 */
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as ort from 'onnxruntime-web';
import { EXTRACTION_SAMPLE_RATE, extractMelody } from '../src/core/songs/melody-extraction';
import { SEPARATION_SAMPLE_RATE, SEGMENT_SAMPLES, separateVocals } from '../src/core/songs/separation';
import { makeMix, scoreExtraction, type MixOptions } from '../src/core/songs/test-mix';
import { segmentNotes } from '../src/core/songs/transcribe';

const MODEL = '.models/htdemucs_ft_vocals_fp16weights.onnx';
if (!existsSync(MODEL)) {
  console.log(`Falta el modelo ${MODEL} (ver la cabecera de este archivo).`);
  process.exit(0);
}

/** Remuestreo lineal 44,1 → 22,05 kHz (factor 2): media de pares, suficiente para el análisis. */
const half = (x: Float32Array) => Float32Array.from({ length: x.length >> 1 }, (_, i) => (x[2 * i] + x[2 * i + 1]) / 2);

const CASES: [string, MixOptions][] = [
  ['estéreo, voz a 0 dB', {}],
  ['estéreo, voz a −6 dB', { vocalDb: -6 }],
  ['mono, voz a 0 dB', { stereo: false }],
  ['voz grave, mono', { transpose: -12, stereo: false }],
];

const t0 = performance.now();
// Sin optimizar el grafo: al plegar las conversiones fp16 → fp32 se agota la memoria de WASM.
const session = await ort.InferenceSession.create(readFileSync(MODEL), { executionProviders: ['wasm'], graphOptimizationLevel: 'disabled' });
console.log(`Modelo cargado en ${((performance.now() - t0) / 1000).toFixed(1)} s · entradas ${session.inputNames} · salidas ${session.outputNames}`);
const run = async (planar: Float32Array) => {
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', planar, [1, 2, SEGMENT_SAMPLES]) });
  const stems = out[session.outputNames[0]].data as Float32Array;
  // (1, 4, 2, N): la voz es la pista 3.
  return stems.slice(3 * 2 * SEGMENT_SAMPLES, 4 * 2 * SEGMENT_SAMPLES);
};

const pct = (v: number) => `${Math.round(v * 100)} %`.padStart(6);
console.log('\nCaso                      Método        Altura  Voz   Falsos  Notas   Separación');
for (const [name, o] of CASES) {
  const mix = makeMix({ ...o, sampleRate: SEPARATION_SAMPLE_RATE });
  const score = (l: Float32Array, r: Float32Array | null) => {
    const line = extractMelody(half(l), r && half(r), EXTRACTION_SAMPLE_RATE);
    const frames = line.map((f) => ({ t: f.t, midi: f.midi, f0: null, clarity: 1, levelDb: 0, voiced: f.midi !== null }));
    return scoreExtraction(frames, segmentNotes(frames), mix);
  };
  const stereo = o.stereo !== false;
  const base = score(mix.left, stereo ? mix.right : null);
  const t1 = performance.now();
  const voice = await separateVocals(mix.left, stereo ? mix.right : null, run);
  const sepS = (performance.now() - t1) / 1000;
  const sep = score(voice.left, voice.right);
  const dur = mix.left.length / mix.sampleRate;
  for (const [method, s, extra] of [['mezcla', base, ''], ['voz separada', sep, `${(sepS / dur).toFixed(2)} × tiempo real`]] as const) {
    console.log(`${name.padEnd(25)} ${method.padEnd(12)} ${pct(s.rawPitchAccuracy)} ${pct(s.voicingRecall)} ${pct(s.voicingFalseAlarm)} ${pct(s.noteRecall)}   ${extra}`);
  }
}
