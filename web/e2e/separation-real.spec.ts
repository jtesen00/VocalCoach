import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Fase 8c: extracción de la melodía con y sin separación de voz (HT-Demucs FT en ONNX) en la
 * mezcla realista de instrumentos grabados (src/dev/real-mix.ts), con el flujo completo de la
 * importación (WAV → decodificar → separar → analizar).
 *
 * Necesita el modelo en `web/.models/` (no se versiona; ver bench/separation.ts). Sin él, se
 * omite. Tarda varios minutos: sin GPU, la separación va a ~2× tiempo real.
 */
const MODEL = resolve(import.meta.dirname, '../.models/htdemucs_ft_vocals_fp16weights.onnx');

test('separación de voz en una mezcla realista', async ({ page }) => {
  test.skip(!existsSync(MODEL), 'Falta el modelo de separación en web/.models/');
  test.setTimeout(30 * 60_000);
  page.on('console', (m) => m.type() === 'error' && console.log('[navegador]', m.text()));
  await page.goto('/');
  const results = await page.evaluate(async () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const load = (p: string): Promise<any> => import(/* @vite-ignore */ p);
    const { renderRealMix } = await load('/src/dev/real-mix.ts');
    const { importSongFromFile } = await load('/src/audio/melody-import.ts');
    const { MODEL_CACHE, MODEL_KEY } = await load('/src/audio/separation-model.ts');
    const { allPhrases } = await load('/src/core/songs/melody.ts');

    // El modelo, servido por Vite desde .models/, a la caché donde lo busca la app.
    const cache = await (globalThis as any).caches.open(MODEL_CACHE);
    await cache.put(MODEL_KEY, await fetch('/.models/htdemucs_ft_vocals_fp16weights.onnx'));

    const wav = (l: Float32Array, r: Float32Array, sr: number) => {
      const n = l.length;
      const buf = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o: number, s: string) => [...s].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF'); buf.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt ');
      buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 2, true);
      buf.setUint32(24, sr, true); buf.setUint32(28, sr * 4, true); buf.setUint16(32, 4, true); buf.setUint16(34, 16, true);
      str(36, 'data'); buf.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        buf.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
        buf.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
      }
      return new File([buf], 'mezcla.wav', { type: 'audio/wav' });
    };

    // Notas de la canción importada con sus tiempos absolutos (bpm 60: 1 pulso = 1 s).
    const notesOf = (song: any) => allPhrases(song).flatMap((ref: any) => {
      let t = ref.phrase.originS;
      return ref.phrase.notes.map((n: any) => {
        t += n.restBefore ?? 0;
        const note = { midi: n.midi, startS: t, endS: t + n.beats };
        t += n.beats;
        return note;
      });
    });
    const overlap = (a: any, b: any) => Math.min(a.endS, b.endS) - Math.max(a.startS, b.startS);
    const score = (clean: any[], melody: any[]) => ({
      correct: melody.filter((m) => {
        let best: any = null, bo = 0;
        for (const n of clean) if (overlap(n, m) > bo) { bo = overlap(n, m); best = n; }
        return best && best.midi === m.midi && bo > 0.5 * (m.endS - m.startS);
      }).length / melody.length,
      extra: clean.filter((n) => !melody.some((m) => m.midi === n.midi && overlap(n, m) > 0.5 * (n.endS - n.startS))).length / melody.length,
    });

    const cases: [string, any][] = [
      ['estéreo, voz a 0 dB', {}],
      ['voz 4 dB bajo la banda', { vocalDb: -4 }],
      ['voz 8 dB bajo la banda', { vocalDb: -8 }],
      ['mono', { stereo: false }],
      ['voz grave (−12)', { transpose: -12 }],
      ['voz grave, mono', { transpose: -12, stereo: false }],
    ];
    const out: any[] = [];
    for (const [name, o] of cases) {
      const mix = await renderRealMix({ ...o, sampleRate: 44100 });
      const file = wav(mix.left, mix.right, mix.sampleRate);
      const row: any = { name };
      for (const separate of [false, true]) {
        const t0 = performance.now();
        const { song } = await importSongFromFile(file, { separate });
        row[separate ? 'sep' : 'mix'] = { ...score(notesOf(song), mix.melody), s: (performance.now() - t0) / 1000, quality: song.extraction.quality };
      }
      row.durationS = mix.left.length / mix.sampleRate;
      out.push(row);
    }
    return out;
  });
  const pct = (v: number) => `${Math.round(v * 100)} %`.padStart(5);
  console.log(results.map((r) =>
    `${r.name.padEnd(26)} mezcla: bien ${pct(r.mix.correct)} · de más ${pct(r.mix.extra)} (${r.mix.quality})   ` +
    `voz separada: bien ${pct(r.sep.correct)} · de más ${pct(r.sep.extra)} (${r.sep.quality}) · ${(r.sep.s / r.durationS).toFixed(1)}× tiempo real`).join('\n'));
  // Umbrales: lo medido menos un margen (docs/planning/fase-08c-separacion-de-voz.md). La voz
  // grave pierde notas al separarla: por eso la separación es opcional.
  const min: Record<string, number> = {
    'estéreo, voz a 0 dB': 0.88,
    'voz 4 dB bajo la banda': 0.9,
    'voz 8 dB bajo la banda': 0.85,
    mono: 0.9,
    'voz grave (−12)': 0.55,
    'voz grave, mono': 0.5,
  };
  for (const r of results) {
    expect(r.sep.correct, r.name).toBeGreaterThanOrEqual(min[r.name]);
    expect(r.sep.extra, r.name).toBeLessThanOrEqual(0.1);
  }
});
