// Cartes de collection (CC1, spec-carte-collection.md §2, §3, §11) sur le livre de test installé : `out/` construit depuis
// `books/test-dino` ; « trex » (carte la plus chargée : sous-titre, illustration, 4 caractéristiques, 250 caractères en
// espagnol) et « raptor » (sans illustration ni sous-titre, « régime » sans valeur) ont une carte ; « ptero » et « duo » non.
// Règles pures (bandeau une seule fois, compte, cartes gagnées) : aussi dans `npm run test:engine`.
// Captures de la carte (voir ui.spec.ts) : `UI_SHOTS=<dossier> npx playwright test tests/card.spec.ts`.
import { expect, test, type Page } from '@playwright/test';
import { BOOK_SCENES, PROGRESS_KEY } from './progress-helpers';
import { sceneLaunched } from './scene-helpers';

const SERVER = 'http://localhost:4173';
const shots = process.env.UI_SHOTS;

/** Progression posée une seule fois (pas à chaque chargement, pour que `collected` survive au rechargement). */
async function startWith(page: Page, collected: Record<string, boolean> = {}) {
  const value = JSON.stringify({ unlockedScenes: BOOK_SCENES, quizPassed: { trex: true, ptero: true }, collected });
  await page.addInitScript(
    ([key, v]) => {
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, v);
      } catch {
        /* page sans stockage (about:blank) */
      }
    },
    [PROGRESS_KEY, value] as const,
  );
}

async function install(page: Page, hash: string) {
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/${hash}`);
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Installer$/ }).click();
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeHidden({ timeout: 120_000 });
}

const needWebGL = async (page: Page) => {
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
};

const collected = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').collected, PROGRESS_KEY);

test('scène à carte : bandeau à la première action, puis bouton « Carte » ; rechargement sans bandeau ; ptero sans carte', async ({ page }) => {
  await startWith(page);
  await install(page, '#/s/trex');
  await needWebGL(page);
  const bar = await sceneLaunched(page);
  await expect(page.getByTestId('card-button')).toHaveCount(0);
  await expect(page.getByTestId('new-card')).toHaveCount(0);

  // Première action : `collected` passe à vrai, bandeau (au-dessus de la barre) et bouton dans le coin bas gauche
  await bar.locator('[data-action-id="walk"]').click();
  const banner = page.getByTestId('new-card');
  await expect(banner).toHaveText('Nouvelle carte !');
  await expect(page.getByRole('button', { name: 'Carte', exact: true })).toBeVisible();
  const b = (await banner.boundingBox())!;
  const r = (await bar.boundingBox())!;
  expect(b.y + b.height, 'bandeau au-dessus des boutons d’animation').toBeLessThanOrEqual(r.y + 1);
  const btn = (await page.getByTestId('card-button').boundingBox())!;
  expect(btn.width).toBeGreaterThanOrEqual(44);
  expect(btn.height).toBeGreaterThanOrEqual(44);
  expect(await collected(page)).toEqual({ trex: true });
  // Deuxième action : pas de second bandeau ; un toucher sur le bandeau ouvre la carte, l'animation continue
  await bar.locator('[data-action-id="roar"]').click();
  await expect(banner).toHaveCount(1);
  await banner.click();
  const dialog = page.getByRole('dialog', { name: 'Carte : Tyrannosaure' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(dialog).toBeHidden();
  await expect(banner).toHaveCount(0);

  // Bandeau de 5 s : rechargement, une action sans bandeau (nouveauté non enregistrée), bouton présent d'emblée
  await page.reload();
  await sceneLaunched(page);
  await expect(page.getByTestId('card-button')).toBeVisible();
  await page.getByTestId('action-buttons').locator('[data-action-id="eat"]').click();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('new-card')).toHaveCount(0);

  // Scène sans carte : ni bandeau, ni bouton ; `collected` écrit quand même
  await page.goto(`${SERVER}/#/s/ptero`);
  await sceneLaunched(page);
  await page.getByTestId('action-buttons').locator('[data-action-id="walk"]').click();
  await expect.poll(() => collected(page)).toEqual({ trex: true, ptero: true });
  await page.waitForTimeout(500);
  await expect(page.getByTestId('new-card')).toHaveCount(0);
  await expect(page.getByTestId('card-button')).toHaveCount(0);

  // Le bandeau disparaît seul après 5 s
  await page.goto(`${SERVER}/#/s/raptor`);
  await sceneLaunched(page);
  await page.getByTestId('action-buttons').locator('[data-action-id="roar"]').click();
  await expect(page.getByTestId('new-card')).toBeVisible();
  await expect(page.getByTestId('new-card')).toBeHidden({ timeout: 7_000 });
  await expect(page.getByTestId('card-button')).toBeVisible();
});

test('menu : compte, mention de la carte à gagner, « Voir la carte », précédente et suivante parmi les cartes gagnées', async ({ page }) => {
  await startWith(page, { raptor: true, ptero: true });
  await install(page, '#/');
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 1 carte sur 2', { timeout: 20_000 });
  const rows = page.getByTestId('collection').getByRole('listitem');
  // trex (carte à gagner) : mention ; raptor (gagnée) : bouton ; ptero et duo (sans carte) : ni l'un ni l'autre
  await expect(rows.nth(0).getByTestId('card-to-earn')).toHaveText('Fais bouger la scène pour gagner sa carte !');
  await expect(rows.nth(0).getByTestId('card-view')).toHaveCount(0);
  await expect(rows.nth(1).getByTestId('card-view')).toHaveText('Voir la carte');
  await expect(rows.nth(1).getByTestId('card-to-earn')).toHaveCount(0);
  for (const i of [2, 3]) {
    await expect(rows.nth(i).getByTestId('card-view')).toHaveCount(0);
    await expect(rows.nth(i).getByTestId('card-to-earn')).toHaveCount(0);
  }
  await expect(page.getByRole('link', { name: 'Tyrannosaure' })).toBeVisible();
  const v = (await rows.nth(1).getByTestId('card-view').boundingBox())!;
  expect(v.height).toBeGreaterThanOrEqual(44);

  // Une seule carte gagnée : ni précédente ni suivante
  await page.getByRole('button', { name: 'Voir la carte : Vélociraptor' }).click();
  let dialog = page.getByTestId('card-dialog');
  await expect(dialog.getByTestId('card-title')).toHaveText('Vélociraptor');
  await expect(dialog.getByTestId('card-number')).toHaveText('n° 2 / 4');
  await expect(dialog.getByTestId('card-previous')).toHaveCount(0);
  // « régime » sans valeur : « — » ; pas de sous-titre ; illustration = image de chargement
  await expect(dialog.getByTestId('card-fields').locator('dd')).toHaveText(['2 mètres', '15 kg', 'Crétacé', '—']);
  await expect(dialog.getByTestId('card-subtitle')).toHaveCount(0);
  await expect(dialog.getByTestId('card-image')).toHaveAttribute('src', 'images/raptor-preview.png');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Deux cartes gagnées : précédente et suivante, dans l'ordre du livre
  await page.evaluate((k) => {
    const v = JSON.parse(localStorage.getItem(k)!);
    v.collected.trex = true;
    localStorage.setItem(k, JSON.stringify(v));
  }, PROGRESS_KEY);
  await page.reload();
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 2 cartes sur 2', { timeout: 20_000 });
  await expect(page.getByTestId('card-to-earn')).toHaveCount(0);
  await page.getByRole('button', { name: 'Voir la carte : Tyrannosaure' }).click();
  dialog = page.getByTestId('card-dialog');
  await expect(dialog.getByTestId('card-title')).toHaveText('Tyrannosaure');
  if (test.info().project.name === 'chromium') await expect(dialog.getByRole('button', { name: 'Fermer' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Suivante' }).click();
  await expect(dialog.getByTestId('card-title')).toHaveText('Vélociraptor');
  await expect(page.getByRole('dialog', { name: 'Carte : Vélociraptor' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Précédente' }).click();
  await expect(dialog.getByTestId('card-title')).toHaveText('Tyrannosaure');
  await dialog.getByRole('button', { name: 'Précédente' }).click();
  await expect(dialog.getByTestId('card-title')).toHaveText('Vélociraptor');
  // Toucher le fond : fermée
  await page.mouse.click(4, 4);
  await expect(dialog).toBeHidden();
  // Clé et valeur de progression inchangées
  expect(Object.keys(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), PROGRESS_KEY)).sort()).toEqual(['collected', 'quizPassed', 'unlockedScenes']);
});

test('carte dans les trois langues ; la plus chargée sur un écran de 375 × 667 : rien ne déborde', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await startWith(page, { trex: true });
  await install(page, '#/');
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 1 carte sur 2', { timeout: 20_000 });
  const expected = {
    Français: { open: 'Voir la carte : Tyrannosaure', name: 'Carte : Tyrannosaure', number: 'n° 1 / 4', subtitle: 'T. rex · il y a 68 millions d’années', labels: ['Taille', 'Poids', 'Époque', 'Régime'], values: ['12 à 13 mètres', '8 à 9 tonnes', 'Fin du Crétacé', 'Carnivore'], text: /^Le tyrannosaure vivait/, foot: 'Dinos de test', close: 'Fermer' },
    English: { open: 'See the card: Tyrannosaurus', name: 'Card: Tyrannosaurus', number: 'No. 1 / 4', subtitle: 'T. rex · 68 million years ago', labels: ['Length', 'Weight', 'Period', 'Diet'], values: ['12 to 13 metres', '8 to 9 tonnes', 'Late Cretaceous', 'Carnivore'], text: /^The tyrannosaurus lived/, foot: 'Test dinos', close: 'Close' },
    Español: { open: 'Ver la carta: Tiranosaurio', name: 'Carta: Tiranosaurio', number: 'N.º 1 / 4', subtitle: 'T. rex · hace 68 millones de años', labels: ['Longitud', 'Peso', 'Época', 'Dieta'], values: ['12 a 13 metros', '8 a 9 toneladas', 'Cretácico tardío', 'Carnívoro'], text: /^El tiranosaurio vivió/, foot: 'Dinos de prueba', close: 'Cerrar' },
  } as const;
  for (const [lang, e] of Object.entries(expected)) {
    await page.getByRole('button', { name: lang, exact: true }).click();
    await page.getByRole('button', { name: e.open }).click();
    const dialog = page.getByRole('dialog', { name: e.name });
    await expect(dialog).toBeVisible();
    const card = dialog.getByTestId('collection-card');
    await expect(card.getByTestId('card-title')).toHaveText(e.name.split(/\s?:\s/)[1]);
    await expect(card.getByTestId('card-number')).toHaveText(e.number);
    await expect(card.getByTestId('card-subtitle')).toHaveText(e.subtitle);
    await expect(card.locator('dt')).toHaveText([...e.labels]);
    await expect(card.locator('dd')).toHaveText([...e.values]);
    await expect(card.getByTestId('card-text')).toHaveText(e.text);
    await expect(card.locator('footer')).toHaveText(e.foot);
    await expect.poll(() => card.getByTestId('card-image').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(900);
    // Rien ne déborde : carte entière dans l'écran, textes entiers (ni coupés ni tronqués), boutons dans l'écran
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    expect(box.y + box.height).toBeLessThanOrEqual(667);
    expect(box.width, 'échelle 1 sur l’iPhone SE en portrait (à 3 % près)').toBeGreaterThan(350 * 0.97);
    const overflow = await card.evaluate((c) =>
      [...c.querySelectorAll('h2, .glbi-card-number, .glbi-card-subtitle, dt, dd, .glbi-card-text, footer')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
        .map((el) => `${el.className || el.tagName} : ${el.textContent}`),
    );
    expect(overflow, 'textes qui débordent').toEqual([]);
    const close = (await dialog.getByRole('button', { name: e.close }).boundingBox())!;
    expect(close.y + close.height).toBeLessThanOrEqual(667);
    if (shots) {
      await page.waitForTimeout(400); // fin de l'animation d'ouverture
      await page.screenshot({ path: `${shots}/${test.info().project.name}-carte-375x667-${lang}.png` });
    }
    await dialog.getByRole('button', { name: e.close }).click();
    await expect(dialog).toBeHidden();
  }
});
