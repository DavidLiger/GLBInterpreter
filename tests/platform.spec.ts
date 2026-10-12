// Tests de plateforme (Î9) : écran « version iPhone à venir » (D-8.8), navigateurs intégrés (D-6.2 C), manifest et
// icônes du livre. Simulation d'agent utilisateur seulement : ni iPhone, ni Instagram, ni installation Android réels.
// Playwright WebKit (« Desktop Safari ») se présente en Safari de Mac sans écran tactile : il reste un ordinateur et
// installe le livre (tests de tests/install.spec.ts).
import { expect, test, type Page } from '@playwright/test';

const SERVER = 'http://localhost:4173';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipadAsMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 Instagram 346.0.0.38.86 Android',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.6613.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.47.109;]',
};

/** Aucun cache de livre ouvert et aucun fichier du livre demandé (hors page, application et index). */
async function nothingDownloaded(page: Page) {
  expect(await page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith('book-')))).toEqual([]);
  const stats: Record<string, number> = await (await page.request.get(`${SERVER}/__stats`)).json();
  expect(Object.keys(stats).filter((p) => /^(scenes|models|sounds|videos)\//.test(p))).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.request.get(`${SERVER}/__reset`);
});

test.describe('iPhone', () => {
  test.use({ userAgent: UA.iphone });
  test('écran « version iPhone à venir », rien n\'est téléchargé', async ({ page }) => {
    await page.goto(`${SERVER}/#/s/street`);
    await expect(page.getByRole('heading', { name: 'Version iPhone et iPad à venir' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Installer' })).toHaveCount(0);
    await nothingDownloaded(page);
  });
});

test.describe('iPad qui se présente comme un Mac', () => {
  test.use({ userAgent: UA.ipadAsMac });
  test('reconnu par ses points de contact', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }));
    await page.goto(`${SERVER}/`);
    await expect(page.getByRole('heading', { name: 'Version iPhone et iPad à venir' })).toBeVisible({ timeout: 20_000 });
    await nothingDownloaded(page);
  });
  test('un Mac sans écran tactile installe le livre', async ({ page }) => {
    await page.goto(`${SERVER}/`);
    await expect(page.getByRole('heading', { name: 'Installer le livre' })).toBeVisible({ timeout: 20_000 });
  });
});

for (const [name, ua] of [['Instagram', UA.instagramAndroid], ['Facebook', UA.facebookAndroid]] as const) {
  test.describe(`navigateur intégré ${name} (Android)`, () => {
    test.use({ userAgent: ua });
    test('téléchargement bloqué, lien vers Chrome qui garde la scène', async ({ page }) => {
      await page.goto(`${SERVER}/depot/#/s/street`);
      await expect(page.getByRole('heading', { name: 'Ouvrez le livre dans Chrome' })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(`navigateur de ${name}`)).toBeVisible();
      const href = await page.getByRole('link', { name: 'Ouvrir dans Chrome' }).getAttribute('href');
      expect(href).toContain('intent://localhost:4173/depot/s/street/#Intent;scheme=http;package=com.android.chrome;');
      await expect(page.getByText(`${SERVER}/depot/s/street/`, { exact: true })).toBeVisible();
      await nothingDownloaded(page);
    });
  });
}

test('manifest du livre : plein écran, icônes any et maskable, apple-touch-icon', async ({ page }) => {
  for (const base of ['/', '/depot/']) {
    const manifest = await (await page.request.get(`${SERVER}${base}manifest.webmanifest`)).json();
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.display_override).toEqual(['fullscreen', 'standalone']);
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.orientation).toBeTruthy();
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
    const purposes = new Set<string>();
    for (const icon of manifest.icons as { src: string; sizes: string; purpose: string }[]) {
      expect(icon.src.startsWith('/'), icon.src).toBe(false);
      const res = await page.request.get(`${SERVER}${base}${icon.src}`);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
      purposes.add(`${icon.purpose} ${icon.sizes}`);
    }
    for (const p of ['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512']) expect(purposes).toContain(p);

    const html = await (await page.request.get(`${SERVER}${base}`)).text();
    expect(html).toContain('<link rel="apple-touch-icon" href="./apple-touch-icon.png"/>');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-title"');
    expect((await page.request.get(`${SERVER}${base}apple-touch-icon.png`)).status()).toBe(200);
  }
});

test('ajout à l\'écran d\'accueil : bouton sur l\'écran d\'installation, écran « Livre installé », appinstalled', async ({ page }) => {
  // beforeinstallprompt simulé : Chrome ne le déclenche pas de façon fiable en test automatique.
  await page.goto(`${SERVER}/`);
  await expect(page.getByRole('heading', { name: 'Installer le livre' })).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    (window as unknown as { __prompted: number }).__prompted = 0;
    e.prompt = async () => {
      (window as unknown as { __prompted: number }).__prompted++;
    };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  const add = page.getByRole('button', { name: "Ajouter à l'écran d'accueil" });
  await expect(add).toBeVisible();
  await page.getByRole('button', { name: 'Installer', exact: true }).click();
  const done = page.getByRole('heading', { name: 'Livre installé' });
  await expect(done).toBeVisible({ timeout: 120_000 });
  await add.click();
  expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
  await expect(add).toBeHidden(); // un prompt ne sert qu'une fois
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByText("Le livre est ajouté à l'écran d'accueil.")).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir le livre' }).click();
  await expect(done).toBeHidden();
});
