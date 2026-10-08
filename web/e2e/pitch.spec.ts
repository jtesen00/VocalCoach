import { expect, test, type Page } from '@playwright/test';

// El micrófono falso canta siempre C4 +5 c (con 0,5 s de silencio cada 3 s).
const status = (page: Page) => page.locator('.status-big strong');

async function start(page: Page, settings?: object) {
  if (settings) await page.addInitScript((s) => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify(s)), settings);
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await expect(page.getByText('Micrófono activo')).toBeVisible();
}

test('primera vez: medir la voz → practicar → canta libre en lenguaje sencillo', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('heading', { name: 'Tu nota más grave' })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByRole('heading', { name: 'Tu nota más aguda' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByRole('heading', { name: '¡Listo! Ya conocemos tu voz' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Empezar a practicar' }).click();
  await expect(page.getByRole('heading', { name: 'Practicar' })).toBeVisible();

  await page.getByRole('button', { name: 'Canta libre' }).click();
  await expect(page.getByRole('group', { name: 'Nota a cantar' }).locator('output')).toHaveText('Do');
  await expect(status(page)).toHaveText('¡Afinado!', { timeout: 5_000 });
  await expect(page.locator('.singing-now')).toHaveText('Estás cantando: Do');
  await expect(page.locator('.attempt strong')).toHaveText(/^(9\d|100)%$/, { timeout: 5_000 });
  // Sin jerga por defecto: ni cents, ni Hz, ni diagnóstico.
  await expect(page.locator('.readout-detail')).toHaveCount(0);
  await expect(page.getByText('Diagnóstico')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('detalles técnicos opcionales: nota con octava, cents y diagnóstico', async ({ page }) => {
  await start(page, { range: { lowMidi: 55, highMidi: 65 } });
  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel('Mostrar detalles técnicos').check();
  await page.getByRole('button', { name: 'Canta libre' }).click();
  await expect(page.getByRole('group', { name: 'Nota a cantar' }).locator('output')).toHaveText('C4');
  await expect(page.locator('.readout-detail .cents')).toHaveText(/^\+[3-7] c$/, { timeout: 5_000 });
  await page.getByText('Diagnóstico').click();
  await expect(page.locator('dt:has-text("Supresión de ruido") + dd')).toHaveText('desactivado');
});

test('octava exacta frente a "vale más grave o más agudo", con consejo en vivo', async ({ page }) => {
  await start(page, { range: { lowMidi: 43, highMidi: 53 }, octaveMode: 'exact' });
  await page.getByRole('button', { name: 'Canta libre' }).click();
  await expect(page.getByRole('group', { name: 'Nota a cantar' }).locator('output')).toHaveText('Do');
  // Objetivo C3, el micro canta C4: una octava por encima.
  await expect(status(page)).toHaveText('Baja bastante', { timeout: 5_000 });

  // Coach en vivo: tras 2 s por encima, un consejo.
  await expect(page.locator('.live-tip')).toContainText('Llevas un rato por encima', { timeout: 5_000 });

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await page.getByLabel('Vale cantar la misma nota más grave o más aguda').check();
  await page.getByRole('button', { name: 'Canta libre' }).click();
  await expect(status(page)).toHaveText('¡Afinado!', { timeout: 5_000 });
});

test('llamada y respuesta: mientras suena la nota no se escucha el micro', async ({ page }) => {
  await start(page, { range: { lowMidi: 55, highMidi: 65 } });
  await page.getByRole('button', { name: 'Canta libre' }).click();
  await expect(status(page)).toHaveText('¡Afinado!', { timeout: 5_000 });

  await page.getByRole('button', { name: '▶ Escuchar y cantar' }).click();
  await expect(page.getByText('Escucha la nota…')).toBeVisible();
  await expect(status(page)).toHaveText('Escucha la nota');
  await expect(page.getByText('¡Tu turno! Cántala igual.')).toBeVisible({ timeout: 3_000 });
  await expect(status(page)).toHaveText('¡Afinado!', { timeout: 5_000 });
});
