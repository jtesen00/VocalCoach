import { expect, test } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
const APP = 'http://localhost:4173';
// El código de page.evaluate corre en el navegador (este archivo se compila sin tipos DOM).

/** Fase 7: la versión compilada se instala como PWA y funciona sin internet. */
test('PWA: manifiesto, service worker y práctica sin conexión', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })));
  await page.goto(APP);

  // Manifiesto instalable.
  const manifest: any = await page.evaluate(async () => {
    const href = (globalThis as any).document.querySelector('link[rel="manifest"]').getAttribute('href');
    return (await fetch(href)).json();
  });
  expect(manifest).toMatchObject({ name: 'Vocal Coach', display: 'standalone', start_url: '/', lang: 'es' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));

  // Service worker activo y app guardada para usar sin internet.
  await page.evaluate(() => (globalThis as any).navigator.serviceWorker.ready.then(() => true));
  await expect(page.getByRole('status').filter({ hasText: 'Lista para usar sin internet' })).toBeVisible({ timeout: 20_000 });
  await page.reload(); // la página pasa a estar controlada por el service worker
  await page.evaluate(() => (globalThis as any).navigator.serviceWorker.ready.then(() => true));

  // Sin conexión: la app carga, avisa y se puede practicar (worklet y sonidos desde la caché).
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Sin conexión: puedes practicar igual')).toBeVisible();
  const samples = await page.evaluate(async () => (await Promise.all(['/samples/manifest.json', '/samples/piano.mp3', '/samples/voz.mp3'].map((u) => fetch(u)))).map((r) => r.ok));
  expect(samples).toEqual([true, true, true]);

  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Practicar Mantén una nota', exact: true }).click();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 15_000 });

  // Instalar: en Ajustes hay instrucciones (o el botón, si el navegador lo ofrece).
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.getByRole('group', { name: 'Instalar la app' })).toContainText(/Instalar|pantalla de inicio/);
  await context.setOffline(false);
});
