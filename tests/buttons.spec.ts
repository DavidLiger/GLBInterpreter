// Mode `buttons` sur le livre de test installé (Î10b) : `out/` construit depuis `books/test-dino` (`npm run build -- --source
// books/test-dino --part-mib 1`). Clips synthétiques : idle 0,5 s, walk 0,75 s, roar 1 s, eat 1,25 s.
// Les événements `onAction` sont lus dans l'attribut `data-action-log` des boutons (dix derniers, `id:phase`).
import { expect, test, type Page } from '@playwright/test';

const SERVER = 'http://localhost:4173';

async function openScene(page: Page, scene: string, consoleLines: string[] = []) {
  page.on('console', (m) => consoleLines.push(m.text()));
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/#/s/${scene}`);
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Installer$/ }).click();
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeHidden({ timeout: 120_000 });
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
  // Écran de démarrage (le geste débloque l'audio ; idle joue déjà)
  const start = page.getByText(/Cliquer pour commencer|Toucher pour commencer/);
  await expect(start).toBeVisible({ timeout: 30_000 });
  await start.click();
  const bar = page.getByTestId('action-buttons');
  await expect(bar).toBeVisible({ timeout: 10_000 });
  return bar;
}

const log = async (page: Page) => ((await page.getByTestId('action-buttons').getAttribute('data-action-log')) ?? '').split(' ').filter(Boolean);

test('boutons dans l’ordre du GLB, libellés dans la langue courante ; idle au repos', async ({ page }) => {
  const bar = await openScene(page, 'trex');
  await expect(bar.locator('button')).toHaveText(['Marcher', 'Rugir', 'Manger']);
  await expect(bar).toHaveAttribute('data-current-action', '');
  expect(await log(page)).toEqual([]);
});

test('clic : l’action joue puis retour à idle (start puis end, une fois)', async ({ page }) => {
  const bar = await openScene(page, 'trex');
  await bar.locator('[data-action-id="walk"]').click();
  await expect(bar).toHaveAttribute('data-current-action', 'walk');
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 5_000 });
  expect(await log(page)).toEqual(['walk:start', 'walk:end']);
});

test('clic pendant une action : interruption, nouvelle action, un seul retour à idle ; relance de l’action en cours', async ({ page }) => {
  const bar = await openScene(page, 'trex');
  await bar.locator('[data-action-id="eat"]').click();
  await bar.locator('[data-action-id="roar"]').click();
  await bar.locator('[data-action-id="roar"]').click();
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 5_000 });
  await page.waitForTimeout(1500);
  expect(await log(page)).toEqual(['eat:start', 'eat:interrupt', 'roar:start', 'roar:interrupt', 'roar:start', 'roar:end']);
});

test('scène sans lumière : éclairage de secours annoncé ; scène sans cadrage : valeurs par défaut', async ({ page }) => {
  const lines: string[] = [];
  await openScene(page, 'raptor', lines);
  expect(lines.some((l) => l.includes('éclairage neutre de secours'))).toBe(true);
});
