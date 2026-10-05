import { expect, test, type Page } from '@playwright/test';

// El micrófono falso canta siempre C4 +5 c (con 0,5 s de silencio cada 3 s).
async function openExercise(page: Page, title: string, extra: object = {}) {
  await page.addInitScript(
    (s) => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify(s)),
    { range: { lowMidi: 55, highMidi: 65 }, ...extra },
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await expect(page.getByRole('heading', { name: 'Practicar' })).toBeVisible();
  await page.getByRole('button', { name: `Practicar ${title}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test('mantén una nota (Do): guía → cuenta atrás → canto → superado con estrellas', async ({ page }) => {
  await openExercise(page, 'Mantén una nota');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.phase')).toHaveText('♪ Escucha la guía…');
  await expect(page.locator('.phase .beat')).toHaveText(/[123]/, { timeout: 5_000 });
  await expect(page.locator('.phase')).toHaveText('¡Canta!', { timeout: 5_000 });
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 10_000 });
  await expect(page.getByRole('img', { name: /^[23] de 3 estrellas$/ })).toBeVisible();
  await expect(page.locator('.result .hint')).toContainText('Afinado el');
  // Sin tabla técnica en el modo sencillo.
  await expect(page.locator('.notes-table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Repetir' })).toBeVisible();
});

test('do-re-mi cantando solo un Do: no superado, con el resultado de cada nota', async ({ page }) => {
  await openExercise(page, 'Do-re-mi');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('Casi… inténtalo otra vez', { timeout: 15_000 });
  await expect(page.locator('.note-chips li')).toHaveCount(5);
  await expect(page.locator('.note-chips')).toContainText('Alta');
  await expect(page.locator('.feedback li').first()).toBeVisible();
  await expect(page.locator('.feedback')).not.toContainText(/\d+ c\b/);
});

test('con detalles técnicos: ejercicio transpuesto y tabla por nota', async ({ page }) => {
  await openExercise(page, 'Do-re-mi', { showDetails: true });
  // Rango G3–F4: el ejercicio (0, 2, 4 semitonos) se centra → tónica A#3.
  await expect(page.getByRole('group', { name: 'Altura del ejercicio' }).locator('output')).toHaveText('A#3');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.notes-table tbody tr')).toHaveCount(5, { timeout: 15_000 });
  await expect(page.locator('.notes-table tbody')).toContainText('Alta');
});

test('sirena cantando una nota fija: no superada por recorrido', async ({ page }) => {
  await openExercise(page, 'Sirena hacia arriba');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('Casi… inténtalo otra vez', { timeout: 15_000 });
  await expect(page.locator('.result .hint')).toContainText('Recorriste el');
  await expect(page.locator('.feedback')).toContainText('del camino');
});
