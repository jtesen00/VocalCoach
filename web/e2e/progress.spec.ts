import { expect, test } from '@playwright/test';

// El micrófono falso canta siempre C4 +5 c (con 0,5 s de silencio cada 3 s).
test('camino y progreso: superar el día 1, racha y mejor resultado, guardados tras recargar', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();

  const path = page.getByRole('region', { name: 'Tu camino' });
  await expect(path).toContainText('Día 1 de 10: Tu primera nota');
  await path.getByRole('button', { name: 'Empezar paso: Mantén una nota' }).click();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 15_000 });

  await page.getByRole('button', { name: '← Todos los ejercicios' }).click();
  await expect(path).toContainText('Día 2 de 10: Que no se caiga');
  await expect(path.locator('.streak')).toHaveText('🔥 1 día');
  await expect(path.locator('.path-steps li.ok')).toHaveCount(1); // "Mantén una nota" ya cuenta para el día 2
  await expect(page.locator('.exercise-best')).toHaveCount(1);

  await page.getByRole('button', { name: 'Progreso' }).click();
  const progress = page.getByRole('region', { name: 'Progreso' });
  await expect(progress.locator('.stat-tiles')).toContainText('🔥 1');
  await expect(progress.locator('.stat-tiles')).toContainText('1/10');
  await expect(progress.locator('.best-list li')).toHaveCount(1);
  await expect(progress.locator('.calendar .cell[data-on]')).toHaveCount(1);

  // Se guarda en IndexedDB: sigue ahí al recargar.
  await page.reload();
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Progreso' }).click();
  await expect(progress.locator('.best-list li')).toHaveCount(1);
  await expect(progress.locator('.stat-tiles')).toContainText('1/10');

  // Borrar el progreso.
  await progress.getByRole('button', { name: 'Borrar mi progreso' }).click();
  await progress.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(progress).toContainText('Aún no hay intentos');
});
