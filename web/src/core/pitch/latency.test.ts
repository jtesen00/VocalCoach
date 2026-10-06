import { describe, expect, it } from 'vitest';
import { estimateLatency, type LevelFrame } from './latency';

/** Frames cada 10 ms con ruido a −60 dB y un pico a −20 dB `delay` s después de cada clic. */
function frames(clicks: number[], delay: number, missing: number[] = []): LevelFrame[] {
  const out: LevelFrame[] = [];
  for (let t = 0; t < 5; t += 0.01) {
    const hit = clicks.some((c, i) => !missing.includes(i) && t >= c + delay && t < c + delay + 0.05);
    out.push({ t, levelDb: hit ? -20 : -60 + ((t * 1000) % 3) });
  }
  return out;
}

describe('calibración del retraso', () => {
  const clicks = [0.5, 1, 1.5, 2, 2.5, 3];

  it('mide el retraso típico (mediana)', () => {
    const r = estimateLatency(frames(clicks, 0.13), clicks)!;
    expect(r.latencyS).toBeCloseTo(0.13, 1);
    expect(r.detected).toBe(6);
    expect(r.spreadS).toBeLessThan(0.02);
  });

  it('tolera clics perdidos, pero no la mayoría', () => {
    expect(estimateLatency(frames(clicks, 0.2, [0, 3]), clicks)?.latencyS).toBeCloseTo(0.2, 1);
    expect(estimateLatency(frames(clicks, 0.2, [0, 1, 2, 3]), clicks)).toBeNull();
  });

  it('si el micro no oye nada (auriculares), no hay medida', () => {
    expect(estimateLatency(frames([], 0), clicks)).toBeNull();
  });
});
