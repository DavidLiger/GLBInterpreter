// Moteur du mini-jeu (MJ2, spec-mini-jeu.md §3, §4, §11) sur le jeu synthétique du livre de test installé : partie
// raccourcie (durée de test), capture par un bond au clavier, fin au chrono, meilleur score enregistré ; pause en
// arrière-plan puis « Continuer » ; réglages des commandes (côté et taille appliqués, gardés après rechargement et par
// « Effacer ma collection ») et joystick tactile ; dix entrées et sorties sans contexte WebGL perdu.
// Options de partie posées avant le chargement (`window.__glbiGameTest`, lues par le moteur à chaque partie) ; état lu par
// `window.__glbiGame.state()`. Rapier sous Node (comportements, états des proies, manette) : `npm run test:engine`.
import { expect, test, type Page } from '@playwright/test';
import { installAtMenu, setCollected, GAME_KEY } from './game-helpers';
import { simulateBackground } from './scene-helpers';

const CONTROLS_KEY = 'glbinterpreter:controls:test-dino';

type State = { phase: string; score: number; remaining: number; steps: number; frames: number; bondReady: boolean; player: { x: number; z: number; clip: string } | null };
const state = (page: Page) => page.evaluate(() => (window as unknown as { __glbiGame?: { state: () => State } }).__glbiGame?.state() ?? null);

/** Livre installé, jeu débloqué, options de partie posées ; ouvre l'écran de consigne du jeu. */
async function openGame(page: Page, opts: Record<string, unknown>) {
  await page.addInitScript((o) => {
    (window as unknown as { __glbiGameTest: unknown }).__glbiGameTest = o;
  }, opts);
  await installAtMenu(page);
  await setCollected(page, ['trex', 'raptor', 'ptero']);
  await page.reload();
  await page.getByTestId('game-tile').click();
  await expect(page.getByTestId('game-intro')).toBeVisible({ timeout: 30_000 });
}

test('partie raccourcie : Jouer, capture par un bond au clavier, fin au chrono, meilleur score enregistré, Rejouer', async ({ page }) => {
  // Proies immobiles, la première posée à 2,5 m devant le joueur (haut de l'écran = −Z) ; partie de 4 s.
  await openGame(page, { duration: 4, preysStill: true, preyAt: [0, -2.5] });
  await expect(page.getByTestId('game-title')).toHaveText('La grande chasse');
  await expect(page.getByTestId('game-keys')).toContainText('Espace');
  await page.getByTestId('game-play').click();
  await expect(page.getByTestId('game-view')).toHaveAttribute('data-phase', 'playing');
  await expect(page.getByTestId('game-score')).toHaveText('0');
  // Flèche du haut maintenue (direction du bond), Espace = Bond.
  await page.keyboard.down('ArrowUp');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page))?.score ?? 0, { timeout: 15_000 }).toBe(1);
  await page.keyboard.up('ArrowUp');
  await expect(page.getByTestId('game-score')).toHaveText('1');
  // Mesures de la partie lisibles depuis la console (essais sur téléphone) : pas physique mesuré, pixelRatio du rendu.
  const s = (await page.evaluate(() => (window as unknown as { __glbiGame: { state: () => { perf: { stepMs: number }; pixelRatio: number } } }).__glbiGame.state()))!;
  expect(s.perf.stepMs).toBeGreaterThan(0);
  expect(s.pixelRatio).toBeGreaterThan(0);
  // Fin au chrono : écran « Bravo ! », score, nouveau record, meilleur score enregistré à part.
  await expect(page.getByTestId('game-end')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('game-end-title')).toHaveText(/Bravo\s!/);
  await expect(page.getByTestId('game-final-score')).toHaveText(/Score\s: 1/);
  await expect(page.getByTestId('game-record')).toHaveText(/Nouveau record\s!/);
  expect(await page.evaluate((k) => localStorage.getItem(k), GAME_KEY)).toBe('{"best":1}');
  // Rejouer : nouvelle partie, score remis à zéro.
  await page.getByTestId('game-replay').click();
  await expect(page.getByTestId('game-view')).toHaveAttribute('data-phase', 'playing');
  await expect(page.getByTestId('game-score')).toHaveText('0');
  await expect(page.getByTestId('game-end')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('game-best')).toHaveText(/Ton meilleur score\s: 1/);
  await page.getByTestId('game-back').click();
  await expect(page.getByTestId('collection')).toBeVisible();
});

test('pause en arrière-plan : partie figée, écran « Continuer », reprise', async ({ page }) => {
  await openGame(page, { duration: 300 });
  await page.getByTestId('game-play').click();
  await expect.poll(async () => (await state(page))?.steps ?? 0, { timeout: 15_000 }).toBeGreaterThan(30);
  await simulateBackground(page);
  await expect(page.getByTestId('game-paused')).toBeVisible();
  const frozen = (await state(page))!;
  expect(frozen.phase).toBe('paused');
  await page.waitForTimeout(600);
  expect((await state(page))!.steps).toBe(frozen.steps);
  await page.getByTestId('game-resume').click();
  await expect(page.getByTestId('game-view')).toHaveAttribute('data-phase', 'playing');
  await expect.poll(async () => (await state(page))!.steps, { timeout: 15_000 }).toBeGreaterThan(frozen.steps);
  // Échap : pause au clavier (DP-26), puis reprise par Échap.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('game-paused')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('game-view')).toHaveAttribute('data-phase', 'playing');
});

test('réglages des commandes : côté et taille appliqués, joystick tactile, gardés au rechargement et par « Effacer ma collection »', async ({ page }) => {
  await openGame(page, { duration: 300, preysStill: true });
  await expect(page.getByTestId('controls-side-right')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('controls-size-normal')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('controls-side-left').click();
  await page.getByTestId('controls-size-large').click();
  await expect(page.getByTestId('controls-side-left')).toHaveAttribute('aria-pressed', 'true');
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), CONTROLS_KEY))!)).toEqual({ side: 'left', size: 'large' });
  await page.getByTestId('game-play').click();
  const controls = page.getByTestId('game-controls');
  await expect(controls).toHaveAttribute('data-side', 'left');
  await expect(page.getByTestId('game-joystick-zone')).toHaveAttribute('data-zone', 'right');
  await expect(page.getByTestId('game-buttons')).toHaveAttribute('data-zone', 'left');
  expect((await page.getByTestId('game-button-0').boundingBox())!.width).toBe(88);
  // Joystick absolu dans la moitié droite (gaucher) : doigt posé, glissé vers le haut → le joueur va vers −Z.
  const box = (await controls.boundingBox())!;
  const z0 = (await state(page))!.player!.z;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6 - 70, { steps: 4 });
  await expect(page.getByTestId('game-joystick')).toBeVisible();
  await expect.poll(async () => (await state(page))!.player!.z, { timeout: 15_000 }).toBeLessThan(z0 - 1);
  await page.mouse.up();
  await expect(page.getByTestId('game-joystick')).toBeHidden();
  // Gardés après rechargement (écran de consigne).
  await page.reload();
  await expect(page.getByTestId('game-intro')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('controls-side-left')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('controls-size-large')).toHaveAttribute('aria-pressed', 'true');
  // « Effacer ma collection » ne touche pas aux réglages.
  await page.getByTestId('game-back').click();
  await page.getByRole('button', { name: 'Effacer ma collection' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Effacer', exact: true }).click();
  await expect(page.getByTestId('game-tile-locked')).toBeVisible();
  expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), CONTROLS_KEY))!)).toEqual({ side: 'left', size: 'large' });
});

test('dix entrées et sorties : jeu chargé à chaque fois, aucun contexte WebGL perdu ni en trop', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'mesure de libération : Chromium');
  const warnings: string[] = [];
  page.on('console', (m) => {
    const text = m.text();
    if (/WebGL|contexte WebGL perdu|CONTEXT_LOST/i.test(text)) warnings.push(text);
  });
  await openGame(page, {});
  await page.getByTestId('game-back').click();
  for (let i = 0; i < 10; i++) {
    await expect(page.getByTestId('collection')).toBeVisible();
    expect(await page.locator('canvas').count()).toBe(0);
    await page.getByTestId('game-tile').click();
    await expect(page.getByTestId('game-intro')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await state(page))?.frames ?? 0, { timeout: 15_000 }).toBeGreaterThan(2);
    await page.getByTestId('game-back').click();
  }
  await expect(page.getByTestId('collection')).toBeVisible();
  expect(await page.evaluate(() => 'window.__glbiGame' in window && (window as unknown as { __glbiGame?: unknown }).__glbiGame !== undefined)).toBe(false);
  expect(warnings).toEqual([]);
});
