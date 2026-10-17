// Scanner QR interne (Î14) : QR d'un autre livre de la maison (autre adresse, même identifiant de scène que ce livre) :
// refusé (décision de David du 17/10, option c), le scan continue. Caméra simulée par Chromium (voir `scanner-helpers.ts`).
import { expect, test } from '@playwright/test';
import { fullscreenElement } from './scene-helpers';
import { CHROMIUM_ONLY, fakeCamera, installAtMenu, liveTracks, progress, qrVideo } from './scanner-helpers';

test.skip(({ browserName }) => browserName !== 'chromium', CHROMIUM_ONLY);

test.use(fakeCamera(qrVideo('foreign', 'https://dinos-tome2.editions-liger.com/s/trex')));

test('message « pas une page de ce livre », le scan continue ; caméra coupée puis Réessayer ; Fermer et Échap coupent la caméra', async ({ page }) => {
  await installAtMenu(page);
  await page.getByTestId('scanner-button').click();
  const dialog = page.getByRole('dialog', { name: 'Scanne le QR code' });
  await expect(dialog.getByTestId('scanner-status')).toHaveText('Ce QR code n\'est pas une page de ce livre.', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('#/');
  expect(await liveTracks(page)).toBe(1);

  // Caméra coupée par le système pendant le scan (événement `ended`) : message et Réessayer, qui relance le scan
  await page.evaluate(() =>
    (window as unknown as { __glbiStreams: MediaStream[] }).__glbiStreams[0].getVideoTracks()[0].dispatchEvent(new Event('ended')),
  );
  await expect(dialog.getByTestId('scanner-status')).toHaveText('Impossible d\'ouvrir la caméra.');
  expect(await liveTracks(page)).toBe(0);
  await dialog.getByRole('button', { name: 'Réessayer' }).click();
  await expect(dialog.getByTestId('scanner-status')).toHaveText('Ce QR code n\'est pas une page de ce livre.', { timeout: 30_000 });
  expect(await liveTracks(page)).toBe(1);
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByTestId('scanner-dialog')).toHaveCount(0);
  expect(await liveTracks(page)).toBe(0);

  // Échap ferme la fenêtre, hors plein écran (en plein écran, le premier Échap revient au navigateur, Î12)
  await page.getByTestId('scanner-button').click();
  await expect(dialog.getByTestId('scanner-status')).toHaveText('Ce QR code n\'est pas une page de ce livre.', { timeout: 30_000 });
  await page.evaluate(() => document.exitFullscreen().catch(() => {}));
  await expect.poll(() => fullscreenElement(page)).toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('scanner-dialog')).toHaveCount(0);
  expect(await liveTracks(page)).toBe(0);
  expect(await progress(page)).toBeNull();
});
