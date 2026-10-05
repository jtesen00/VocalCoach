import { expect, test } from '@playwright/test';

test('micrófono → calibración de rango → afinador detecta C4 en tiempo real', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await expect(page.getByText('Micrófono activo')).toBeVisible();

  // Sin rango guardado se empieza por la calibración. El micro falso canta siempre C4.
  await expect(page.getByRole('heading', { name: 'Nota más grave' })).toBeVisible();
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByRole('heading', { name: 'Nota más aguda' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.getByText('C4 – C4')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Ir al afinador' }).click();

  // Objetivo = centro del rango = C4; el afinador debe mostrar C4 y "Perfecto".
  await expect(page.getByRole('group', { name: 'Nota objetivo' }).locator('output')).toHaveText('C4');
  await expect(page.locator('.readout .note')).toHaveText('C4', { timeout: 5_000 });
  await expect(page.locator('.status strong')).toHaveText('Perfecto');
  await expect(page.locator('.readout .cents')).toHaveText(/^\+[3-7] c$/);

  // Precisión del intento y diagnóstico de captura sin procesado del navegador.
  await expect(page.locator('.attempt strong')).toHaveText(/^(9\d|100)%$/, { timeout: 5_000 });
  await page.getByText('Diagnóstico').click();
  await expect(page.locator('dt:has-text("Supresión de ruido") + dd')).toHaveText('desactivado');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('modo octava exacta: C4 con objetivo C3 se marca como demasiado alto', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 43, highMidi: 53 }, octaveMode: 'exact' })),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await expect(page.getByRole('group', { name: 'Nota objetivo' }).locator('output')).toHaveText('C3');
  await expect(page.locator('.status strong')).toHaveText('Demasiado alto', { timeout: 5_000 });

  await page.getByLabel('Octava').selectOption('pitch-class');
  await expect(page.locator('.status strong')).toHaveText('Perfecto');
});

test('llamada y respuesta: mientras suena la referencia no se analiza el micro', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await expect(page.locator('.status strong')).toHaveText('Perfecto', { timeout: 5_000 });

  await page.getByRole('button', { name: 'Escuchar y cantar' }).click();
  await expect(page.getByText('Escucha la nota C4…')).toBeVisible();
  await expect(page.locator('.status strong')).toHaveText('Escucha la referencia');
  await expect(page.locator('.readout .note')).toHaveText('—');
  await expect(page.getByText('¡Tu turno! Canta C4.')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('.status strong')).toHaveText('Perfecto', { timeout: 5_000 });
});
