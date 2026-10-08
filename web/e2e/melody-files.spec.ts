import { expect, test, type Page } from '@playwright/test';

// El micrófono falso canta siempre C4 +5 c (con 0,5 s de silencio cada 3 s).
async function openSongs(page: Page) {
  await page.addInitScript(() => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Canciones', exact: true }).click();
}

// Canción original de prueba en UltraStar: dos líneas con letra, todas las notas en C4 (pitch 0).
const ULTRASTAR = [
  '#TITLE:Canción de prueba',
  '#ARTIST:Vocal Coach',
  '#BPM:240',
  '#GAP:500',
  ': 0 4 0 Can',
  ': 4 4 0 ta',
  ': 8 4 0  con',
  ': 12 8 0  mi~',
  ': 20 4 0 go',
  '- 28',
  ': 32 4 0 la',
  ': 36 4 0  lu',
  ': 40 8 0 na',
  'E',
].join('\n');

test('importar un UltraStar: melodía exacta con letra y cantar la canción entera con el original', async ({ page }) => {
  test.setTimeout(60_000);
  await openSongs(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'cancion.txt', mimeType: 'text/plain', buffer: Buffer.from(ULTRASTAR, 'utf-8') });
  await expect(page.getByLabel('Desde (minutos:segundos)')).toHaveCount(0); // con melodía no hay que elegir fragmento
  await page.getByLabel(/Uso este archivo solo para mi práctica personal/).check();
  await page.getByRole('button', { name: 'Importar melodía' }).click();

  await expect(page.getByRole('heading', { name: 'Canción de prueba' })).toBeVisible();
  await expect(page.getByText('Melodía exacta del archivo.')).toBeVisible();
  await expect(page.getByText(/Vocal Coach · importada por ti desde un archivo UltraStar/)).toBeVisible();
  const phrases = page.locator('.phrase-list li');
  await expect(phrases).toHaveCount(2);
  await expect(phrases.first()).toContainText('Canta con migo');
  await expect(phrases.nth(1)).toContainText('la luna');

  // Karaoke con la canción original (la pondría el usuario fuera de la app).
  await page.getByRole('button', { name: '🎤 Cantar la canción entera' }).click();
  await page.getByLabel(/Con la canción original/).check();
  const startBtn = page.getByRole('button', { name: '▶ Empezar' });
  await expect(startBtn).toBeDisabled(); // faltan los auriculares
  await page.getByLabel(/Llevo auriculares/).check();
  await startBtn.click();

  await expect(page.locator('.karaoke-line')).toContainText('Can');
  await expect(page.locator('.karaoke-line .now, .karaoke-line .sung').first()).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('canvas.timeline')).toBeVisible();
  await expect(page.locator('.karaoke-line')).toContainText('la', { timeout: 10_000 });

  await expect(page.locator('.karaoke-results li')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.locator('.result-verdict')).toHaveText(/superada|casi/i);
});

test('karaoke con la guía de la app (catálogo): cuenta atrás, letra y resultado por frase', async ({ page }) => {
  test.setTimeout(120_000);
  await openSongs(page);
  await page.getByRole('button', { name: 'Abrir Estrellita' }).click();
  await page.getByRole('button', { name: '🎤 Cantar la canción entera' }).click();
  await expect(page.getByLabel(/Con la canción original/)).toHaveCount(0); // en el catálogo no hay original
  await page.getByLabel(/Que suene la melodía/).uncheck();
  await page.getByLabel(/Llevo auriculares/).check();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.phase .beat')).toHaveText(/[123]/);
  await expect(page.locator('.karaoke-line')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: '■ Terminar' }).click();
  // Al terminar antes de tiempo se ve lo cantado hasta ahí (o se vuelve al inicio si no dio tiempo a ninguna frase).
  await expect(page.getByRole('button', { name: /Cantarla otra vez|▶ Empezar/ })).toBeVisible();
});

test('editar una canción importada: título, letra, dividir, deshacer y guardar', async ({ page }) => {
  test.setTimeout(60_000);
  await openSongs(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'cancion.txt', mimeType: 'text/plain', buffer: Buffer.from(ULTRASTAR, 'utf-8') });
  await page.getByLabel(/Uso este archivo solo para mi práctica personal/).check();
  await page.getByRole('button', { name: 'Importar melodía' }).click();
  await expect(page.getByRole('heading', { name: 'Canción de prueba' })).toBeVisible();

  await page.getByRole('button', { name: '✏️ Editar letra y frases' }).click();
  await page.getByLabel('Título').fill('Mi versión');
  await page.getByLabel('Letra de la frase 2').fill('la lu-na');
  await page.getByRole('button', { name: 'Dividir la frase 1' }).click();
  await expect(page.locator('.editor-list li')).toHaveCount(3);
  // La letra escrita antes de dividir se conserva.
  await expect(page.getByLabel('Letra de la frase 3')).toHaveValue('la luna');
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('.editor-list li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Unir la frase 1 con la siguiente' }).click();
  await expect(page.locator('.editor-list li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByRole('heading', { name: 'Mi versión' })).toBeVisible();
  const phrases = page.locator('.phrase-list li');
  await expect(phrases).toHaveCount(1);
  await expect(phrases.first()).toContainText('Canta con migo la luna');
  // Se guarda en el dispositivo.
  await page.reload();
  await page.getByRole('button', { name: 'Activar micrófono' }).click();
  await page.getByRole('button', { name: 'Canciones', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mi versión' })).toBeVisible();
});

test('editar: pegar la letra entera y corregir una nota suelta', async ({ page }) => {
  test.setTimeout(60_000);
  await openSongs(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'cancion.txt', mimeType: 'text/plain', buffer: Buffer.from(ULTRASTAR, 'utf-8') });
  await page.getByLabel(/Uso este archivo solo para mi práctica personal/).check();
  await page.getByRole('button', { name: 'Importar melodía' }).click();
  await page.getByRole('button', { name: '✏️ Editar letra y frases' }).click();

  // Sin guiones ni saltos de línea: se separan las sílabas y se reparten entre las 2 frases (5 y 3 notas).
  await page.getByRole('button', { name: '📋 Pegar la letra entera' }).click();
  await page.getByLabel('Letra de toda la canción').fill('Ven conmigo ahora sol de mar');
  await page.getByRole('button', { name: 'Repartir en las 2 frases' }).click();
  await expect(page.getByLabel('Letra de la frase 1')).toHaveValue('Ven conmigo ahora');
  await expect(page.getByLabel('Letra de la frase 2')).toHaveValue('sol de mar');

  // Nota suelta: la 2.ª de la frase 1 («con») un semitono más aguda.
  await page.getByRole('button', { name: 'Notas de la frase 1' }).click();
  await page.getByRole('button', { name: /^Nota 2: .*«con»/ }).click();
  await page.getByRole('button', { name: 'Más aguda ↑' }).click();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  const song = await page.evaluate(() => JSON.parse(localStorage.getItem('vocalcoach.imported.v1')!).songs[0]);
  const notes = song.sections.flatMap((s: { phrases: { notes: { midi: number; syllable: string }[] }[] }) => s.phrases)[0].notes;
  // 7 sílabas en 5 notas: sinalefa «go a» y las últimas juntas.
  expect(notes.map((n: { syllable: string }) => n.syllable)).toEqual(['Ven', 'con', 'mi', 'go a', 'ho ra']);
  expect(notes[1].midi).toBe(notes[0].midi + 1);
  await expect(page.locator('.phrase-list li').first()).toContainText('Ven conmigo ahora');
});
