// Progression du livre, quiz, menu de collection, écran de blocage (Î13, `spec-progression.md`), sur le livre de test
// installé : `out/` construit depuis `books/test-dino` (trex → raptor → ptero → duo ; quiz sur trex et ptero, raptor sans quiz).
// CC1 : trex et raptor ont une carte de collection : le compte du menu est celui des cartes gagnées (« n cartes sur 2 »).
// Règles de déblocage pures, valeur illisible et stockage indisponible : aussi dans `npm run test:engine`.
import { expect, test, type Page } from '@playwright/test';
import { PROGRESS_KEY } from './progress-helpers';
import { fullscreenElement, readerShown, sceneLaunched } from './scene-helpers';

const SERVER = 'http://localhost:4173';

const installHeading = (page: Page) => page.getByRole('heading', { name: /Installer le livre|Install the book|Instalar el libro/ });

/** Premier scan : installation du livre depuis le QR de `scene`, sans progression. */
async function install(page: Page, scene: string) {
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/#/s/${scene}`);
  await expect(installHeading(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^(Installer|Install|Instalar)$/ }).click();
  await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
}

const progress = (page: Page) =>
  page.evaluate((k) => {
    const v = localStorage.getItem(k);
    return v === null ? null : JSON.parse(v);
  }, PROGRESS_KEY);

const hasWebGL = (page: Page) => page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));


const choice = (page: Page, name: string) => page.getByTestId('quiz-choice').filter({ hasText: name });

test('premier lancement par le QR de la première scène : quiz, mauvaise puis bonne réponse, Passer, scène ; quiz non reposé', async ({ page }) => {
  await install(page, 'trex');
  // Quiz avant la scène, rien du lecteur derrière
  const quiz = page.getByTestId('quiz');
  await expect(quiz).toBeVisible({ timeout: 20_000 });
  await expect(quiz.getByRole('heading', { name: 'Tyrannosaure', exact: true })).toBeVisible();
  await expect(quiz.getByRole('heading', { name: 'Que mange le Tyrannosaure ?' })).toBeVisible();
  await expect(page.getByTestId('quiz-choice')).toHaveText(['De l’herbe', 'De la viande', 'Des cailloux']);
  for (const b of await page.getByTestId('quiz-choice').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('canvas')).toHaveCount(0);

  // Mauvaise réponse : « Essaie encore ! », réponse grisée et désactivée, on reste sur la question
  await choice(page, 'De l’herbe').click();
  await expect(page.getByTestId('quiz-feedback')).toHaveText('Essaie encore !');
  await expect(choice(page, 'De l’herbe')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('quiz-explanation')).toBeHidden();
  expect(await progress(page)).toBeNull();

  // Bonne réponse : progression écrite, explication dans une fenêtre modale, focus sur « Passer »
  await choice(page, 'De la viande').click();
  const dialog = page.getByRole('dialog', { name: 'Bravo !' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('C’est un carnivore.');
  // Focus vérifié dans Chromium seulement (WebKit de Playwright sous Windows : comportement des `<dialog>` différent, Î16)
  if (test.info().project.name === 'chromium') await expect(dialog.getByRole('button', { name: 'Passer' })).toBeFocused();
  expect(await progress(page)).toEqual({ unlockedScenes: ['trex'], quizPassed: { trex: true }, collected: {} });

  // « Passer » ouvre la scène ; Î13bis : plein écran de la page demandé dans ce clic (Chromium ; le WebKit de Playwright
  // sous Windows n'a pas toujours l'API)
  await dialog.getByRole('button', { name: 'Passer' }).click();
  await expect(page.getByTestId('quiz')).toHaveCount(0);
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  if (test.info().project.name === 'chromium') await expect.poll(() => fullscreenElement(page)).toBe('html');

  // Rechargement : scène débloquée, le quiz n'est pas reposé
  await page.reload();
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz')).toHaveCount(0);

  // Scène lancée : `collected` à la première action ; bouton Menu, pas de fil d'Ariane des POI sur une scène v1
  test.skip(!(await hasWebGL(page)), 'navigateur de test sans WebGL 2 : lecteur non monté');
  await sceneLaunched(page); // Î13bis : lancement automatique, sans écran de démarrage
  await page.getByTestId('action-buttons').getByRole('button', { name: 'Marcher' }).click();
  await expect.poll(async () => (await progress(page))?.collected).toEqual({ trex: true });
  await expect(page.getByRole('button', { name: /Tyranno/ })).toHaveCount(0);
  const back = page.getByRole('button', { name: 'Retour au menu' });
  await expect(back).toBeVisible();
  const r = (await back.boundingBox())!;
  expect(r.width).toBeGreaterThanOrEqual(44);
  expect(r.height).toBeGreaterThanOrEqual(44);
  await back.click();
  // CC1 : le livre de test a des cartes (trex, raptor) : compte des cartes gagnées ; une scène découverte
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 1 carte sur 2');
  await expect(page.getByTestId('collection-scene')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('QR d’une scène pas encore accessible : écran de blocage sans charger la scène, retour au menu ; déblocage dans l’ordre', async ({ page }) => {
  // Premier scan sur la troisième page du livre
  await install(page, 'ptero');
  const sceneRequests: string[] = [];
  page.on('request', (r) => {
    if (/\/scenes\/ptero\.(json|glb)$/.test(r.url())) sceneRequests.push(r.url());
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pas encore !' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Tu n\'as pas encore découvert cette page. Commence par la page précédente !')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByTestId('quiz')).toHaveCount(0);
  expect(sceneRequests, 'scène bloquée : ni scenes/ptero.json ni GLB demandés').toEqual([]);

  // Retour au menu : quatre scènes grisées, aucune ouverte
  await page.getByRole('link', { name: 'Retour au menu' }).click();
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 0 carte sur 2');
  await expect(page.getByTestId('collection-locked')).toHaveCount(4);
  await expect(page.getByTestId('collection-scene')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Page 3 : pas encore découverte' })).toBeVisible();
  // Rien de débloqué : consigne de commencer par la première page (Î13, demande de David après la batterie)
  await expect(page.getByTestId('collection-hint')).toHaveText('Pour commencer, scanne le QR code de la première page du livre !');

  // Deuxième page avant la première : bloquée aussi
  await page.goto(`${SERVER}/#/s/raptor`);
  await expect(page.getByRole('heading', { name: 'Pas encore !' })).toBeVisible();

  // Première page (quiz réussi), puis deuxième (sans quiz : débloquée à son ouverture), puis troisième (quiz)
  await page.goto(`${SERVER}/#/s/trex`);
  await choice(page, 'De la viande').click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  await page.goto(`${SERVER}/#/s/raptor`);
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz')).toHaveCount(0);
  await expect.poll(async () => (await progress(page))?.unlockedScenes).toEqual(['trex', 'raptor']);
  await page.goto(`${SERVER}/#/s/ptero`);
  await expect(page.getByTestId('quiz').getByRole('heading', { name: 'Ptéranodon', exact: true })).toBeVisible({ timeout: 20_000 });
  await choice(page, 'De la viande').click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  expect(await progress(page)).toEqual({ unlockedScenes: ['trex', 'raptor', 'ptero'], quizPassed: { trex: true, ptero: true }, collected: {} });
  // Quatrième page (« duo », AC1 : sans quiz, débloquée à son ouverture)
  await page.goto(`${SERVER}/#/s/duo`);
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz')).toHaveCount(0);
  await expect.poll(async () => (await progress(page))?.unlockedScenes).toEqual(['trex', 'raptor', 'ptero', 'duo']);

  // Menu à jour, dans l'ordre du livre, et conservé au rechargement
  await page.goto(`${SERVER}/#/`);
  await page.reload();
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 0 carte sur 2', { timeout: 20_000 });
  await expect(page.getByTestId('collection-scene')).toHaveText(['Tyrannosaure', 'Vélociraptor', 'Ptéranodon', 'La poursuite']);
  await expect(page.getByText('Trouve la page suivante')).toHaveCount(0);
});

test('menu de collection : carte débloquée qui ouvre la scène sans quiz, remise à zéro confirmée', async ({ page }) => {
  await install(page, 'trex');
  await choice(page, 'De la viande').click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });

  await page.goto(`${SERVER}/#/`);
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 0 carte sur 2');
  await expect(page.getByTestId('collection-scene')).toHaveText(['Tyrannosaure']);
  await expect(page.getByTestId('collection-hint')).toHaveText('Trouve la page suivante dans le livre et scanne son QR code !');
  await expect(page.getByTestId('collection-locked')).toHaveCount(3);
  for (const c of await page.getByTestId('collection').getByRole('listitem').all()) expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // Carte débloquée : la scène s'ouvre, sans quiz ; Î13bis : plein écran de la page demandé dans le clic (Chromium)
  if (test.info().project.name === 'chromium') {
    await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined));
    await expect.poll(() => fullscreenElement(page)).toBeNull();
  }
  await page.getByRole('link', { name: 'Tyrannosaure' }).click();
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz')).toHaveCount(0);
  if (test.info().project.name === 'chromium') await expect.poll(() => fullscreenElement(page)).toBe('html');

  // Remise à zéro : annulée puis confirmée
  await page.goto(`${SERVER}/#/`);
  const reset = page.getByRole('button', { name: 'Effacer ma collection' });
  // Au clavier : dans le WebKit de Playwright, le bandeau « nouvelle version » du service worker, fixé en bas de l'écran,
  // recouvre le bouton depuis que le menu a quatre scènes (AC1) et reçoit le clic de la souris.
  const pressReset = async () => {
    await reset.focus();
    await page.keyboard.press('Enter');
  };
  await pressReset();
  const dialog = page.getByRole('dialog', { name: 'Effacer ta collection ?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toBeHidden();
  expect((await progress(page))?.unlockedScenes).toEqual(['trex']);
  await pressReset();
  await page.getByRole('dialog', { name: 'Effacer ta collection ?' }).getByRole('button', { name: 'Effacer' }).click();
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 0 carte sur 2');
  await expect(page.getByTestId('collection-scene')).toHaveCount(0);
  expect(await progress(page)).toBeNull();
  await expect(page.getByTestId('collection-hint')).toHaveText('Pour commencer, scanne le QR code de la première page du livre !');
  await expect(page.getByRole('button', { name: 'Effacer ma collection' })).toHaveCount(0);
  // La première page repose son quiz
  await page.goto(`${SERVER}/#/s/trex`);
  await expect(page.getByTestId('quiz')).toBeVisible({ timeout: 20_000 });
});

test('valeur illisible et stockage plein : pas d’écran d’erreur, la lecture continue', async ({ page }) => {
  await install(page, 'trex');
  // Valeur illisible : vide, annoncée en console
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  await page.evaluate((k) => localStorage.setItem(k, '{pas du json'), PROGRESS_KEY);
  await page.goto(`${SERVER}/#/`);
  await page.reload();
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 0 carte sur 2', { timeout: 20_000 });
  await expect(page.getByTestId('collection-scene')).toHaveCount(0);
  expect(warnings.some((w) => /\[PROGRESSION\] valeur illisible/.test(w))).toBe(true);

  // Stockage plein : chaque écriture échoue ; la progression vaut pour la session (navigation sans rechargement)
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('quota', 'QuotaExceededError');
    };
  });
  await page.evaluate(() => {
    window.location.hash = '/s/trex';
  });
  await page.reload();
  await choice(page, 'De la viande').click();
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });
  expect(warnings.some((w) => /\[PROGRESSION\] écriture refusée .*mémoire/.test(w))).toBe(true);
  await page.evaluate(() => {
    window.location.hash = '/';
  });
  await expect(page.getByTestId('collection-count')).toHaveText('Ma collection · 0 carte sur 2');
  await expect(page.getByTestId('collection-scene')).toHaveText(['Tyrannosaure']);
  await expect(page.getByText(/Livre illisible|Scène introuvable/)).toHaveCount(0);
});

test('langues : quiz, blocage et menu en anglais et en espagnol', async ({ page }) => {
  await install(page, 'trex');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByTestId('quiz').getByRole('heading', { name: 'What does the Tyrannosaurus eat?' })).toBeVisible();
  await expect(page.getByTestId('quiz')).toContainText('Quick quiz');
  await choice(page, 'Grass').click();
  await expect(page.getByTestId('quiz-feedback')).toHaveText('Try again!');
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByTestId('quiz-feedback')).toHaveText('¡Inténtalo de nuevo!');
  await expect(page.getByTestId('quiz-choice')).toHaveText(['Hierba', 'Carne', 'Piedras']);
  await choice(page, 'Carne').click();
  const dialog = page.getByRole('dialog', { name: '¡Muy bien!' });
  await expect(dialog).toContainText('Es carnívoro.');
  await expect(dialog.getByRole('button', { name: 'Continuar' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(readerShown(page)).toBeVisible({ timeout: 30_000 });

  await page.goto(`${SERVER}/#/s/ptero`);
  await expect(page.getByRole('heading', { name: '¡Todavía no!' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Aún no has descubierto esta página. ¡Empieza por la página anterior!')).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Not yet!' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the menu' }).click();
  await expect(page.getByTestId('collection-count')).toHaveText('My collection · 0 cards of 2');
  await expect(page.getByRole('link', { name: 'Tyrannosaurus' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Page 2: not discovered yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Español' }).click();
  await expect(page.getByTestId('collection-count')).toHaveText('Mi colección · 0 cartas de 2');
  await expect(page.getByRole('button', { name: 'Borrar mi colección' })).toBeVisible();
});
