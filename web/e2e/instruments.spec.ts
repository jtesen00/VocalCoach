import { expect, test } from '@playwright/test';

/**
 * Los instrumentos (grabaciones reales) se renderizan en el navegador (OfflineAudioContext) y se
 * verifican con las herramientas de la app: la melodía sola con el detector de afinación
 * y los acordes solos con el reconocedor de acordes.
 */
test('cada instrumento toca las notas exactas y los acordes correctos', async ({ page }) => {
  await page.goto('/');
  const report = await page.evaluate(async () => {
    // Código que corre en el navegador: los módulos se cargan del servidor de Vite por URL.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const load = (path: string): Promise<any> => import(/* @vite-ignore */ path);
    const OfflineCtx = (globalThis as any).OfflineAudioContext;
    const ins = await load('/src/audio/instruments.ts');
    const { SONGS } = await load('/src/core/songs/catalog.ts');
    const { allPhrases, phrasePlan } = await load('/src/core/songs/melody.ts');
    const { guideEvents, guideChords } = await load('/src/core/exercises/guide.ts');
    const { createDetector } = await load('/src/core/pitch/detector.ts');
    const { recognizeChords } = await load('/src/core/songs/chord-recognition.ts');
    const song = SONGS.find((s: any) => s.id === 'luz-de-puerto');
    const plan = phrasePlan(allPhrases(song)[7], -3); // grave → agudo → aguda larga
    const sr = 22050;
    const out: Record<string, { ready: boolean; notes: number; chords: number; meanCents: number; maxCents: number; list: number[] }> = {};
    for (const { id } of ins.INSTRUMENTS) {
      const ready = await ins.loadInstrument(id);
      const ctx = new OfflineCtx(1, Math.ceil((plan.durationS + 1.5) * sr), sr);
      ins.playMelody(ctx, id, guideEvents(plan), 0.2, []);
      const x = (await ctx.startRendering()).getChannelData(0);
      const det = createDetector('mpm', { sampleRate: sr, windowSize: 1024, minHz: 70, maxHz: 1200 });
      const cents: number[] = [];
      const notes = plan.segments.filter((s: any) => {
        const mid = Math.round((0.2 + (s.startS + s.endS) / 2) * sr);
        const f0 = det.detect(x.subarray(mid - 512, mid + 512)).f0;
        if (f0 === null) return false;
        const dev = 69 + 12 * Math.log2(f0 / 440) - s.fromMidi;
        cents.push(dev * 100);
        return Math.abs(dev) < 0.3;
      }).length;
      const c2 = new OfflineCtx(2, Math.ceil((plan.durationS + 1.5) * sr), sr);
      const chords = guideChords(plan)!;
      ins.playChords(c2, id, chords, 0.2, []);
      const b = await c2.startRendering();
      const rec = recognizeChords(b.getChannelData(0), b.getChannelData(1), sr);
      out[id] = {
        ready,
        notes,
        meanCents: Math.abs(cents.reduce((a, c) => a + c, 0) / cents.length),
        maxCents: Math.max(...cents.map(Math.abs)),
        list: cents.map(Math.round),
        chords: chords.filter((c: any) => rec.some((r: any) => r.chord.root === c.chord.root && r.chord.quality === c.chord.quality && r.startS < 0.2 + c.endS && r.endS > 0.2 + c.startS)).length,
      };
    }
    return { out, notes: plan.segments.length, chords: plan.chords!.length };
  });
  for (const [id, r] of Object.entries(report.out)) {
    expect({ ready: r.ready, notes: r.notes, chords: r.chords }, id).toEqual({ ready: true, notes: report.notes, chords: report.chords });
    // Afinación de la guía: sin desviación media apreciable (el vibrato oscila alrededor de la nota).
    expect(r.meanCents, `${id} desviación media`).toBeLessThan(8);
    expect(r.maxCents, `${id} desviación máxima`).toBeLessThan(25);
  }
});
