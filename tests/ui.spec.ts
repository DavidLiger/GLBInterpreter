// Interface du lecteur (Î12) sur le livre de test installé : `out/` construit depuis `books/test-dino`
// (`npm run book:test-source && npm run build -- --source books/test-dino --part-mib 1`).
// Boutons d'animation (cibles, `aria-pressed`, clavier), fenêtre Informations (`<dialog>` modal, Échap, focus, crédits),
// écrans d'installation (`<dialog>` non modal), langues FR/EN/ES de bout en bout, `lang` et `<title>`, 404 et stubs,
// téléphone (indice de rotation, zones sûres, barre d'actions sans recouvrement).
// `UI_SHOTS=<dossier>` : captures d'écran des étapes (relecture visuelle).
import { unlockAllScenes } from './progress-helpers';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SERVER = 'http://localhost:4173';

// Î13 : scènes débloquées (ni quiz ni écran de blocage) ; la progression elle-même est testée dans progress.spec.ts.
test.beforeEach(async ({ page }) => {
  await unlockAllScenes(page);
});
const shots = process.env.UI_SHOTS;

async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: `${shots}/${test.info().project.name}-${name}.png` });
}

const installHeading = (page: Page) => page.getByRole('heading', { name: /Installer le livre|Install the book|Instalar el libro/ });

async function install(page: Page, scene = 'trex') {
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/#/s/${scene}`);
  await expect(installHeading(page)).toBeVisible({ timeout: 20_000 });
}

async function installAndStart(page: Page, scene = 'trex'): Promise<Locator> {
  await install(page, scene);
  await page.getByRole('button', { name: /^(Installer|Install|Instalar)$/ }).click();
  await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
  const start = page.getByRole('button', { name: /pour commencer|to start|para comenzar/i });
  await expect(start).toBeVisible({ timeout: 30_000 });
  await shot(page, 'loader');
  await start.click();
  const bar = page.getByTestId('action-buttons');
  await expect(bar).toBeVisible({ timeout: 10_000 });
  return bar;
}

/** Taille de mise en page (sans les transformations : l'ouverture d'un dialogue l'anime de 0,96 à 1). */
async function layoutSize(l: Locator) {
  return l.evaluate((el) => ({ width: (el as HTMLElement).offsetWidth, height: (el as HTMLElement).offsetHeight }));
}

/** Le démarrage met le lecteur en plein écran : en sortir (sinon le premier Échap est gardé par le navigateur). */
async function leaveFullscreen(page: Page) {
  const isFs = () => page.evaluate(() => !!(document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement));
  if (!(await isFs())) return;
  await page.evaluate(() => document.exitFullscreen?.().catch(() => undefined));
  await page.waitForTimeout(300);
  // WebKit de Playwright : la sortie par l'API peut rester sans effet ; Échap, comme un lecteur, en sort.
  if (await isFs()) await page.keyboard.press('Escape');
  await expect.poll(isFs).toBe(false);
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('boutons d’animation : groupe nommé, cibles de 44 px, aria-pressed, clavier', async ({ page }) => {
  const bar = await installAndStart(page);
  await expect(page.getByRole('group', { name: 'Animations' })).toBeVisible();
  const buttons = bar.getByRole('button');
  await expect(buttons).toHaveCount(3);
  for (const b of await buttons.all()) {
    const r = await box(b);
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    await expect(b).toHaveAttribute('aria-pressed', 'false');
  }
  // Clavier : Entrée lance l'action, annoncée par aria-pressed, puis retour au repos
  const walk = page.getByRole('button', { name: 'Marcher' });
  await walk.focus();
  await page.keyboard.press('Enter');
  await expect(walk).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'action-active');
  await expect(walk).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 });
  // Espace sur un autre bouton
  const roar = page.getByRole('button', { name: 'Rugir' });
  await roar.focus();
  await page.keyboard.press('Space');
  await expect(roar).toHaveAttribute('aria-pressed', 'true');
  // Autres boutons du lecteur : 44 px
  // (volume : absent si le navigateur de test n'a pas d'audio, cas du WebKit de Playwright sous Windows)
  const volume = page.getByTestId('volume-button');
  for (const b of [page.getByTestId('info-button'), ...((await volume.count()) ? [volume] : [])]) {
    const r = await box(b);
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
});

test('fenêtre Informations : dialogue modal, Échap, fond, fermer, focus rendu ; crédits complets', async ({ page }) => {
  await installAndStart(page);
  await leaveFullscreen(page);
  const infoButton = page.getByTestId('info-button');
  await infoButton.click();
  const dialog = page.getByRole('dialog', { name: 'Informations' });
  await expect(dialog).toBeVisible();
  // Focus dans la fenêtre ; le reste de la page est inerte
  expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
  expect(await page.evaluate(() => document.querySelector('dialog:modal') !== null)).toBe(true);
  // Crédits : modèles (src_* du GLB), sons, images, mention légale et année du livre
  const credits = dialog.getByTestId('info-credits');
  await expect(credits.getByRole('heading', { name: 'Modèles 3D' })).toBeVisible();
  await expect(credits).toContainText('Dinosaure de test — GLBInterpreter (licence CC0)');
  await expect(credits).toContainText('https://example.org/dino-test');
  await expect(credits.getByRole('heading', { name: 'Sons' })).toBeVisible();
  await expect(credits).toContainText('Jungle (test) — GLBInterpreter (licence CC0)');
  await expect(credits.getByRole('heading', { name: 'Images' })).toBeVisible();
  await expect(credits).toContainText('Icône marcher (test) — GLBInterpreter (licence CC-BY 4.0)');
  await expect(dialog.getByTestId('info-legal')).toHaveText('Dinos de test — © Éditions Liger 2026');
  // Aide limitée à la scène v1 : pas de lieux ni de sous-titres
  await expect(dialog).not.toContainText('icônes des lieux');
  await expect(dialog).toContainText('boutons du bas');
  await shot(page, 'info');
  // Échap ferme, focus rendu au bouton
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Focus rendu au bouton : vérifié dans Chromium. Le WebKit de Playwright sous Windows ne le donne pas, même rendu par
  // la primitive (Linux : oui) ; reporté à Î16, à vérifier sur Safari iOS réel.
  if (test.info().project.name === 'chromium') await expect(infoButton).toBeFocused();
  // Bouton Fermer (44 px)
  await infoButton.click();
  const close = dialog.getByRole('button', { name: 'Fermer' });
  const r = await layoutSize(close);
  expect(r.width).toBeGreaterThanOrEqual(44);
  expect(r.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(dialog).toBeHidden();
  // Clic sur le fond
  await infoButton.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, (page.viewportSize()?.height ?? 600) - 5);
  await expect(dialog).toBeHidden();
});

test('écran d’installation : dialogue nommé par son titre, focus sur le titre, Échap sans effet', async ({ page }) => {
  await install(page);
  const gate = page.getByRole('dialog', { name: 'Installer le livre' });
  await expect(gate).toBeVisible();
  await expect(installHeading(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(gate).toBeVisible();
  // 44 px pour le bouton principal et le sélecteur de langue
  for (const b of [page.getByRole('button', { name: 'Installer', exact: true }), page.getByRole('button', { name: 'English' })]) {
    const r = await box(b);
    expect(r.height).toBeGreaterThanOrEqual(44);
  }
  await shot(page, 'install');
});

test('langues FR, EN, ES de bout en bout : installation, scène, boutons, crédits, accueil, scène introuvable, lang et titre', async ({ page }) => {
  await install(page);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await expect(page).toHaveTitle('Dinos de test');

  // Anglais choisi sur l'écran d'installation
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Install the book' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await expect(page).toHaveTitle('Test dinos');
  await page.getByRole('button', { name: 'Install', exact: true }).click();
  await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
  await expect(page.getByRole('heading', { name: 'Tyrannosaurus' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /to start/ }).click();
  await expect(page.getByTestId('action-buttons').getByRole('button')).toHaveText(['Walk', 'Roar', 'Eat']);
  await expect(page.getByRole('group', { name: 'Animations' })).toBeVisible();
  await page.getByRole('button', { name: 'Information' }).click();
  const dialog = page.getByRole('dialog', { name: 'Information' });
  await expect(dialog.getByRole('heading', { name: '3D models' })).toBeVisible();
  await expect(dialog).toContainText('(license CC0)');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

  // Espagnol depuis la fenêtre Informations : tout le lecteur suit
  await leaveFullscreen(page);
  await dialog.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByRole('dialog', { name: 'Información' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Información' }).getByRole('heading', { name: 'Modelos 3D' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('action-buttons').getByRole('button')).toHaveText(['Caminar', 'Rugir', 'Comer']);
  await expect(page.getByRole('group', { name: 'Animaciones' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('es');
  await expect(page).toHaveTitle('Dinos de prueba');
  await shot(page, 'scene-es');

  // Langue gardée au rechargement ; menu de collection (Î13) et scène introuvable traduits
  await page.goto(`${SERVER}/#/`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dinos de prueba' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('collection-count')).toHaveText('Mi colección · 3 de 3 descubiertas');
  await expect(page.getByRole('link', { name: 'Tiranosaurio' })).toBeVisible();
  await page.goto(`${SERVER}/#/s/inconnue`);
  await expect(page.getByRole('heading', { name: 'Escena no encontrada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
  // Retour au français
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Scène introuvable' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
});

test('404 en trois langues ; stubs et index dans la langue et au titre du livre', async ({ page }) => {
  const notFound = await (await page.request.get(`${SERVER}/404.html`)).text();
  expect(notFound).toMatch(/<html lang="fr"/);
  expect(notFound).toContain('<title>Dinos de test</title>');
  for (const [l, title] of [['fr', 'Page introuvable'], ['en', 'Page not found'], ['es', 'Página no encontrada']]) {
    expect(notFound).toMatch(new RegExp(`<section lang="${l}"[^>]*>.*?${title}`));
  }
  const stub = await (await page.request.get(`${SERVER}/s/trex/`)).text();
  expect(stub).toMatch(/<html lang="fr">/);
  expect(stub).toContain('<title>Dinos de test</title>');
  const index = await (await page.request.get(`${SERVER}/`)).text();
  expect(index).toMatch(/<html lang="fr"/);
  expect(index.match(/<title>/g)?.length).toBe(1);
  expect(index).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/);
});

test.describe('téléphone Android', () => {
  test.use({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });

  test('indice de rotation après « Toucher pour commencer », fermé au toucher ; barre d’actions sans recouvrement', async ({ page }) => {
    await install(page);
    await page.getByRole('button', { name: 'Installer', exact: true }).tap();
    await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
    const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
    const start = page.getByRole('button', { name: 'Toucher pour commencer' });
    await expect(start).toBeVisible({ timeout: 30_000 });
    // Pas d'indice sous l'écran de chargement
    await expect(page.getByTestId('rotate-hint')).toHaveCount(0);
    await shot(page, 'phone-loader');
    await start.tap();
    const hint = page.getByTestId('rotate-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Tourner le téléphone');
    await shot(page, 'phone-portrait');
    await hint.tap();
    await expect(hint).toBeHidden();

    // Portrait : barre d'actions au-dessus des contrôles du coin
    const bar = page.getByTestId('action-buttons');
    await expect(bar).toBeVisible();
    const corner = [page.getByTestId('info-button'), page.getByTestId('volume-button'), page.getByTestId('fullscreen-button')];
    const present: Locator[] = [];
    for (const c of corner) if (await c.count()) present.push(c);
    for (const b of await bar.getByRole('button').all()) {
      for (const c of present) expect(overlap(await box(b), await box(c))).toBe(false);
    }
    // Paysage : même règle ; l'indice ne revient pas. Le démarrage a mis le lecteur en plein écran : en sortir pour
    // que l'émulation puisse changer la taille de la fenêtre (sur un téléphone, la rotation se fait en plein écran).
    await leaveFullscreen(page);
    await page.setViewportSize({ width: 915, height: 412 });
    await page.waitForTimeout(300);
    await shot(page, 'phone-landscape');
    for (const b of await bar.getByRole('button').all()) {
      const r = await box(b);
      expect(r.y + r.height).toBeLessThanOrEqual(412);
      for (const c of present) expect(overlap(r, await box(c))).toBe(false);
    }
    await leaveFullscreen(page);
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(300);
    await expect(page.getByTestId('rotate-hint')).toHaveCount(0);
  });
});
