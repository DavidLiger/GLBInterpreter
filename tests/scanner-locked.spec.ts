// Scanner QR interne (Î14) : QR d'une scène du livre pas encore accessible (ptero, troisième scène) → écran de blocage.
// Caméra simulée par Chromium (voir `scanner-helpers.ts`).
import { expect, test } from '@playwright/test';
import { CHROMIUM_ONLY, ORIGIN, fakeCamera, installAtMenu, liveTracks, qrVideo } from './scanner-helpers';

test.skip(({ browserName }) => browserName !== 'chromium', CHROMIUM_ONLY);

test.use(fakeCamera(qrVideo('ptero', `${ORIGIN}/s/ptero/`)));

test('écran de blocage, sans quiz ni lecteur', async ({ page }) => {
  await installAtMenu(page);
  await page.getByTestId('scanner-button').click();
  await expect(page.getByTestId('blocked-title')).toHaveText('Pas encore !', { timeout: 30_000 });
  expect(await page.evaluate(() => location.hash)).toBe('#/s/ptero');
  await expect(page.getByTestId('quiz')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await liveTracks(page)).toBe(0);
});
