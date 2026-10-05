import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

// El micrófono falso canta siempre C4 +5 c (con 0,5 s de silencio cada 3 s).
async function openSongs(page: Page, settings: object = { range: { lowMidi: 55, highMidi: 65 } }) {
  await page.addInitScript((s) => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify(s)), settings);
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Canciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Canciones', exact: true })).toBeVisible();
}

test('canción → versión recomendada → frase → problema principal → entrenamiento', async ({ page }) => {
  await openSongs(page);
  await page.getByRole('button', { name: 'Abrir Luz de puerto' }).click();

  // Voz G3–F4 frente a una canción A3–E5: se recomienda un tono más grave.
  await expect(page.getByText('Tu versión recomendada')).toBeVisible();
  await expect(page.locator('.version-card')).toContainText('notas que hoy te quedan altas');
  await expect(page.getByRole('button', { name: /Practicar versión recomendada/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.warnings')).toContainText('Estribillo');
  await expect(page.getByText('Dificultad para ti')).toBeVisible();
  await expect(page.getByRole('img', { name: /^Notas agudas: [1-5] de 5$/ })).toBeVisible();

  await page.getByRole('button', { name: 'Practicar frase 8' }).click();
  await expect(page.getByRole('heading', { name: '«tu luz me devuelve a mí»' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.phase')).toHaveText('¡Canta!', { timeout: 15_000 });
  await expect(page.locator('.song-cue')).not.toBeEmpty();
  await expect(page.locator('.phrase-score strong')).toHaveText(/^\d+ %$/, { timeout: 20_000 });
  await expect(page.getByText('Problema principal')).toBeVisible();

  await page.getByRole('button', { name: 'Entrenar esta frase' }).click();
  await expect(page.getByRole('region', { name: 'Entrenamiento de la frase' })).toBeVisible();
  await expect(page.locator('.training-steps li')).not.toHaveCount(0);
  await expect(page.locator('.training-steps li').last()).toContainText('La frase, a velocidad normal');
  await expect(page.getByRole('button', { name: '▶ Empezar' })).toBeVisible();

});

test('progreso de la canción: la frase cantada queda puntuada y señalada como la más débil', async ({ page }) => {
  await openSongs(page);
  await page.getByRole('button', { name: 'Abrir Luz de puerto' }).click();
  await page.getByRole('button', { name: 'Practicar frase 8' }).click();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.phrase-score strong')).toBeVisible({ timeout: 25_000 });
  await page.getByRole('button', { name: '← Volver a la canción' }).click();
  await expect(page.locator('.phrase-list li').nth(7)).toContainText('%');
  await expect(page.getByText('Tu frase más débil')).toBeVisible();
  await expect(page.locator('.weak-card')).toContainText('Frase 8');
});

test('importar un audio: se extrae la melodía y se puede practicar', async ({ page }) => {
  await openSongs(page);
  await page.locator('input[type=file]').setInputFiles(resolve(import.meta.dirname, '.fixtures/melodia-prueba.wav'));
  const analyze = page.getByRole('button', { name: 'Analizar melodía' });
  await expect(analyze).toBeDisabled(); // falta aceptar el uso personal
  await page.getByLabel(/Uso este audio solo para mi práctica personal/).check();
  await analyze.click();

  await expect(page.getByRole('heading', { name: 'melodia prueba' })).toBeVisible({ timeout: 20_000 });
  // Dos fragmentos separados por una respiración corta: una sola línea, como en un karaoke.
  await expect(page.locator('.phrase-list li')).toHaveCount(1);
  await expect(page.locator('.phrase-list li').first()).toContainText('0:00 – 0:05');
  await expect(page.locator('.phrase-list li').first()).toContainText('8 notas');
  await expect(page.getByText('Importada por ti')).toBeVisible();

  await page.getByRole('button', { name: '← Todas las canciones' }).click();
  await expect(page.getByRole('button', { name: 'Abrir melodia prueba' })).toBeVisible();
  await page.getByRole('button', { name: 'Borrar melodia prueba' }).click();
  await expect(page.getByRole('button', { name: 'Abrir melodia prueba' })).toHaveCount(0);
});

test('importar una canción completa (voz + instrumentos, estéreo): frases correctas y se pueden escuchar', async ({ page }) => {
  await openSongs(page);
  await page.locator('input[type=file]').setInputFiles(resolve(import.meta.dirname, '.fixtures/cancion-completa.wav'));
  await page.getByLabel(/Uso este audio solo para mi práctica personal/).check();
  await page.getByRole('button', { name: 'Analizar melodía' }).click();

  await expect(page.getByRole('heading', { name: 'cancion completa' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Calidad de la extracción: buena.')).toBeVisible();
  // La canción tiene dos frases de 7 notas (estrofa y estribillo), con instrumentos alrededor.
  await expect(page.locator('.phrase-list li')).toHaveCount(2);
  await expect(page.locator('.phrase-list li').first()).toContainText('7 notas');
  await expect(page.locator('.phrase-list li').nth(1)).toContainText('7 notas');

  // Se puede escuchar cada frase y toda la melodía, y parar.
  const listen = page.locator('.phrase-list li').first().getByRole('button', { name: '▶' });
  await listen.click();
  await expect(page.locator('.phrase-list li').first().getByRole('button', { name: '■' })).toBeVisible();
  await page.getByRole('button', { name: '▶ Escuchar toda la melodía' }).click();
  await page.getByRole('button', { name: '■ Parar' }).click();
  await expect(page.getByRole('button', { name: '▶ Escuchar toda la melodía' })).toBeVisible();
});

test('sonido de la guía: elegir instrumento, probarlo y oír acordes sin errores de audio', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openSongs(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  for (const name of ['Voz «uuh»', 'Silbido', 'Flauta', 'Cuerdas', 'Piano']) {
    await page.getByLabel(name, { exact: false }).check();
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: '▶ Probar sonido' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Canciones', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Estrellita' }).click();
  await page.getByRole('button', { name: '▶ Escuchar toda la melodía' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: '■ Parar' }).click();
  expect(errors).toEqual([]);
});
