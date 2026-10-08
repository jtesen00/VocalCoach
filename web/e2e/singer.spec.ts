import { expect, test } from '@playwright/test';

/**
 * Fase 9: la voz sintética que canta la letra se renderiza en el navegador (OfflineAudioContext)
 * y se comprueba con las herramientas de la app: afinación con el detector, volumen parecido al
 * de la guía y vocales distinguibles por sus formantes.
 */
test('la voz sintética canta afinada, con volumen de guía y vocales distinguibles', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const OfflineCtx = (globalThis as any).OfflineAudioContext;
    const { playSung } = await load('/src/audio/singer.ts');
    const ins = await load('/src/audio/instruments.ts');
    const { sungScore } = await load('/src/core/singing/score.ts');
    const { SONGS } = await load('/src/core/songs/catalog.ts');
    const { allPhrases, phrasePlan } = await load('/src/core/songs/melody.ts');
    const { guideEvents } = await load('/src/core/exercises/guide.ts');
    const { createDetector } = await load('/src/core/pitch/detector.ts');
    const { FFT } = await load('/src/core/pitch/fft.ts');
    const sr = 22050;
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

    const render = async (fn: (ctx: any) => void, dur: number) => {
      const ctx = new OfflineCtx(1, Math.ceil(dur * sr), sr);
      fn(ctx);
      return (await ctx.startRendering()).getChannelData(0) as Float32Array;
    };

    // 1. Afinación: «Estrellita» en voz grave y aguda.
    const song = SONGS.find((s: any) => s.id === 'estrellita') ?? SONGS[0];
    const pitch: Record<string, { ok: number; total: number; cents: number[]; rms: number }> = {};
    for (const [voice, transpose] of [['grave', -12], ['aguda', 0]] as const) {
      const plan = phrasePlan(allPhrases(song)[0], transpose);
      const score = sungScore(plan);
      const x = await render((ctx) => playSung(ctx, score, voice, 0.2, []), plan.durationS + 1);
      const det = createDetector('mpm', { sampleRate: sr, windowSize: 1024, minHz: 70, maxHz: 1200 });
      const cents: number[] = [];
      const ok = plan.segments.filter((s: any) => {
        const mid = Math.round((0.2 + s.startS + 0.6 * (s.endS - s.startS)) * sr);
        const f0 = det.detect(x.subarray(mid - 512, mid + 512)).f0;
        if (f0 === null) return false;
        const dev = (69 + 12 * Math.log2(f0 / 440) - s.fromMidi) * 100;
        cents.push(Math.round(dev));
        return Math.abs(dev) < 30;
      }).length;
      pitch[voice] = { ok, total: plan.segments.length, cents, rms: rms(x) };
    }
    // Referencia de volumen: el instrumento «voz» con la misma frase.
    await ins.loadInstrument('voz');
    const refPlan = phrasePlan(allPhrases(song)[0], 0);
    const ref = rms(await render((ctx) => ins.playMelody(ctx, 'voz', guideEvents(refPlan), 0.2, []), refPlan.durationS + 1));

    // 2. Vocales: energía en la zona de F1 y de F2 de una nota larga con cada vocal.
    const one = (label: string) => ({
      def: { id: 'v', kind: 'sequence', title: '', summary: '', instructions: '', level: 'beginner', notes: [] },
      rootMidi: 57, durationS: 1.2, segments: [{ startS: 0, endS: 1.2, fromMidi: 57, toMidi: 57, label }],
    });
    const bands: Record<string, { low: number; f1: number; f2: number; f2i: number }> = {};
    for (const v of ['a', 'e', 'i', 'o', 'u']) {
      const x = await render((ctx) => playSung(ctx, sungScore(one(v)), 'grave', 0, []), 1.4);
      const N = 4096;
      const fft = new FFT(N);
      const re = new Float64Array(N);
      const im = new Float64Array(N);
      const off = Math.round(0.4 * sr);
      for (let i = 0; i < N; i++) re[i] = x[off + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      fft.transform(re, im);
      const e = (lo: number, hi: number) => {
        let s = 0;
        for (let k = Math.round((lo * N) / sr); k <= Math.round((hi * N) / sr); k++) s += re[k] ** 2 + im[k] ** 2;
        return s;
      };
      bands[v] = { low: e(200, 420), f1: e(550, 900), f2: e(700, 1300), f2i: e(1800, 2700) };
    }
    return { pitch, ref, bands };
  });

  for (const [voice, p] of Object.entries(r.pitch)) {
    expect(p.ok, `${voice}: notas afinadas (${p.cents.join(', ')})`).toBe(p.total);
    // Volumen parecido al de la guía (entre la mitad y el doble).
    expect(p.rms / r.ref, `${voice}: volumen relativo`).toBeGreaterThan(0.5);
    expect(p.rms / r.ref, `${voice}: volumen relativo`).toBeLessThan(2);
  }
  const b = r.bands;
  // «a» abierta: más energía en la zona alta de F1 que «i» y «u» (cerradas).
  expect(b.a.f1 / b.a.low).toBeGreaterThan(b.i.f1 / b.i.low);
  expect(b.a.f1 / b.a.low).toBeGreaterThan(b.u.f1 / b.u.low);
  // «i» y «e» (anteriores): F2 alto; «o» y «u» (posteriores): F2 bajo.
  expect(b.i.f2i / b.i.f2).toBeGreaterThan(b.o.f2i / b.o.f2);
  expect(b.e.f2i / b.e.f2).toBeGreaterThan(b.u.f2i / b.u.f2);
});
