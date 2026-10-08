import { expect, test, type Page } from '@playwright/test';

/** Fase 9: guía cantada con la letra e ideas de interpretación con IA (proveedor simulado). */
async function openPhrase(page: Page, settings: object) {
  await page.addInitScript((s) => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify(s)), settings);
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Canciones', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Estrellita' }).click();
  await page.getByRole('button', { name: 'Practicar frase 1' }).click();
}

test('guía cantada: «Escúchala cantada» y, con el ajuste, la frase se canta con la letra', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPhrase(page, { range: { lowMidi: 55, highMidi: 67 }, singLyrics: true });
  await page.getByRole('button', { name: '🗣 Escúchala cantada' }).click();
  await expect(page.getByRole('button', { name: '♪ Cantando…' })).toBeVisible();
  await expect(page.getByRole('button', { name: '🗣 Escúchala cantada' })).toBeVisible({ timeout: 15_000 });
  // Con «Que la guía cante la letra», la frase completa (escuchar → cantar) funciona igual.
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.phase')).toHaveText('¡Canta!', { timeout: 15_000 });
  await expect(page.locator('.phrase-score strong')).toHaveText(/^\d+ %$/, { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('el ajuste «Que la guía cante la letra» se guarda', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel(/Que la guía cante la letra/).check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocalcoach.settings.v1')!).singLyrics)).toBe(true);
});

test('«¿Cómo la canto? (IA)»: envía la frase en texto y muestra las ideas', async ({ page }) => {
  const cors = { 'access-control-allow-origin': '*' };
  let sent = '';
  await page.route('**/xai/v1/models', (r) => r.fulfill({ json: { data: [{ id: 'grok-4.6' }, { id: 'grok-4-1-fast-non-reasoning' }] }, headers: cors }));
  await page.route('**/xai/v1/chat/completions', (r) => {
    sent = r.request().postData() ?? '';
    return r.fulfill({ json: { choices: [{ message: { content: '• Respira antes de «dónde».\n• Abre la «a» de «tás».' } }] }, headers: cors });
  });
  await page.addInitScript(() =>
    localStorage.setItem('vocalcoach.ai.v2', JSON.stringify({ providers: { xai: { key: 'xai-prueba', model: 'grok-4-1-fast-non-reasoning' } }, preferred: 'xai' })),
  );
  await openPhrase(page, { range: { lowMidi: 55, highMidi: 67 } });
  await page.getByRole('button', { name: '💡 ¿Cómo la canto? (IA)' }).click();
  await expect(page.locator('.ai-tips-text')).toContainText('Respira antes de «dónde»');
  await expect(page.locator('.ai-phrase-tips')).toContainText('xAI Grok');
  const body = JSON.parse(sent);
  expect(body.model).toBe('grok-4-1-fast-non-reasoning');
  expect(body.messages[1].content).toContain('Letra de la frase: «Estrellita, dónde estás»');
  expect(body.messages[1].content).toContain('zona cómoda');
  expect(sent.length).toBeLessThan(5000);
});
