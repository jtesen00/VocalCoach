import { expect, test, type Page } from '@playwright/test';

// El micrófono falso canta siempre C4 +5 c (con 0,5 s de silencio cada 3 s).
async function openExercise(page: Page, title: string) {
  await page.addInitScript(() =>
    localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Ejercicios' }).click();
  await page.getByRole('button', { name: `Practicar ${title}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('nota sostenida en C4: guía → cuenta atrás → canto → superado', async ({ page }) => {
  await openExercise(page, 'Nota sostenida');
  await expect(page.getByRole('group', { name: 'Tónica' }).locator('output')).toHaveText('C4');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.phase')).toHaveText('♪ Escucha la guía…');
  await expect(page.locator('.phase .beat')).toHaveText(/[123]/, { timeout: 5_000 });
  await expect(page.locator('.phase')).toHaveText('¡Canta!', { timeout: 5_000 });
  await expect(page.locator('.result-verdict')).toHaveText('✓ Superado', { timeout: 10_000 });
  await expect(page.locator('.notes-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.notes-table tbody tr td').nth(2)).toContainText('Perfecto');
  await expect(page.getByRole('button', { name: 'Repetir' })).toBeVisible();
});

test('secuencia do-re-mi transpuesta al rango y cantando solo C4: no superada', async ({ page }) => {
  await openExercise(page, 'Tres notas: do-re-mi-re-do');
  // Rango G3–F4: el ejercicio (0, 2, 4 semitonos) se centra → tónica A#3, notas A#3 C4 D4 C4 A#3.
  await expect(page.getByRole('group', { name: 'Tónica' }).locator('output')).toHaveText('A#3');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('✗ No superado', { timeout: 15_000 });
  await expect(page.locator('.notes-table tbody tr')).toHaveCount(5);
  await expect(page.locator('.notes-table tbody')).toContainText('Alto');
  await expect(page.locator('.feedback li').first()).toBeVisible();
});

test('sirena cantando una nota fija: no superada por recorrido', async ({ page }) => {
  await openExercise(page, 'Sirena ascendente');
  await page.getByRole('button', { name: 'Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('✗ No superado', { timeout: 15_000 });
  await expect(page.locator('.siren-stats')).toContainText('Recorrido cubierto');
  await expect(page.locator('.feedback')).toContainText('del recorrido');
});
