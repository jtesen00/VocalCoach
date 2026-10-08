import { expect, test, type Route } from '@playwright/test';

/**
 * Cuenta opcional y sincronización (Fase 6) con la API simulada: registro, subida de un
 * intento hecho en este dispositivo, bajada de otro hecho en "otro dispositivo" y cierre de sesión.
 * (La API real se prueba en api/tests/VocalCoach.IntegrationTests.)
 */
test('cuenta: registro, sincronización en ambos sentidos y cerrar sesión', async ({ page }) => {
  test.setTimeout(60_000);
  const uploaded: { id: string; itemId: string; details: string | null }[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const remote = {
    id: '11111111-2222-4333-8444-555555555555',
    kind: 'exercise',
    itemId: 'scale-major',
    performedAtUtc: new Date(Date.now() - 3600_000).toISOString(),
    localDay: today,
    score: 95,
    accuracy: 0.95,
    passed: true,
    durationSeconds: 12,
    details: null,
    receivedAtUtc: new Date(Date.now() - 3000_000).toISOString(),
  };
  const auth = {
    accessToken: 'token-de-prueba',
    accessTokenExpiresAtUtc: new Date(Date.now() + 3600_000).toISOString(),
    refreshToken: 'refresh-de-prueba',
    user: { id: 'u1', email: 'ana@prueba.com', displayName: 'Ana' },
  };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });
  let pulled = false;
  await page.route('**/api/identity/register', (r) => json(r, auth));
  await page.route('**/api/identity/logout', (r) => r.fulfill({ status: 204 }));
  await page.route('**/api/practice/attempts/sync', async (r) => {
    expect(r.request().headers().authorization).toBe('Bearer token-de-prueba');
    const body = JSON.parse(r.request().postData()!);
    uploaded.push(...body.attempts);
    await json(r, { accepted: body.attempts.length, alreadySynced: 0, rejected: [] });
  });
  await page.route('**/api/practice/attempts?**', async (r) => {
    // Primera vez: el intento del otro dispositivo; después, nada nuevo.
    const first = !pulled;
    pulled = true;
    await json(r, { attempts: first ? [remote] : [], next: null });
  });

  await page.addInitScript(() => localStorage.setItem('vocalcoach.settings.v1', JSON.stringify({ range: { lowMidi: 55, highMidi: 65 } })));
  await page.goto('/');
  await page.getByRole('button', { name: 'Activar micrófono' }).click();

  // Un intento antes de tener cuenta.
  await page.getByRole('button', { name: 'Practicar Mantén una nota', exact: true }).click();
  await page.getByRole('button', { name: '▶ Empezar' }).click();
  await expect(page.locator('.result-verdict')).toHaveText('¡Superado!', { timeout: 15_000 });

  await page.getByRole('button', { name: 'Ajustes' }).click();
  const account = page.getByRole('group', { name: 'Tu cuenta (opcional)' });
  await account.getByRole('button', { name: '¿No tienes cuenta? Crear una' }).click();
  await account.getByLabel('Tu nombre').fill('Ana');
  await account.getByLabel('Email').fill('ana@prueba.com');
  await account.getByLabel('Contraseña').fill('contraseña-segura');
  await account.getByRole('button', { name: 'Crear cuenta' }).click();

  const mine = page.getByRole('group', { name: 'Tu cuenta' });
  await expect(mine).toContainText('Ana');
  await expect(mine.getByRole('status')).toContainText('Todo sincronizado', { timeout: 10_000 });
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0].itemId).toBe('sustained-3s');
  expect(JSON.parse(uploaded[0].details!).kind).toBe('sustained'); // evaluación para el profe en otros dispositivos

  // El intento del otro dispositivo aparece en Progreso.
  await page.getByRole('button', { name: 'Progreso' }).click();
  await expect(page.locator('.best-list li')).toHaveCount(2);
  await expect(page.locator('.best-list')).toContainText('Escala completa');

  await page.getByRole('button', { name: 'Ajustes' }).click();
  await mine.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('group', { name: 'Tu cuenta (opcional)' })).toBeVisible();
});
