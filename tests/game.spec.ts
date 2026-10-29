// Mini-jeu (MJ1, spec-mini-jeu.md §2, §11) sur le livre de test installé (`unlockThreshold` 3) : case du menu verrouillée
// puis débloquée ; `#/jeu` verrouillé : écran de blocage sans chunk du jeu ni fichier de `game/` (requêtes observées) ;
// débloqué : écran d'attente du moteur (MJ2) qui lit `game/game.json`, hors ligne compris ; fichiers du jeu dans
// `book.json.files`. Déblocage pur, QR `/jeu` et clés de stockage : aussi dans `npm run test:engine`.
import { expect, test } from '@playwright/test';
import { GAME_KEY, SERVER, gameChunks, installAtMenu, recordGameRequests, setCollected } from './game-helpers';

test('menu : case « Mini-jeu » en fin de menu, verrouillée (cartes à gagner) puis débloquée à 3 scènes collected', async ({ page }) => {
  await installAtMenu(page);
  const locked = page.getByTestId('game-tile-locked');
  await expect(locked).toContainText('Mini-jeu');
  await expect(locked).toContainText(/Encore 3 cartes à gagner pour débloquer le jeu\s!/);
  // Après la liste des scènes, hors d'elle (la liste garde ses cinq scènes).
  await expect(page.getByTestId('collection').locator('li')).toHaveCount(5);
  await setCollected(page, ['trex', 'raptor']);
  await page.reload();
  await expect(page.getByTestId('game-tile-locked')).toContainText(/Encore 1 carte à gagner pour débloquer le jeu\s!/);
  await setCollected(page, ['trex', 'raptor', 'duo']);
  await page.reload();
  const tile = page.getByTestId('game-tile');
  await expect(tile).toHaveText('Mini-jeu');
  await expect(tile).toHaveAttribute('href', '#/jeu');
  await expect(page.getByTestId('game-tile-locked')).toHaveCount(0);
});

test('#/jeu verrouillé (QR /jeu) : écran de blocage, sans chunk du jeu ni fichier de game/', async ({ page }) => {
  await installAtMenu(page);
  await setCollected(page, ['trex']);
  const requests = recordGameRequests(page);
  // Arrivée par le QR du jeu : stub jeu/index.html → #/jeu.
  await page.goto(`${SERVER}/jeu/`);
  await expect(page.getByTestId('game-blocked')).toHaveText(/Encore 2 cartes à gagner\s!/, { timeout: 20_000 });
  expect(await page.evaluate(() => location.hash)).toBe('#/jeu');
  await expect(page.getByTestId('blocked-title')).toHaveText(/Pas encore\s!/);
  await expect(page.getByTestId('game-entry')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
  await page.getByRole('link', { name: 'Retour au menu' }).click();
  await expect(page.getByTestId('collection')).toBeVisible();
});

test('#/jeu débloqué : chunk du jeu chargé, game/game.json lu (titre, consigne), meilleur score, hors ligne', async ({ page, context }) => {
  await installAtMenu(page);
  // Fichiers du jeu dans le livre téléchargé.
  const index = (await (await page.request.get(`${SERVER}/book.json`)).json()) as { files: { path: string }[] };
  const files = index.files.map((f) => f.path);
  for (const f of ['game/game.json', 'game/arena.glb', 'game/dino.glb', 'game/compso.glb', 'jeu/index.html', 'sounds/jeu_capture.wav', ...gameChunks()]) expect(files).toContain(f);
  await setCollected(page, ['trex', 'raptor', 'ptero']);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ best: 7 })), GAME_KEY);
  await page.reload();
  const requests = recordGameRequests(page);
  await page.getByTestId('game-tile').click();
  await expect(page.getByTestId('game-title')).toHaveText('La grande chasse', { timeout: 20_000 });
  await expect(page.getByTestId('game-instructions')).toContainText('Attrape un maximum de compsognathes');
  await expect(page.getByTestId('game-placeholder')).toHaveText('Le jeu arrive dans une prochaine version du livre.');
  await expect(page.getByTestId('game-best')).toHaveText(/Ton meilleur score\s: 7/);
  expect(requests.some((u) => u.endsWith('/game/game.json'))).toBe(true);
  expect(requests.some((u) => u.includes('/_next/'))).toBe(true);
  // Langue : textes du jeu dans la langue choisie.
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByTestId('game-title')).toHaveText('The great hunt');
  await page.getByRole('button', { name: 'Français' }).click();
  // Hors ligne : rechargement servi par le service worker.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('game-title')).toHaveText('La grande chasse', { timeout: 20_000 });
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Retour au menu' }).click();
  await expect(page.getByTestId('collection')).toBeVisible();
});
