import { expect, test } from '@playwright/test';

/**
 * Profe con IA: la API de Groq se simula (page.route). Se comprueba la conexión desde
 * Ajustes, que tras un ejercicio aparece «Explícamelo (IA)», y que solo se envía texto.
 */
test('profe con IA (Groq simulado): conectar clave, explicación y pregunta', async ({ page }) => {
  const sent: string[] = [];
  await page.route('**/openai/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'llama-3.1-8b-instant', active: true }, { id: 'llama-3.3-70b-versatile', active: true }] }, headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.route('**/openai/v1/chat/completions', async (route) => {
    const body = route.request().postData() ?? '';
    sent.push(body);
    const n = sent.length;
    await route.fulfill({
      json: { choices: [{ message: { content: n === 1 ? '¡Bien hecho! Mantuviste el Do firme. Prueba ahora la nota larga.' : 'Respira antes de empezar y apoya el final.' } }] },
      headers: { 'access-control-allow-origin': '*' },
    });
  });

  await page.addInitScript(() => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();

  // Sin clave, no aparece el botón de IA.
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel('Clave de Groq').fill('gsk_prueba');
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Groq conectado' })).toBeVisible();
  await expect(page.locator('.ai-providers')).toContainText('Groq (preferido)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocalcoach.ai.v2')!).providers.groq.model)).toBe('llama-3.3-70b-versatile');

  await page.getByRole('button', { name: 'Practicar', exact: true }).click();
  await page.getByRole('button', { name: 'Practicar Mantén una nota', exact: true }).click();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 15_000 });

  await page.getByRole('button', { name: '💬 Explícamelo (IA)' }).click();
  await expect(page.locator('.ai-chat')).toContainText('Mantuviste el Do firme');
  await page.getByLabel('Pregunta para el profe').fill('¿Cómo aguanto más?');
  await page.getByRole('button', { name: 'Preguntar' }).click();
  await expect(page.locator('.ai-chat')).toContainText('Respira antes de empezar');

  // Lo enviado: el modelo elegido, un resumen en texto y la pregunta; nada de audio ni frames.
  const first = JSON.parse(sent[0]);
  expect(first.model).toBe('llama-3.3-70b-versatile');
  expect(first.messages[1].content).toContain('Ejercicio: Mantén una nota');
  expect(sent[0].length).toBeLessThan(5000);
  expect(sent[1]).toContain('¿Cómo aguanto más?');
});

test('profe con IA: clave inválida', async ({ page }) => {
  await page.route('**/openai/v1/models', (route) => route.fulfill({ status: 401, json: { error: { message: 'Invalid API Key' } }, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel('Clave de Groq').fill('gsk_mala');
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'no es válida' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vocalcoach.ai.v2'))).toBeNull();
});

test('multi-IA: si Groq está saturado responde Gemini, y se elige el modelo por la lista', async ({ page }) => {
  const asked: string[] = [];
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('**/openai/v1/models', (route) => route.fulfill({ json: { data: [{ id: 'llama-3.3-70b-versatile' }] }, headers: cors }));
  await page.route('**/openai/v1/chat/completions', (route) => {
    asked.push('groq');
    return route.fulfill({ status: 429, json: { error: { message: 'rate' } }, headers: cors });
  });
  await page.route('**/v1beta/openai/models', (route) =>
    route.fulfill({
      json: { data: ['models/gemini-2.5-flash', 'models/gemini-3.6-flash', 'models/gemini-3.6-flash-image', 'models/gemini-3.6-flash-lite', 'models/gemini-3.6-pro-preview'].map((id) => ({ id })) },
      headers: cors,
    }),
  );
  await page.route('**/v1beta/openai/chat/completions', (route) => {
    asked.push(`gemini:${JSON.parse(route.request().postData() ?? '{}').model}`);
    return route.fulfill({ json: { choices: [{ message: { content: 'Te lo explica Gemini: ¡muy bien!' } }] }, headers: cors });
  });

  await page.addInitScript(() => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel('Proveedor de IA').selectOption('groq');
  await page.getByLabel('Clave de Groq').fill('gsk_prueba');
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Groq conectado' })).toBeVisible();
  await page.getByLabel('Proveedor de IA').selectOption('gemini');
  await page.getByLabel('Clave de Google Gemini').fill('AIza_prueba');
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Google Gemini conectado' })).toBeVisible();
  await expect(page.locator('.ai-providers')).toContainText('Groq (preferido)');
  await expect(page.locator('.ai-providers')).toContainText('Google Gemini (respaldo)');
  // Flash más nuevo, sin variantes de imagen, lite ni vista previa.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocalcoach.ai.v2')!).providers.gemini.model)).toBe('gemini-3.6-flash');

  await page.getByRole('button', { name: 'Practicar', exact: true }).click();
  await page.getByRole('button', { name: 'Practicar Mantén una nota', exact: true }).click();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 15_000 });
  await page.getByRole('button', { name: '💬 Explícamelo (IA)' }).click();
  await expect(page.locator('.ai-chat')).toContainText('Te lo explica Gemini');
  expect(asked).toEqual(['groq', 'gemini:gemini-3.6-flash']);
});

test('multi-IA: la clave de la versión anterior (solo Groq) se conserva', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('vocalcoach.ai.v2')) localStorage.setItem('vocalcoach.ai.v1', JSON.stringify({ groqKey: 'gsk_antigua', model: 'llama-3.3-70b-versatile' }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await expect(page.locator('.ai-providers')).toContainText('Groq (preferido)');
});
