// Scanner QR interne (Î14), sur le livre de test installé (`out/` construit depuis `books/test-dino` avec --part-mib 1 :
// trex (quiz) → raptor (sans quiz) → ptero (quiz)). Caméra simulée par Chromium, qui montre le QR de trex (adresse du
// livre). Autres QR : `scanner-locked.spec.ts` (scène non accessible), `scanner-foreign.spec.ts` (autre livre).
// Règle de lecture d'un QR (adresse du livre, miroir, autre livre) : aussi dans `npm run test:engine`.
import { expect, test } from '@playwright/test';
import { fullscreenElement } from './scene-helpers';
import { CHROMIUM_ONLY, ORIGIN, fakeCamera, installAtMenu, liveTracks, progress, qrVideo } from './scanner-helpers';

test.skip(({ browserName }) => browserName !== 'chromium', CHROMIUM_ONLY);

test.use(fakeCamera(qrVideo('trex', `${ORIGIN}/s/trex`)));

test('menu sans découverte : bouton au-dessus de la liste ; hors ligne, plein écran, QR de trex → quiz, caméra coupée', async ({ page, context }) => {
  await installAtMenu(page);
  await expect(page.getByTestId('collection-hint')).toHaveText('Pour commencer, scanne le QR code de la première page du livre !');
  const button = page.getByRole('button', { name: 'Scanner un QR code' });
  await expect(button).toBeVisible();
  const b = (await button.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.y + b.height).toBeLessThanOrEqual((await page.getByTestId('collection').boundingBox())!.y);
  expect(b.y).toBeGreaterThan((await page.getByTestId('collection-hint').boundingBox())!.y);

  // Hors ligne : le chunk du scanner vient du service worker (livre installé)
  await context.setOffline(true);
  const chunk = page.waitForResponse((r) => /\/_next\/static\/chunks\/.+\.js$/.test(r.url()) && r.request().resourceType() === 'script');
  await button.click();
  expect((await chunk).fromServiceWorker()).toBe(true);
  await expect.poll(() => fullscreenElement(page)).toBe('html');

  // QR lu : navigation immédiate par goToScene → scène accessible avec quiz
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => location.hash)).toBe('#/s/trex');
  await expect(page.getByTestId('scanner-dialog')).toHaveCount(0);
  expect(await liveTracks(page)).toBe(0);
  expect(await progress(page)).toBeNull(); // quiz pas encore réussi : rien d'écrit
  await context.setOffline(false);
});

test('permission refusée : message et Réessayer ; réautorisée : le scan reprend et ouvre la scène', async ({ page }) => {
  await installAtMenu(page);
  await page.evaluate(() => ((window as unknown as { __glbiDeny: boolean }).__glbiDeny = true));
  await page.getByTestId('scanner-button').click();
  const dialog = page.getByRole('dialog', { name: 'Scanne le QR code' });
  await expect(dialog.getByTestId('scanner-status')).toHaveText(
    'La caméra n\'est pas autorisée. Autorise-la dans les réglages du navigateur, puis réessaie.',
  );
  await expect(dialog.getByTestId('scanner-video')).toBeHidden();
  await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __glbiDeny: boolean }).__glbiDeny = false));
  await dialog.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 30_000 });
  expect(await liveTracks(page)).toBe(0);
});

test('contexte non sécurisé : message, pas de Réessayer ; Fermer rend le focus au bouton', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { configurable: true, get: () => false }));
  await installAtMenu(page);
  const button = page.getByTestId('scanner-button');
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Scanne le QR code' });
  await expect(dialog.getByTestId('scanner-status')).toHaveText('La caméra ne fonctionne qu\'à une adresse sécurisée (https).');
  await expect(dialog.getByTestId('scanner-retry')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByTestId('scanner-dialog')).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __glbiStreams: MediaStream[] }).__glbiStreams.length)).toBe(0);
});
