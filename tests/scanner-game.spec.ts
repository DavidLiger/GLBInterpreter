// Scanner QR interne (Î14) et mini-jeu (MJ1) : QR du jeu (`<adresse imprimée>/jeu`, `dist/qr/<bookId>/jeu.svg`) lu par le
// scanner → `#/jeu` ; jeu verrouillé (rien de gagné) : écran de blocage. Caméra simulée par Chromium (`scanner-helpers.ts`).
import { expect, test } from '@playwright/test';
import { CHROMIUM_ONLY, ORIGIN, fakeCamera, installAtMenu, liveTracks, qrVideo } from './scanner-helpers';

test.skip(({ browserName }) => browserName !== 'chromium', CHROMIUM_ONLY);

test.use(fakeCamera(qrVideo('jeu', `${ORIGIN}/jeu`)));

test('QR /jeu : #/jeu, écran de blocage du jeu, caméra arrêtée', async ({ page }) => {
  await installAtMenu(page);
  await page.getByTestId('scanner-button').click();
  await expect(page.getByTestId('game-blocked')).toHaveText(/Encore 3 cartes à gagner\s!/, { timeout: 30_000 });
  expect(await page.evaluate(() => location.hash)).toBe('#/jeu');
  expect(await liveTracks(page)).toBe(0);
});
