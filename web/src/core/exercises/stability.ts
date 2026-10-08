export interface Vibrato {
  rateHz: number;
  /** Amplitud (semi-extensión) en cents: ±extentCents alrededor del centro. */
  extentCents: number;
}

export interface StabilityAnalysis {
  /** 0..1: 1 = totalmente estable. El vibrato regular no penaliza. */
  stability: number;
  /** Desviación típica de la oscilación rápida (temblor o vibrato), en cents. */
  jitterCents: number;
  /** Desviación típica de la deriva lenta (media móvil de 200 ms, sin la tendencia lineal), en cents. */
  driftCents: number;
  vibrato: Vibrato | null;
}

/** Desviación (cents) a partir de la cual la estabilidad llega a 0. */
const ZERO_STABILITY_CENTS = 40;

function std(x: readonly number[]): number {
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length);
}

/** Resta la recta de mínimos cuadrados: una subida o caída continua no es "inestabilidad". */
function detrend(x: readonly number[]): number[] {
  const n = x.length;
  const mx = (n - 1) / 2;
  const my = x.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (x[i] - my);
    den += (i - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return x.map((v, i) => v - (my + slope * (i - mx)));
}

function movingAverage(x: readonly number[], w: number): number[] {
  const half = Math.floor(w / 2);
  return x.map((_, i) => {
    const a = Math.max(0, i - half);
    const b = Math.min(x.length, i + half + 1);
    let s = 0;
    for (let j = a; j < b; j++) s += x[j];
    return s / (b - a);
  });
}

/**
 * Separa la desviación en deriva lenta (sin tendencia lineal) y oscilación rápida, y detecta vibrato
 * (oscilación periódica de 4–8 Hz con ±15–150 cents) por autocorrelación.
 * `cents` son muestras consecutivas a `frameRate` Hz.
 */
export function analyseStability(cents: readonly number[], frameRate: number): StabilityAnalysis | null {
  const w = Math.max(3, Math.round(0.2 * frameRate));
  if (cents.length < 2 * w) return null;

  const slow = movingAverage(cents, w);
  const fast = cents.map((c, i) => c - slow[i]);
  const jitter = std(fast);
  const drift = std(detrend(slow));

  let vibrato: Vibrato | null = null;
  const minLag = Math.max(2, Math.floor(frameRate / 8));
  const maxLag = Math.min(fast.length - 1, Math.ceil(frameRate / 4));
  const energy = fast.reduce((a, b) => a + b * b, 0);
  if (energy > 0 && maxLag > minLag) {
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let r = 0;
      for (let i = 0; i + lag < fast.length; i++) r += fast[i] * fast[i + lag];
      r /= energy * ((fast.length - lag) / fast.length);
      if (r > best) {
        best = r;
        bestLag = lag;
      }
    }
    const extent = Math.SQRT2 * jitter;
    if (best > 0.5 && extent >= 15 && extent <= 150) vibrato = { rateHz: frameRate / bestLag, extentCents: extent };
  }

  const deviation = vibrato ? drift : Math.hypot(jitter, drift);
  return {
    stability: Math.max(0, Math.min(1, 1 - deviation / ZERO_STABILITY_CENTS)),
    jitterCents: jitter,
    driftCents: drift,
    vibrato,
  };
}
