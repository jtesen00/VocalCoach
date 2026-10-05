import { FFT, nextPowerOfTwo, parabolicPeak } from './fft';
import type { DetectorOptions, PitchDetector, PitchEstimate } from './types';

/**
 * YIN (de Cheveigné & Kawahara, 2002) con la función diferencia calculada por FFT.
 * Ventana de integración = windowSize / 2. Clarity = 1 − CMNDF en el mínimo elegido.
 */
export class YinDetector implements PitchDetector {
  readonly windowSize: number;
  private readonly sampleRate: number;
  private readonly w: number;
  private readonly minLag: number;
  private readonly maxLag: number;
  private readonly fft: FFT;
  private readonly aRe: Float64Array;
  private readonly aIm: Float64Array;
  private readonly bRe: Float64Array;
  private readonly bIm: Float64Array;
  private readonly cmnd: Float64Array;

  constructor(opts: DetectorOptions, private readonly threshold = 0.15) {
    this.windowSize = opts.windowSize;
    this.sampleRate = opts.sampleRate;
    this.w = Math.floor(opts.windowSize / 2);
    this.minLag = Math.max(2, Math.floor(opts.sampleRate / opts.maxHz));
    this.maxLag = Math.min(this.w - 1, Math.ceil(opts.sampleRate / opts.minHz));
    this.fft = new FFT(nextPowerOfTwo(opts.windowSize + this.w));
    this.aRe = new Float64Array(this.fft.size);
    this.aIm = new Float64Array(this.fft.size);
    this.bRe = new Float64Array(this.fft.size);
    this.bIm = new Float64Array(this.fft.size);
    this.cmnd = new Float64Array(this.maxLag + 2);
  }

  detect(x: Float32Array): PitchEstimate {
    const { w, aRe, aIm, bRe, bIm, cmnd } = this;
    const n = this.windowSize;

    let e0 = 0;
    for (let i = 0; i < w; i++) e0 += x[i] * x[i];
    if (e0 < 1e-10) return { f0: null, clarity: 0 };

    // r(τ) = Σ_{j<w} x_j x_{j+τ} = IFFT(conj(A)·B), A = x[0:w], B = x[0:n].
    aRe.fill(0); aIm.fill(0); bRe.fill(0); bIm.fill(0);
    for (let i = 0; i < w; i++) aRe[i] = x[i];
    for (let i = 0; i < n; i++) bRe[i] = x[i];
    this.fft.transform(aRe, aIm);
    this.fft.transform(bRe, bIm);
    for (let i = 0; i < aRe.length; i++) {
      const re = aRe[i] * bRe[i] + aIm[i] * bIm[i];
      const im = aRe[i] * bIm[i] - aIm[i] * bRe[i];
      aRe[i] = re;
      aIm[i] = im;
    }
    this.fft.transform(aRe, aIm, true);
    const scale = 1 / this.fft.size;

    // d(τ) = e0 + eτ − 2r(τ); CMNDF d'(τ) = d(τ)·τ / Σ_{1..τ} d.
    let eTau = e0;
    let running = 0;
    cmnd[0] = 1;
    const last = cmnd.length - 1;
    for (let tau = 1; tau <= last; tau++) {
      eTau += x[tau + w - 1] * x[tau + w - 1] - x[tau - 1] * x[tau - 1];
      const d = Math.max(0, e0 + eTau - 2 * aRe[tau] * scale);
      running += d;
      cmnd[tau] = running > 0 ? (d * tau) / running : 1;
    }

    // Primer mínimo bajo el umbral; si no hay, el mínimo global (baja confianza).
    let chosen = -1;
    for (let tau = this.minLag; tau <= this.maxLag; tau++) {
      if (cmnd[tau] < this.threshold) {
        while (tau + 1 <= this.maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
        chosen = tau;
        break;
      }
    }
    if (chosen < 0) {
      let min = Infinity;
      for (let tau = this.minLag; tau <= this.maxLag; tau++) {
        if (cmnd[tau] < min) { min = cmnd[tau]; chosen = tau; }
      }
    }
    if (chosen < 0) return { f0: null, clarity: 0 };
    const [lag, value] = parabolicPeak(cmnd, chosen);
    const clarity = Math.min(1, Math.max(0, 1 - value));
    return { f0: lag > 0 ? this.sampleRate / lag : null, clarity };
  }
}
