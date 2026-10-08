import { expect, test } from '@playwright/test';

/**
 * Extracción de la melodía en una mezcla "de canción" hecha con instrumentos GRABADOS
 * (src/dev/real-mix.ts): cantante con ataques desde abajo, vibrato y pequeñas desafinaciones;
 * piano, bajo, cuerdas, batería y reverb. Mide lo que oye el usuario en la guía: qué
 * fracción de las notas cantadas sale con la altura correcta tras limpiar la línea.
 */
test('melodía extraída de una mezcla realista (instrumentos grabados)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  const results = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const { renderRealMix } = await load('/src/dev/real-mix.ts');
    const { transcribeAudio, cleanNotes } = await load('/src/core/songs/transcribe.ts');
    const cases: [string, any][] = [
      ['estéreo, voz a 0 dB', {}],
      ['estéreo, voz 4 dB bajo la banda', { vocalDb: -4 }],
      ['mono', { stereo: false }],
      ['voz grave (−12)', { transpose: -12 }],
      ['mucho vibrato', { vibrato: 60, drift: 25 }],
    ];
    const out: { name: string; correct: number; extra: number }[] = [];
    for (const [name, o] of cases) {
      const mix = await renderRealMix(o);
      const { notes } = transcribeAudio(mix.left, o.stereo === false ? null : mix.right, mix.sampleRate);
      const clean = cleanNotes(notes);
      const overlap = (a: any, b: any) => Math.min(a.endS, b.endS) - Math.max(a.startS, b.startS);
      // Nota cantada bien recuperada: la nota extraída que más se solapa con ella tiene su altura.
      const correct = mix.melody.filter((m: any) => {
        let best: any = null, bo = 0;
        for (const n of clean) if (overlap(n, m) > bo) { bo = overlap(n, m); best = n; }
        return best && best.midi === m.midi && bo > 0.5 * (m.endS - m.startS);
      }).length / mix.melody.length;
      // Notas que no están en la melodía (lo que sonaría "de más" en la guía).
      const extra = clean.filter((n: any) => !mix.melody.some((m: any) => m.midi === n.midi && overlap(n, m) > 0.5 * (n.endS - n.startS))).length / mix.melody.length;
      out.push({ name, correct, extra });
    }
    return out;
  });
  console.log(results.map((r) => `${r.name.padEnd(32)} notas bien ${(r.correct * 100).toFixed(0)} % · de más ${(r.extra * 100).toFixed(0)} %`).join('\n'));
  // Umbrales: lo medido menos un margen (docs/research/fuentes-de-melodia.md).
  const min: Record<string, number> = {
    'estéreo, voz a 0 dB': 0.9,
    'estéreo, voz 4 dB bajo la banda': 0.88,
    mono: 0.88,
    'voz grave (−12)': 0.72,
    'mucho vibrato': 0.88,
  };
  for (const r of results) {
    expect(r.correct, r.name).toBeGreaterThanOrEqual(min[r.name]);
    expect(r.extra, r.name).toBeLessThanOrEqual(0.2);
  }
});
