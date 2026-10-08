import { chordPitchClasses, type Chord, type TimedChord } from '../music/chords';
import { FFT } from '../pitch/fft';

/**
 * Reconocimiento de acordes desde el audio (canciones importadas): cromagrama
 * (energía por clase de altura) → parecido con plantillas de 24 tríadas (mayores y menores)
 * → Viterbi para no cambiar de acorde a cada instante.
 */

const N = 4096; // 186 ms a 22,05 kHz: resolución suficiente para los graves
const HOP = 2048; // 93 ms
const MIN_HZ = 35; // los bajos llegan a Mi1 (41 Hz)
const CHROMA_MIN_HZ = 80;
const MAX_HZ = 1000;
/** Banda del bajo: su nota suele ser la fundamental del acorde. */
const BASS_MAX_HZ = 160;
const BASS_WEIGHT = 0.5;
/** Penalización (en similitud) por cambiar de acorde entre frames. */
const SWITCH_PENALTY = 0.25;
/** Ventaja para los acordes de la tonalidad (reduce confusiones con acordes vecinos). */
const DIATONIC_BONUS = 0.04;
const MIN_CHORD_S = 0.5;

const ALL_CHORDS: Chord[] = Array.from({ length: 24 }, (_, i) => ({ root: i % 12, quality: i < 12 ? 'maj' : 'min' }));

function templates(): number[][] {
  return ALL_CHORDS.map((c) => {
    const t = Array(12).fill(0);
    const [r, th, f] = chordPitchClasses(c);
    t[r] = 1;
    t[th] = 0.8;
    t[f] = 0.9;
    const norm = Math.hypot(...t);
    return t.map((v) => v / norm);
  });
}

/** Cromagrama: por frame, energía de cada clase de altura (normalizado), y energía total. */
export function chromagram(left: Float32Array, right: Float32Array | null, sr: number): { t: number[]; chroma: number[][]; bass: number[][]; energy: number[] } {
  const fft = new FFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const kMin = Math.ceil((MIN_HZ * N) / sr);
  const kMax = Math.floor((MAX_HZ * N) / sr);
  // Clase de altura de cada bin: se redondea a la nota MIDI y después se aplica el módulo.
  const pcOf = Array.from({ length: kMax + 1 }, (_, k) => (k >= kMin ? ((Math.round(12 * Math.log2((k * sr) / N / 440) + 69) % 12) + 12) % 12 : -1));
  const t: number[] = [];
  const chroma: number[][] = [];
  const bassChroma: number[][] = [];
  const energy: number[] = [];
  const kBass = Math.floor((BASS_MAX_HZ * N) / sr);
  const kChroma = Math.ceil((CHROMA_MIN_HZ * N) / sr);
  for (let o = 0; o + N <= left.length; o += HOP) {
    for (let i = 0; i < N; i++) {
      re[i] = (right ? (left[o + i] + right[o + i]) / 2 : left[o + i]) * win[i];
      im[i] = 0;
    }
    fft.transform(re, im);
    const c = Array(12).fill(0);
    const b = Array(12).fill(0);
    let e = 0;
    for (let k = kMin; k <= kMax; k++) {
      const m = Math.hypot(re[k], im[k]);
      // Compresión (raíz): que un solo instrumento fuerte no domine.
      if (k >= kChroma) c[pcOf[k]] += Math.sqrt(m);
      if (k <= kBass) b[pcOf[k]] += m;
      e += m * m;
    }
    const norm = Math.hypot(...c) || 1;
    chroma.push(c.map((v) => v / norm));
    const bmax = Math.max(...b) || 1;
    bassChroma.push(b.map((v) => v / bmax));
    energy.push(e);
    t.push((o + N / 2) / sr);
  }
  return { t, chroma, bass: bassChroma, energy };
}

/**
 * Acordes de un audio. `key` (tónica en clase de altura y modo) da preferencia a los acordes
 * diatónicos. Los tramos sin energía (silencio) no llevan acorde.
 */
export function recognizeChords(left: Float32Array, right: Float32Array | null, sr: number, key?: { tonic: number; mode: 'mayor' | 'menor' }): TimedChord[] {
  const { t, chroma, bass, energy } = chromagram(left, right, sr);
  if (!t.length) return [];
  const tpl = templates();
  const diatonic = new Set<number>();
  if (key) {
    // Tríadas diatónicas del modo mayor relativo (I ii iii IV V vi) + V mayor en menor.
    const major = key.mode === 'mayor' ? key.tonic % 12 : (key.tonic + 3) % 12;
    for (const [deg, q] of [[0, 'maj'], [2, 'min'], [4, 'min'], [5, 'maj'], [7, 'maj'], [9, 'min']] as const) {
      diatonic.add(ALL_CHORDS.findIndex((c) => c.root === (major + deg) % 12 && c.quality === q));
    }
    if (key.mode === 'menor') diatonic.add(ALL_CHORDS.findIndex((c) => c.root === (key.tonic + 7) % 12 && c.quality === 'maj'));
  }
  const score = chroma.map((c, f) =>
    tpl.map((tp, j) => tp.reduce((a, v, i) => a + v * c[i], 0) + BASS_WEIGHT * bass[f][ALL_CHORDS[j].root] + (diatonic.has(j) ? DIATONIC_BONUS : 0)),
  );

  // Viterbi: maximiza similitud total menos la penalización por cambios.
  const n = t.length;
  const back: Int16Array[] = [];
  let prev = score[0].slice();
  for (let f = 1; f < n; f++) {
    const bestPrev = prev.reduce((bi, v, i) => (v > prev[bi] ? i : bi), 0);
    const b = new Int16Array(24);
    const cur = score[f].map((s, j) => {
      const stay = prev[j];
      const move = prev[bestPrev] - SWITCH_PENALTY;
      b[j] = stay >= move ? j : bestPrev;
      return s + Math.max(stay, move);
    });
    back.push(b);
    prev = cur;
  }
  const path = new Array<number>(n);
  path[n - 1] = prev.reduce((bi, v, i) => (v > prev[bi] ? i : bi), 0);
  for (let f = n - 1; f > 0; f--) path[f - 1] = back[f - 1][path[f]];

  // Silencio: menos del 2 % de la energía mediana → sin acorde.
  const med = [...energy].sort((a, b) => a - b)[n >> 1] || 0;
  const out: TimedChord[] = [];
  const half = HOP / sr / 2;
  for (let f = 0; f < n; f++) {
    const silent = energy[f] < 0.02 * med;
    const last = out[out.length - 1];
    const chord = ALL_CHORDS[path[f]];
    if (silent) continue;
    if (last && last.chord.root === chord.root && last.chord.quality === chord.quality && t[f] - half - last.endS < 0.2) last.endS = t[f] + half;
    else out.push({ startS: t[f] - half, endS: t[f] + half, chord });
  }
  // Acordes muy cortos: se absorben en el anterior; acordes iguales seguidos se unen.
  const merged: TimedChord[] = [];
  for (const c of out) {
    const last = merged[merged.length - 1];
    const same = last && last.chord.root === c.chord.root && last.chord.quality === c.chord.quality;
    if (last && (same || c.endS - c.startS < MIN_CHORD_S) && c.startS - last.endS < 0.2) last.endS = c.endS;
    else merged.push({ ...c });
  }
  return merged;
}
