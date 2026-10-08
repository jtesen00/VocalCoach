import { describe, expect, it } from 'vitest';
import { separateVocals, separationChunks, transitionWindow } from './separation';

const SEG = 1000;

describe('separación de voz: troceado y recomposición', () => {
  it('los segmentos cubren todo el audio con un 25 % de solapamiento', () => {
    const chunks = separationChunks(3200, SEG);
    expect(chunks.map((c) => c.start)).toEqual([0, 750, 1500, 2250, 3000]);
    expect(chunks.at(-1)).toEqual({ start: 3000, length: 200 });
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBeLessThan(chunks[i - 1].start + chunks[i - 1].length);
  });

  it('un audio más corto que un segmento es un solo segmento', () => {
    expect(separationChunks(300, SEG)).toEqual([{ start: 0, length: 300 }]);
  });

  it('la ventana sube y baja en los extremos', () => {
    const w = transitionWindow(SEG);
    expect(w[0]).toBe(0);
    expect(w[SEG / 2]).toBe(1);
    expect(w[SEG - 1]).toBe(0);
  });

  it('con un modelo identidad, la salida es la entrada (sin costuras ni bordes en silencio)', async () => {
    const n = 3456;
    const left = Float32Array.from({ length: n }, (_, i) => Math.sin(i / 7));
    const right = Float32Array.from({ length: n }, (_, i) => Math.cos(i / 5));
    const progress: number[] = [];
    const out = await separateVocals(left, right, async (x) => x.slice(), { segment: SEG, onProgress: (p) => progress.push(p) });
    for (let i = 0; i < n; i++) {
      expect(out.left[i]).toBeCloseTo(left[i], 5);
      expect(out.right[i]).toBeCloseTo(right[i], 5);
    }
    expect(progress.at(-1)).toBe(1);
  });

  it('en mono se usa el mismo canal en los dos lados', async () => {
    const left = Float32Array.from({ length: 1500 }, (_, i) => Math.sin(i / 3));
    const out = await separateVocals(left, null, async (x) => x.slice(), { segment: SEG });
    expect(out.right[700]).toBeCloseTo(left[700], 5);
  });

  it('el modelo recibe cada segmento en estéreo plano y relleno con silencio', async () => {
    const left = new Float32Array(1200).fill(0.5);
    const right = new Float32Array(1200).fill(-0.5);
    const seen: Float32Array[] = [];
    await separateVocals(left, right, async (x) => (seen.push(x.slice()), x.slice()), { segment: SEG });
    const last = seen.at(-1)!;
    expect(last.length).toBe(2 * SEG);
    expect(last[0]).toBe(0.5);
    expect(last[SEG]).toBe(-0.5);
    expect(last[SEG - 1]).toBe(0); // 1200 − 750 = 450 muestras útiles: el resto es silencio
  });

  it('se puede cancelar entre segmentos', async () => {
    let calls = 0;
    const run = separateVocals(new Float32Array(5000), null, async (x) => (calls++, x), { segment: SEG, cancelled: () => calls >= 2 });
    await expect(run).rejects.toThrow(/cancelada/);
    expect(calls).toBe(2);
  });
});
