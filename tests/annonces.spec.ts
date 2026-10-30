// Annonces des nouveaux livres (AN1, spec-annonces.md §4, §5, §11) sur le livre de test installé. `out/` doit être construit
// avec GLBI_ANNONCES_TEST=1 (clés de test compilées, flux lu sur le port 4175 du même hôte) :
//   npm run book:test-source && GLBI_ANNONCES_TEST=1 npm run build -- --source books/test-dino --part-mib 1
// Le flux est servi par `tests/static-server.ts --annonces 4175` (playwright.config.ts) ; scénario choisi par
// `/__annonces?scenario=…`, requêtes reçues par `/__annonces/stats`. Règles pures (signature, dates, liens, bornes, choix,
// délai) : `npm run test:engine`. Le premier test tourne dans les deux navigateurs (WebCrypto ECDSA de WebKit), les autres
// dans Chromium seulement (rien de propre à WebKit ; Safari se revoit au jalon iPhone).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Request } from '@playwright/test';
import { installAtMenu, setCollected, SERVER } from './game-helpers';

const KEY = 'glbinterpreter:annonces';
const FEED = /:4175\/v1\//;

test.beforeAll(() => {
  const built = fs.readdirSync(path.resolve('out/_next/static/chunks'), { recursive: true }).some((f) => {
    const p = path.resolve('out/_next/static/chunks', String(f));
    return p.endsWith('.js') && fs.readFileSync(p, 'utf8').includes('glbi-annonces-test');
  });
  if (!built) throw new Error('out/ construit sans GLBI_ANNONCES_TEST=1 : relancer GLBI_ANNONCES_TEST=1 npm run build -- --source books/test-dino --part-mib 1');
});

/** Requêtes de la page vers le flux d'annonces (vues par le navigateur, réseau coupé compris). */
function feedRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r: Request) => {
    if (FEED.test(r.url())) seen.push(new URL(r.url()).pathname);
  });
  return seen;
}

const stats = async (page: Page) =>
  (await (await page.request.get(`${SERVER}/__annonces/stats`)).json()) as { feed: number; image: number; headers: Record<string, string> | null };
const scenario = (page: Page, s: string) => page.request.get(`${SERVER}/__annonces?scenario=${s}`);

/** État des annonces posé (réglage activé, lecture due), puis menu rechargé. */
async function enableAndOpenMenu(page: Page, extra: Record<string, unknown> = {}) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ enabled: true, seen: [], ...extra })] as const);
  // Même adresse que la page : `goto` ne recharge pas (hash inchangé) ; rechargement explicite.
  if (new URL(page.url()).hash === '#/') await page.reload();
  else await page.goto(`${SERVER}/#/`);
  await expect(page.getByTestId('collection')).toBeVisible({ timeout: 20_000 });
}
const state = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), KEY) as Promise<{ enabled?: boolean; lastCheck?: string; seen: string[] } | null>;
/** Lecture terminée (date retenue), puis une demi-seconde pour un éventuel affichage. */
async function checkDone(page: Page, timeout = 15_000) {
  await expect.poll(async () => (await state(page))?.lastCheck ?? null, { timeout }).not.toBeNull();
  await page.waitForTimeout(500);
}
/** Lecture due de nouveau (7 jours passés), annonces vues gardées. */
const forgetLastCheck = (page: Page) =>
  page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k) ?? '{}');
    delete s.lastCheck;
    localStorage.setItem(k, JSON.stringify(s));
  }, KEY);

test('réglage désactivé par défaut : aucune requête (installation, menu, scène) ; activé dans Informations : annonce dans le menu, une seule fois', async ({ page }) => {
  const requests = feedRequests(page);
  await installAtMenu(page);
  await setCollected(page, ['trex']);
  await page.goto(`${SERVER}/#/s/trex`);
  await expect(page.getByTestId('info-button')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  expect(requests, 'aucune requête, réglage désactivé').toEqual([]);
  expect((await stats(page)).feed).toBe(0);

  // Réglage dans la fenêtre Informations de la scène : désactivé, puis activé.
  await page.getByTestId('info-button').click();
  const sw = page.getByTestId('annonces-switch');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('annonces-setting')).toContainText('annonces.editions-liger.com');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('info-close').click();
  await page.waitForTimeout(500);
  expect(requests, 'aucune lecture pendant une scène').toEqual([]);

  // Retour au menu : lecture du flux, fenêtre « Pour les parents ».
  await page.goto(`${SERVER}/#/`);
  const dialog = page.getByTestId('annonce-dialog');
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole('heading', { name: 'Pour les parents' })).toBeVisible();
  await expect(page.getByTestId('annonce-title')).toHaveText('Le livre des volcans (test)');
  await expect(page.getByTestId('annonce-image')).toBeVisible();
  expect(await page.getByTestId('annonce-image').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(600);
  const st = await stats(page);
  expect(st.feed).toBe(1);
  expect(st.image).toBe(1);
  expect(st.headers?.cookie).toBeUndefined();
  expect(st.headers?.referer).toBeUndefined();
  expect((await state(page))?.seen).toEqual(['annonce-test-1']);

  await page.getByTestId('annonce-close').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('collection')).toBeVisible();
  // Rechargé : lecture faite il y a moins de 7 jours, rien de demandé ni d'affiché.
  await page.reload();
  await expect(page.getByTestId('collection')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(dialog).toBeHidden();
  expect((await stats(page)).feed).toBe(1);
});

test.describe('Chromium', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium seulement (WebCrypto de WebKit couvert par le premier test)');

  test('« Voir le livre » : relâché avant 3 s, rien ; maintenu 3 s, ouvert hors de l’app (noopener)', async ({ page, context }) => {
    await context.route('https://www.editions-liger.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>page du livre</p>' }));
    await installAtMenu(page);
    await enableAndOpenMenu(page);
    const see = page.getByTestId('annonce-see');
    await expect(see).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('annonce-hint')).toHaveText('Maintenez 3 secondes pour ouvrir (réservé aux parents)');
    expect(await see.getAttribute('href')).toBeNull();

    let popups = 0;
    context.on('page', () => popups++);
    const box = (await see.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
    await page.waitForTimeout(500);
    expect(popups, 'relâché après 1,5 s').toBe(0);
    await expect(see).toHaveAttribute('data-armed', '0');

    await page.mouse.down();
    await expect(see).toHaveAttribute('data-armed', '1', { timeout: 4000 });
    await expect(page.getByTestId('annonce-hint')).toHaveText('Relâchez pour ouvrir');
    const popupP = context.waitForEvent('page');
    await page.mouse.up();
    const popup = await popupP;
    await popup.waitForLoadState();
    expect(popup.url()).toBe('https://www.editions-liger.com/');
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await popup.close();
    await expect(page.getByTestId('annonce-dialog')).toBeVisible();
  });

  test('annonces vues une seule fois, la plus récente d’abord ; « Ne plus afficher » désactive le réglage', async ({ page }) => {
    await installAtMenu(page);
    await scenario(page, 'deux');
    await enableAndOpenMenu(page);
    await expect(page.getByTestId('annonce-title')).toHaveText('Second livre (test)', { timeout: 15_000 });
    await page.getByTestId('annonce-close').click();

    await forgetLastCheck(page);
    await page.reload();
    await expect(page.getByTestId('annonce-title')).toHaveText('Le livre des volcans (test)', { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('annonce-dialog')).toBeHidden();

    await forgetLastCheck(page);
    await page.reload();
    await checkDone(page);
    await expect(page.getByTestId('annonce-dialog')).toBeHidden();
    expect((await state(page))?.seen).toEqual(['annonce-test-2', 'annonce-test-1']);
    expect((await stats(page)).feed).toBe(3);

    // « Ne plus afficher » : réglage désactivé, plus aucune requête.
    await enableAndOpenMenu(page);
    await page.getByTestId('annonce-stop').click();
    await expect(page.getByTestId('annonce-dialog')).toBeHidden();
    expect((await state(page))?.enabled).toBe(false);
    await forgetLastCheck(page);
    const requests = feedRequests(page);
    await page.reload();
    await expect(page.getByTestId('collection')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(requests).toEqual([]);
  });

  test('échecs silencieux (signature fausse, keyId inconnu, périmé, image d’empreinte fausse, délai de 5 s, flux absent, livre ouvert) : menu identique, message en console', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.text().startsWith('annonces : ')) warnings.push(m.text());
    });
    await installAtMenu(page);
    const menu = await page.getByTestId('collection').innerText();
    for (const [sc, re] of [
      ['signature-fausse', /signature fausse/],
      ['inconnue', /keyId « k-inconnue » inconnu/],
      ['perime', /flux périmé/],
      ['image-fausse', /image : empreinte fausse/],
      ['absent', /réponse 404/],
      ['lent', /délai de 5 s dépassé/],
      ['propre-livre', null],
    ] as const) {
      await scenario(page, sc);
      warnings.length = 0;
      await enableAndOpenMenu(page);
      await checkDone(page, sc === 'lent' ? 15_000 : 10_000);
      await expect(page.getByTestId('annonce-dialog'), sc).toBeHidden();
      expect(await page.getByTestId('collection').innerText(), sc).toBe(menu);
      if (re) expect(warnings.some((w) => re.test(w)), `${sc} : ${warnings.join(' | ')}`).toBe(true);
      else expect(warnings, sc).toEqual([]);
      expect((await state(page))?.seen, sc).toEqual([]);
    }
    // Lien hors de la liste : annonce montrée sans « Voir le livre ».
    await scenario(page, 'lien-hors-liste');
    await enableAndOpenMenu(page);
    await expect(page.getByTestId('annonce-dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('annonce-see')).toHaveCount(0);
  });

  test('aucune lecture hors ligne, pendant l’installation, une scène ou le jeu', async ({ page, context }) => {
    const requests = feedRequests(page);
    // Réglage activé avant l'installation : rien pendant l'installation, lecture à l'arrivée sur le menu.
    await page.addInitScript((k) => {
      try {
        if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify({ enabled: true, seen: [] }));
      } catch {
        /* page sans stockage */
      }
    }, KEY);
    await page.request.get(`${SERVER}/__reset`);
    await page.goto(`${SERVER}/#/`);
    await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /^Installer$/ }).click();
    await page.waitForTimeout(1000);
    if (await page.getByRole('heading', { name: /Installer le livre/ }).isVisible()) expect(requests, 'pendant l’installation').toEqual([]);
    await expect(page.getByTestId('collection')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('annonce-dialog')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('annonce-close').click();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 20_000 }).toBe(true);

    // Scène et jeu, lecture due : rien.
    await setCollected(page, ['trex', 'raptor', 'ptero', 'duo', 'vallee']);
    await forgetLastCheck(page);
    requests.length = 0;
    await page.goto(`${SERVER}/#/s/trex`);
    await expect(page.getByTestId('info-button')).toBeVisible({ timeout: 60_000 });
    await page.goto(`${SERVER}/#/jeu`);
    await page.waitForTimeout(3000);
    expect(requests, 'scène et jeu').toEqual([]);

    // Hors ligne : menu affiché (service worker), aucune requête.
    await context.setOffline(true);
    await page.goto(`${SERVER}/#/`);
    await expect(page.getByTestId('collection')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(requests, 'hors ligne').toEqual([]);
    expect((await state(page))?.lastCheck).toBeUndefined();
    await context.setOffline(false);
  });
});
