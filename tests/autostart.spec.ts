// Démarrage automatique d'une scène v1 (Î13bis) sur le livre de test installé : `out/` construit depuis `books/test-dino`
// (`npm run book:test-source && npm run build -- --source books/test-dino --part-mib 1`).
// Plus d'écran « Cliquer / Toucher pour commencer » : chargeur rond, lancement à la fin du chargement ; plein écran de la
// page demandé au clic du menu ; retour d'arrière-plan : lecteur remonté sur place, un seul remontage automatique par
// période de 30 s, puis l'écran « Scène en pause » dont le bouton remonte le lecteur sans recharger la page.
// Le son au clic du menu, au « Passer » du quiz et au premier geste après une arrivée directe : audio.spec.ts, progress.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { unlockAllScenes } from './progress-helpers';
import { fullscreenElement, sceneLaunched, simulateBackground } from './scene-helpers';

const SERVER = 'http://localhost:4173';

test.beforeEach(async ({ page }) => {
  await unlockAllScenes(page);
});

async function installToMenu(page: Page) {
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/#/`);
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Installer$/ }).click();
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeHidden({ timeout: 120_000 });
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 3 sur 3 découvertes', { timeout: 20_000 });
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
}

test('menu → carte : chargeur rond, scène lancée sans écran de démarrage, plein écran de la page, « Scène prête »', async ({ page }) => {
  await installToMenu(page);
  await page.getByRole('link', { name: 'Vélociraptor' }).click();
  // Chargeur rond : barre de progression nommée, image de la scène (sinon icône du livre)
  const loader = page.getByTestId('round-loader');
  const seen = await loader.waitFor({ timeout: 10_000 }).then(() => true, () => false);
  if (seen) {
    await expect(page.getByRole('progressbar', { name: 'Chargement de la scène' })).toBeAttached();
  }
  await sceneLaunched(page);
  await expect(page.getByTestId('scene-ready')).toHaveText('Scène prête');
  // Le clic de la carte a donné à la page le droit de jouer du son : pas de pastille
  await expect(page.getByTestId('sound-hint')).toHaveCount(0);
  // Plein écran de la page entière, demandé dans le clic ; le bouton du lecteur le reflète et en sort
  if (test.info().project.name === 'chromium') {
    await expect.poll(() => fullscreenElement(page)).toBe('html');
    const fs = page.getByTestId('fullscreen-button');
    await expect(fs).toHaveAttribute('aria-pressed', 'true');
    await fs.click();
    await expect.poll(() => fullscreenElement(page)).toBeNull();
    await expect(fs).toHaveAttribute('aria-pressed', 'false');
    await fs.click();
    await expect.poll(() => fullscreenElement(page)).toBe('html');
    // Retour au menu : toujours en plein écran (même page)
    await page.getByRole('button', { name: 'Retour au menu' }).click();
    await expect(page.getByTestId('collection-count')).toBeVisible();
    expect(await fullscreenElement(page)).toBe('html');
  }
});

test('retour d’arrière-plan : lecteur remonté sur place ; second retour en moins de 30 s : « Scène en pause », relance sans rechargement', async ({ page }) => {
  await installToMenu(page);
  await page.getByRole('link', { name: 'Tyrannosaure' }).click();
  const bar = await sceneLaunched(page);
  await bar.locator('[data-action-id="walk"]').click();
  // Témoin : un rechargement de page l'effacerait
  await page.evaluate(() => ((window as Window & { __sameDocument?: boolean }).__sameDocument = true));
  const canvasBefore = await page.locator('canvas').elementHandle();

  // Premier retour : remontage automatique (nouveau canvas, scène relancée seule), pas d'écran de relance
  await simulateBackground(page);
  await expect(page.getByTestId('restart-button')).toHaveCount(0);
  await sceneLaunched(page);
  await expect(page.getByTestId('restart-button')).toHaveCount(0);
  expect(await canvasBefore!.evaluate((c) => c.isConnected), 'ancien canvas libéré').toBe(false);
  expect(await page.evaluate(() => (window as Window & { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  await expect(page.getByTestId('action-buttons').getByRole('button')).toHaveText(['Marcher', 'Rugir', 'Manger']);

  // Second retour moins de 30 s après : la garde arrête le remontage automatique
  await simulateBackground(page);
  const restart = page.getByTestId('restart-button');
  await expect(restart).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Scène en pause' })).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(restart, 'pas de remontage automatique en boucle').toBeVisible();
  // Le bouton remonte le lecteur, sans recharger la page
  await restart.click();
  await sceneLaunched(page);
  expect(await page.evaluate(() => (window as Window & { __sameDocument?: boolean }).__sameDocument)).toBe(true);
});
