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
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

const teacher = (page: Page) => page.getByRole('region', { name: 'Tu profe' });

test('mantén una nota (Do): superado, el profe felicita y propone el siguiente', async ({ page }) => {
  await openExercise(page, 'Mantén una nota');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.phase')).toHaveText('♪ Escucha la guía…');
  await expect(page.locator('.phase .beat')).toHaveText(/[123]/, { timeout: 5_000 });
  await expect(page.locator('.phase')).toHaveText('¡Canta!', { timeout: 5_000 });
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 10_000 });
  await expect(page.getByRole('img', { name: /^[23] de 3 estrellas$/ })).toBeVisible();
  await expect(teacher(page).getByRole('heading')).toHaveText(/^¡(Excelente|Superado)!$/);
  await expect(page.locator('.notes-table')).toHaveCount(0);

  await teacher(page).getByRole('button', { name: 'Siguiente: Mantén una nota larga →' }).click();
  await expect(page.getByRole('heading', { name: 'Mantén una nota larga', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '▶ Empezar' })).toBeVisible();
});

test('do-re-mi cantando solo un Do: el profe pide seguir la melodía y lo demuestra', async ({ page }) => {
  await openExercise(page, 'Do-re-mi');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('Casi… inténtalo otra vez', { timeout: 15_000 });
  await expect(page.locator('.note-chips li')).toHaveCount(5);
  await expect(teacher(page).getByRole('heading')).toHaveText('Sigue la melodía');
  await expect(teacher(page)).not.toContainText(/\d+ c\b/);

  const demo = teacher(page).getByRole('button', { name: '🔊 Escúchalo' });
  await demo.click();
  await expect(teacher(page).getByRole('button', { name: '♪ Sonando…' })).toBeDisabled();
  await expect(demo).toBeEnabled({ timeout: 10_000 });
});

test('otra octava: el profe lo detecta y permite cambiar el ajuste', async ({ page }) => {
  // Rango grave (G2–F3) y octava exacta: el ejercicio pide Do3 y el micro canta Do4.
  await openExercise(page, 'Mantén una nota', { range: { lowMidi: 43, highMidi: 53 }, octaveMode: 'exact' });
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(teacher(page).getByRole('heading')).toHaveText('Las notas están bien, pero en otra altura', { timeout: 15_000 });
  await teacher(page).getByRole('button', { name: 'Permitir cantar en otra octava' }).click();
  await expect(teacher(page)).toContainText('Listo: ahora vale cantar en otra octava');

  await page.getByRole('button', { name: 'Repetir' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 15_000 });
});

test('con detalles técnicos: ejercicio transpuesto, tabla por nota y cifras', async ({ page }) => {
  await openExercise(page, 'Do-re-mi', { showDetails: true });
  // Rango G3–F4: el ejercicio (0, 2, 4 semitonos) se centra → tónica A#3.
  await expect(page.getByRole('group', { name: 'Altura del ejercicio' }).locator('output')).toHaveText('A#3');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.notes-table tbody tr')).toHaveCount(5, { timeout: 15_000 });
  await expect(page.locator('.notes-table tbody')).toContainText('Alta');
  await expect(page.locator('.result-head .hint')).toContainText('puntuación');
});

test('sirena con la voz quieta: el profe pide llegar más lejos', async ({ page }) => {
  await openExercise(page, 'Sirena hacia arriba');
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('Casi… inténtalo otra vez', { timeout: 15_000 });
  await expect(page.locator('.result-head .hint')).toContainText('Recorriste el');
  await expect(teacher(page).getByRole('heading')).toHaveText('Llega un poco más lejos');
});
