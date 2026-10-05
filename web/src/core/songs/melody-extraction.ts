import { analyseStability } from '../exercises/stability';
import { FFT } from '../pitch/fft';

/**
 * Extracción de la melodía principal de música polifónica (estilo Melodia, Salamon y Gómez, 2012),
 * en TS puro para ejecutarse en un Web Worker:
 *
 *  1. STFT estéreo y aislamiento del centro: la voz principal suele estar centrada.
 *  2. Picos espectrales con interpolación parabólica.
 *  3. Saliencia por suma armónica (bins de 10 cents, 55 Hz–1,76 kHz).
 *  4. Contornos de altura: continuidad en el tiempo (≤ 80 c, huecos ≤ 100 ms).
 *  5. Filtro de voz/no voz por saliencia; los contornos con vibrato se conservan.
 *  6. Errores de octava y valores atípicos respecto a la altura media de la melodía.
 *  7. En cada instante, el contorno más saliente (con prioridad para el vibrato).
 */

export const EXTRACTION_SAMPLE_RATE = 22050;
const N = 2048; // 93 ms
const HOP = 256; // 11,6 ms
const F_REF = 55; // A1: bin 0 de la saliencia
const BINS = 600; // 5 octavas de 10 cents
const HARMONICS = 10;
const ALPHA = 0.8; // peso de cada armónico sucesivo
const MAX_PEAKS = 40;
const PEAK_RANGE_DB = 40;
const MIN_HZ = 90;
const MAX_HZ = 1100;

const centsBin = (hz: number) => 120 * Math.log2(hz / F_REF); // bins de 10 cents
const binToMidi = (b: number) => 33 + b / 10; // A1 = MIDI 33

export interface MelodyFrame {
  t: number;
  /** MIDI continuo, o null si no hay voz principal. */
  midi: number | null;
  salience: number;
  /** Grado de centrado estéreo (1 en mono). */
  center: number;
}

export interface ExtractionOptions {
  /** Exponente de la máscara de centro (0 = sin aislamiento). */
  centerPower?: number;
  onProgress?: (p: number) => void;
  /** Diagnóstico: recibe los contornos tras cada etapa. */
  debug?: (stage: string, contours: readonly { start: number; length: number; midi: number; alive: boolean; vibrato: boolean; decayRate: number; meanSal: number; jitter: number; meanHarm: number }[]) => void;
}

interface Peak {
  bin: number;
  salience: number;
  /** 0..1: cuán centrados en estéreo están los armónicos que apoyan esta altura (1 en mono). */
  center: number;
  /** Saliencia / energía de todos los picos del frame: cuánto del sonido explica esta altura (armonicidad). */
  harm: number;
}

/** Saliencia por frame: lista de picos (bin con decimales, saliencia). */
function salienceFrames(left: Float32Array, right: Float32Array | null, sr: number, opts: ExtractionOptions): { t: number[]; peaks: Peak[][] } {
  const fft = new FFT(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const half = N / 2;
  const mag = new Float64Array(half);
  const sal = new Float64Array(BINS);
  const odd = new Float64Array(BINS);
  const centerSum = new Float64Array(BINS);
  const maskOf = new Float64Array(half);
  const kMax = Math.min(half - 2, Math.ceil((5000 * N) / sr));
  const centerPower = opts.centerPower ?? 3;
  const times: number[] = [];
  const out: Peak[][] = [];
  const frames = Math.max(0, Math.floor((left.length - N) / HOP) + 1);
  const minBin = centsBin(MIN_HZ);
  const maxBin = centsBin(MAX_HZ);

  for (let f = 0; f < frames; f++) {
    const o = f * HOP;
    // Dos señales reales en una FFT compleja: x = L + iR.
    for (let i = 0; i < N; i++) {
      re[i] = left[o + i] * win[i];
      im[i] = (right ? right[o + i] : 0) * win[i];
    }
    fft.transform(re, im);
    let peakMax = 0;
    for (let k = 1; k <= kMax; k++) {
      const j = N - k;
      const lr = (re[k] + re[j]) / 2, li = (im[k] - im[j]) / 2; // L_k
      if (!right) {
        mag[k] = Math.hypot(re[k], im[k]);
        maskOf[k] = 1;
      } else {
        const rr = (im[k] + im[j]) / 2, ri = -(re[k] - re[j]) / 2; // R_k
        const l2 = lr * lr + li * li, r2 = rr * rr + ri * ri;
        const mr = (lr + rr) / 2, mi = (li + ri) / 2;
        // Máscara de centro: 1 si L y R son iguales (fuente centrada), → 0 si están a un lado.
        const mask = l2 + r2 > 0 ? Math.max(0, (2 * (lr * rr + li * ri)) / (l2 + r2)) : 0;
        maskOf[k] = mask;
        mag[k] = Math.hypot(mr, mi) * mask ** centerPower;
      }
      if (mag[k] > peakMax) peakMax = mag[k];
    }

    // Picos espectrales (−40 dB respecto al máximo), con frecuencia y amplitud interpoladas.
    const spectral: { hz: number; a: number; m: number }[] = [];
    const floor = peakMax * 10 ** (-PEAK_RANGE_DB / 20);
    for (let k = 2; k < kMax; k++) {
      const m = mag[k];
      if (m > floor && m > mag[k - 1] && m >= mag[k + 1]) {
        const a = 20 * Math.log10(mag[k - 1] + 1e-12), b = 20 * Math.log10(m + 1e-12), c = 20 * Math.log10(mag[k + 1] + 1e-12);
        const den = a - 2 * b + c;
        const d = den ? (0.5 * (a - c)) / den : 0;
        spectral.push({ hz: ((k + d) * sr) / N, a: 10 ** ((b - 0.25 * (a - c) * d) / 20), m: maskOf[k] });
      }
    }
    spectral.sort((x, y) => y.a - x.a);
    spectral.length = Math.min(spectral.length, MAX_PEAKS);

    // Suma armónica: cada pico vota por las f0 de las que podría ser armónico.
    sal.fill(0);
    odd.fill(0);
    centerSum.fill(0);
    for (const p of spectral) {
      for (let h = 1; h <= HARMONICS; h++) {
        const f0 = p.hz / h;
        if (f0 < F_REF) break;
        const bc = centsBin(f0);
        const w = p.a * ALPHA ** (h - 1);
        for (let b = Math.max(0, Math.ceil(bc - 10)); b <= Math.min(BINS - 1, Math.floor(bc + 10)); b++) {
          const delta = Math.abs(b - bc) / 10;
          const c = Math.cos((delta * Math.PI) / 2);
          sal[b] += w * c * c;
          centerSum[b] += w * c * c * p.m;
          if (h % 2 === 1) odd[b] += w * c * c;
        }
      }
    }
    // Penalización de suboctava: una f0 real tiene apoyo de armónicos impares (1, 3, 5…);
    // la octava inferior solo recibe votos de los pares de la nota real.
    for (let b = 0; b < BINS; b++) {
      if (sal[b] <= 0) continue;
      centerSum[b] /= sal[b]; // media de la máscara de centro de los armónicos que votan
      sal[b] *= Math.min(1, (2 * odd[b]) / sal[b]) ** 2;
    }

    // Picos de saliencia en el rango de la voz.
    const totalA = spectral.reduce((a, p) => a + p.a, 0) || 1;
    const peaks: Peak[] = [];
    for (let b = Math.ceil(minBin); b <= Math.floor(maxBin); b++) {
      if (sal[b] > 0 && sal[b] > sal[b - 1] && sal[b] >= sal[b + 1]) {
        const a = sal[b - 1], v = sal[b], c = sal[b + 1];
        const den = a - 2 * v + c;
        const d = den ? (0.5 * (a - c)) / den : 0;
        const salience = v - 0.25 * (a - c) * d;
        peaks.push({ bin: b + d, salience, center: centerSum[b], harm: salience / totalA });
      }
    }
    peaks.sort((x, y) => y.salience - x.salience);
    out.push(peaks.slice(0, 6));
    times.push((o + N / 2) / sr);
    if (opts.onProgress && f % 400 === 0) opts.onProgress((0.8 * f) / Math.max(1, frames));
  }
  return { t: times, peaks: out };
}

interface Contour {
  start: number; // frame
  bins: number[]; // bin por frame (interpolado en huecos)
  sal: number[];
  center: number[];
  harm: number[];
  meanBin: number;
  meanSal: number;
  totalSal: number;
  vibrato: boolean;
  /** Caída de la saliencia por segundo (ln) tras el ataque: la voz se sostiene; bajo, piano y guitarra se apagan (> 1/s). */
  decayRate: number;
  medianSal: number;
  /** Mediana del cambio de altura entre frames (bins de 10 c): la voz es suave; el ruido salta. */
  jitter: number;
  meanHarm: number;
  alive: boolean;
}

const MAX_JUMP_BINS = 8; // 80 cents
const MAX_GAP_FRAMES = Math.round((0.1 * EXTRACTION_SAMPLE_RATE) / HOP); // 100 ms
const MIN_CONTOUR_FRAMES = Math.round((0.1 * EXTRACTION_SAMPLE_RATE) / HOP);

/** Agrupa picos de saliencia en contornos de altura continuos. */
function buildContours(peaks: Peak[][]): Contour[] {
  // Umbral global: se descartan los picos claramente débiles (μ − 0,9σ).
  const all = peaks.flatMap((p) => p.map((x) => x.salience));
  const mu = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, all.length));
  const globalMin = mu - 0.9 * sd;

  const done: Contour[] = [];
  let active: { c: Contour; last: number }[] = [];
  peaks.forEach((frame, f) => {
    const max = frame[0]?.salience ?? 0;
    const used = new Set<number>();
    // Extender contornos activos con el pico más cercano.
    for (const a of active) {
      const lastBin = a.c.bins[a.c.bins.length - 1];
      let best = -1, bestD = MAX_JUMP_BINS;
      frame.forEach((p, i) => {
        const d = Math.abs(p.bin - lastBin);
        if (!used.has(i) && p.salience >= globalMin && d <= bestD) {
          best = i;
          bestD = d;
        }
      });
      if (best >= 0) {
        const p = frame[best];
        // Rellena el hueco por interpolación lineal.
        const gap = f - a.last - 1;
        for (let g = 1; g <= gap; g++) {
          a.c.bins.push(lastBin + ((p.bin - lastBin) * g) / (gap + 1));
          a.c.sal.push(0);
          a.c.center.push(0);
          a.c.harm.push(0);
        }
        a.c.bins.push(p.bin);
        a.c.sal.push(p.salience);
        a.c.center.push(p.center);
        a.c.harm.push(p.harm);
        a.last = f;
        used.add(best);
      }
    }
    // Cerrar los contornos sin continuación.
    active = active.filter((a) => {
      if (f - a.last <= MAX_GAP_FRAMES) return true;
      done.push(a.c);
      return false;
    });
    // Nuevos contornos: solo desde picos fuertes (≥ 90 % del máximo del frame).
    frame.forEach((p, i) => {
      if (used.has(i) || p.salience < 0.9 * max || p.salience < globalMin) return;
      active.push({ c: { start: f, bins: [p.bin], sal: [p.salience], center: [p.center], harm: [p.harm], meanBin: 0, meanSal: 0, totalSal: 0, vibrato: false, decayRate: 0, medianSal: 0, jitter: 0, meanHarm: 0, alive: true }, last: f });
    });
  });
  done.push(...active.map((a) => a.c));

  const frameRate = EXTRACTION_SAMPLE_RATE / HOP;
  return done
    .filter((c) => c.bins.length >= MIN_CONTOUR_FRAMES)
    .map((c) => {
      const total = c.sal.reduce((a, b) => a + b, 0);
      const stab = analyseStability(c.bins.map((b) => b * 10), frameRate);
      // Caída justo tras el ataque (30–100 ms frente a 250–350 ms): un instrumento pulsado
      // se apaga desde el principio; la voz se sostiene. Se mide al inicio porque el contorno
      // puede continuar con la cola de otro sonido en la misma nota.
      const at = (a: number, b: number) => {
        const xs = c.sal.slice(Math.round(a * frameRate), Math.round(b * frameRate)).filter((v) => v > 0);
        return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0;
      };
      const head = at(0.03, 0.1);
      const later = at(0.25, 0.35);
      const sorted = c.sal.filter((v) => v > 0).sort((a, b) => a - b);
      const steps = c.bins.slice(1).map((b, i) => Math.abs(b - c.bins[i])).filter((_, i) => c.sal[i] > 0 && c.sal[i + 1] > 0).sort((a, b) => a - b);
      return {
        ...c,
        jitter: steps.length ? steps[steps.length >> 1] : 0,
        meanHarm: (() => {
          const h = c.harm.filter((v) => v > 0);
          return h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
        })(),
        decayRate: c.bins.length >= 0.35 * frameRate && head > 0 && later > 0 ? Math.log(head / later) / 0.235 : 0,
        medianSal: sorted.length ? sorted[sorted.length >> 1] : 0,
        meanBin: c.bins.reduce((a, b) => a + b, 0) / c.bins.length,
        meanSal: total / c.bins.length,
        totalSal: total,
        vibrato: !!stab?.vibrato,
      };
    });
}

/** Altura media de la melodía por frame, suavizada (ventana de ~5 s). */
function melodyMean(contours: Contour[], frames: number): Float64Array {
  const num = new Float64Array(frames);
  const den = new Float64Array(frames);
  for (const c of contours) {
    if (!c.alive) continue;
    c.bins.forEach((b, i) => {
      num[c.start + i] += b * c.meanSal;
      den[c.start + i] += c.meanSal;
    });
  }
  const raw = Array.from(num, (v, i) => (den[i] ? v / den[i] : NaN));
  const w = Math.round((5 * EXTRACTION_SAMPLE_RATE) / HOP / 2);
  const out = new Float64Array(frames);
  let last = NaN;
  for (let i = 0; i < frames; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - w); j < Math.min(frames, i + w); j += 4) if (!Number.isNaN(raw[j])) { s += raw[j]; n++; }
    out[i] = n ? s / n : last;
    if (n) last = out[i];
  }
  return out;
}

function meanOver(m: Float64Array, c: Contour): number {
  let s = 0, n = 0;
  for (let i = 0; i < c.bins.length; i += 2) if (!Number.isNaN(m[c.start + i])) { s += m[c.start + i]; n++; }
  return n ? s / n : c.meanBin;
}

/** Por debajo de este grado de "centrado" en estéreo, la altura se atribuye a un instrumento lateral. */
const CENTER_MIN = 0.6;

/** Extrae la línea melódica principal. `right` = null para audio mono. */
export function extractMelody(left: Float32Array, right: Float32Array | null, sampleRate: number, opts: ExtractionOptions = {}): MelodyFrame[] {
  // Audio "estéreo" con los dos canales iguales = mono: no hay información de centro.
  const stereo = !!right && !left.every((v, i) => Math.abs(v - right[i]) < 1e-6);
  const { t, peaks } = salienceFrames(left, stereo ? right : null, sampleRate, opts);
  const contours = buildContours(peaks);

  const report = (stage: string) =>
    opts.debug?.(stage, contours.map((c) => ({ start: c.start, length: c.bins.length, midi: binToMidi(c.meanBin), alive: c.alive, vibrato: c.vibrato, decayRate: c.decayRate, meanSal: c.meanSal, jitter: c.jitter, meanHarm: c.meanHarm })));
  report('inicio');
  // Voz / no voz:
  // - fuera los sonidos que se apagan como una cuerda pulsada, un bajo o un piano (la voz se sostiene);
  // - fuera los contornos poco salientes (μ − 0,2σ), salvo si tienen vibrato;
  // - si hay contornos con vibrato (voz casi segura), la referencia es su saliencia.
  for (const c of contours) {
    if (!c.vibrato && c.decayRate > 1) c.alive = false;
    if (c.jitter > 2) c.alive = false; // salta más de 20 c por frame: ruido, no una nota
    const voicedCenter = c.center.filter((_, i) => c.sal[i] > 0);
    const meanCenter = voicedCenter.reduce((a, b) => a + b, 0) / Math.max(1, voicedCenter.length);
    if (stereo && meanCenter < CENTER_MIN) c.alive = false;
  }
  // Armonicidad: si en todo el archivo nada es claramente armónico, es ruido (no hay melodía);
  // si no, fuera los contornos muy por debajo de los más armónicos.
  const harms = contours.filter((c) => c.alive).map((c) => c.meanHarm).sort((a, b) => a - b);
  const p90 = harms.length ? harms[Math.floor(0.9 * (harms.length - 1))] : 0;
  for (const c of contours) if (p90 < 0.2 || c.meanHarm < 0.35 * p90) c.alive = false;

  const candidates = contours.filter((c) => c.alive);
  if (candidates.length > 2) {
    // Referencia: los contornos más fuertes (percentil 75) o, si los hay, los que tienen vibrato.
    // Relativa, para no descartar notas buenas cuando solo hay voz.
    const ms = candidates.map((c) => c.meanSal).sort((a, b) => a - b);
    const p75 = ms[Math.floor(0.75 * (ms.length - 1))];
    const vib = candidates.filter((c) => c.vibrato).map((c) => c.meanSal).sort((a, b) => a - b);
    const ref = vib.length >= 2 ? Math.max(vib[vib.length >> 1], p75 * 0.6) : p75;
    for (const c of candidates) if (!c.vibrato && c.meanSal < 0.5 * ref) c.alive = false;
  }

  report('voz');
  // Octavas duplicadas y valores atípicos respecto a la altura media de la melodía (3 pasadas).
  for (let pass = 0; pass < 3; pass++) {
    const mean = melodyMean(contours, t.length);
    const alive = contours.filter((c) => c.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (!a.alive || !b.alive) continue;
        const s = Math.max(a.start, b.start);
        const e = Math.min(a.start + a.bins.length, b.start + b.bins.length);
        if (e - s < 0.5 * Math.min(a.bins.length, b.bins.length)) continue;
        let d = 0;
        for (let f = s; f < e; f++) d += Math.abs(a.bins[f - a.start] - b.bins[f - b.start]);
        d /= e - s;
        if (Math.abs(d - 120) <= 5) {
          const da = Math.abs(a.meanBin - meanOver(mean, a));
          const db = Math.abs(b.meanBin - meanOver(mean, b));
          (da > db ? a : b).alive = false;
        }
      }
    }
    for (const c of alive) if (c.alive && Math.abs(c.meanBin - meanOver(mean, c)) > 120) c.alive = false;
  }

  report('octavas');
  // En cada frame, el contorno con más saliencia total (el vibrato, típico de la voz, suma).
  const best = new Int32Array(t.length).fill(-1);
  const score = new Float64Array(t.length);
  contours.forEach((c, idx) => {
    if (!c.alive) return;
    const s = c.totalSal * (c.vibrato ? 1.5 : 1);
    for (let i = 0; i < c.bins.length; i++) {
      const f = c.start + i;
      if (s > score[f]) {
        score[f] = s;
        best[f] = idx;
      }
    }
  });
  opts.onProgress?.(1);
  return t.map((time, f) => {
    const c = best[f] >= 0 ? contours[best[f]] : null;
    // Los huecos rellenados dentro de un contorno (saliencia 0) se marcan sin voz:
    // separan sílabas repetidas en la misma nota ("do-do").
    const sal = c ? c.sal[f - c.start] : 0;
    // En estéreo, un tramo poco centrado (p. ej. una guitarra que sigue la nota tras la voz) no es la voz.
    const centered = !stereo || (c ? c.center[f - c.start] >= CENTER_MIN : false);
    // Cola débil dentro del contorno (p. ej. un instrumento que sigue en la misma nota tras la voz).
    const strong = c ? sal >= 0.25 * c.medianSal : false;
    const center = c ? c.center[f - c.start] : 0;
    return c && sal > 0 && centered && strong ? { t: time, midi: binToMidi(c.bins[f - c.start]), salience: sal, center } : { t: time, midi: null, salience: 0, center };
  });
}
