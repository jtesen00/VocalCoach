import { FFT, nextPowerOfTwo, parabolicPeak } from './fft';
import type { DetectorOptions, PitchDetector, PitchEstimate } from './types';

/**
 * McLeod Pitch Method (McLeod & Wyvill, 2005).
 * NSDF con autocorrelación por FFT; la altura del pico elegido es la "clarity".
 */
export class McLeodDetector implements PitchDetector {
  readonly windowSize: number;
  private readonly sampleRate: number;
  private readonly minLag: number;
  private readonly maxLag: number;
  private readonly fft: FFT;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly nsdf: Float64Array;
  private readonly peaks: Int32Array;

  /** Fracción del pico más alto que debe superar el primer pico aceptado. */
  constructor(opts: DetectorOptions, private readonly cutoff = 0.9) {
    this.windowSize = opts.windowSize;
    this.sampleRate = opts.sampleRate;
    this.minLag = Math.max(2, Math.floor(opts.sampleRate / opts.maxHz));
    this.maxLag = Math.min(opts.windowSize - 2, Math.ceil(opts.sampleRate / opts.minHz));
    this.fft = new FFT(nextPowerOfTwo(2 * opts.windowSize));
    this.re = new Float64Array(this.fft.size);
    this.im = new Float64Array(this.fft.size);
    this.nsdf = new Float64Array(this.maxLag + 2);
    this.peaks = new Int32Array(this.maxLag + 2);
  }

  detect(x: Float32Array): PitchEstimate {
    const n = this.windowSize;
    const { re, im, nsdf } = this;

    // Autocorrelación r(τ) = IFFT(|FFT(x)|²) con zero-padding (sin aliasing circular).
    re.fill(0);
    im.fill(0);
    let energy = 0;
    for (let i = 0; i < n; i++) {
      re[i] = x[i];
      energy += x[i] * x[i];
    }
    if (energy < 1e-10) return { f0: null, clarity: 0 };
    this.fft.transform(re, im);
    for (let i = 0; i < re.length; i++) {
      re[i] = re[i] * re[i] + im[i] * im[i];
      im[i] = 0;
    }
    this.fft.transform(re, im, true);
    const scale = 1 / this.fft.size;

    // m(τ) = Σ x_j² + x_{j+τ}², actualizado de forma incremental.
    let m = 2 * energy;
    const last = nsdf.length - 1;
    for (let tau = 0; tau <= last; tau++) {
      if (tau > 0) m -= x[tau - 1] * x[tau - 1] + x[n - tau] * x[n - tau];
      nsdf[tau] = m > 1e-12 ? (2 * re[tau] * scale) / m : 0;
    }

    // Picos clave: el máximo de cada región positiva tras el primer cruce por cero.
    let count = 0;
    let pos = 1;
    while (pos < last && nsdf[pos] > 0) pos++;
    while (pos < last && nsdf[pos] <= 0) pos++;
    let best = 0;
    while (pos < last) {
      if (nsdf[pos] > nsdf[pos - 1] && nsdf[pos] >= nsdf[pos + 1] && (best === 0 || nsdf[pos] > nsdf[best])) {
        best = pos;
      }
      pos++;
      if (nsdf[pos] <= 0 || pos === last) {
        if (best > 0) this.peaks[count++] = best;
        best = 0;
        while (pos < last && nsdf[pos] <= 0) pos++;
      }
    }

    let highest = 0;
    for (let i = 0; i < count; i++) {
      if (this.peaks[i] >= this.minLag && this.peaks[i] <= this.maxLag) highest = Math.max(highest, nsdf[this.peaks[i]]);
    }
    if (highest <= 0) return { f0: null, clarity: 0 };

    const threshold = this.cutoff * highest;
    for (let i = 0; i < count; i++) {
      const p = this.peaks[i];
      if (p < this.minLag || p > this.maxLag) continue;
      if (nsdf[p] >= threshold) {
        const [lag, value] = parabolicPeak(nsdf, p);
        return { f0: this.sampleRate / lag, clarity: Math.min(1, Math.max(0, value)) };
      }
    }
    return { f0: null, clarity: 0 };
  }
}
