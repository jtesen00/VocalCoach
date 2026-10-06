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
  await expect(page.getByRole('status').filter({ hasText: 'Conectado' })).toBeVisible();
  await expect(page.getByLabel('Clave de Groq')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vocalcoach.ai.v1')!).model)).toBe('llama-3.3-70b-versatile');

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
  expect(await page.evaluate(() => localStorage.getItem('vocalcoach.ai.v1'))).toBeNull();
});
