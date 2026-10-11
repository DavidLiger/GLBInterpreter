// Tests automatiques de l'installation du livre (Î8) : téléchargement complet, recomposition des fichiers découpés
// (D-8.7), Cache Storage, reprise après coupure, invalidation par sha256 après reconstruction, hors ligne.
// Ne remplacent pas Safari iOS (WebKit de Playwright ≠ Safari mobile) : voir README, « Tester l'installation ».
//
//   npm run build -- --part-mib 1        découpe tout fichier > 1 MiB : des parties à recomposer même sans gros média
//   npm run test:install                 Chromium et WebKit (npx playwright install chromium webkit au préalable)
import { expect, test, type Page } from '@playwright/test';

const SERVER = 'http://localhost:4173';

interface IndexFile {
  path: string;
  size: number;
  sha256: string;
  parts?: { path: string; size: number; sha256: string }[];
}

async function serverIndex(page: Page): Promise<{ bookId: string; files: IndexFile[] }> {
  return (await page.request.get(`${SERVER}/book.json`)).json();
}

async function stats(page: Page): Promise<Record<string, number>> {
  return (await page.request.get(`${SERVER}/__stats`)).json();
}

/** Contenu du cache du livre vu depuis la page. */
async function cacheState(page: Page) {
  return page.evaluate(async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith('book-'));
    const entries: Record<string, { sha: string | null; size: number }> = {};
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const res = (await cache.match(req))!;
        entries[new URL(req.url).pathname] = { sha: res.headers.get('x-glbi-sha256'), size: (await res.blob()).size };
      }
    }
    return { names, entries, controlled: !!navigator.serviceWorker?.controller };
  });
}

async function digest(page: Page, url: string): Promise<string> {
  return page.evaluate(async (u) => {
    const names = (await caches.keys()).filter((n) => n.startsWith('book-'));
    for (const n of names) {
      const res = await (await caches.open(n)).match(u);
      if (res) {
        const buf = await crypto.subtle.digest('SHA-256', await res.arrayBuffer());
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    }
    return '';
  }, url);
}

const installHeading = (page: Page) => page.getByRole('heading', { name: /Installer le livre|Mise à jour du livre|Compléter le livre/ });

async function installAndWait(page: Page) {
  await expect(installHeading(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^(Installer|Mettre à jour|Reprendre)$/ }).click();
  await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
}

test.beforeEach(async ({ page }) => {
  await page.request.get(`${SERVER}/__reset`);
});

for (const base of ['/', '/depot/']) {
  test(`installation complète, recomposition et hors ligne (${base})`, async ({ page, context }) => {
    const index = await serverIndex(page);
    const parted = index.files.filter((f) => f.parts);

    await page.goto(`${SERVER}${base}#/s/street`);
    await installAndWait(page);

    const state = await cacheState(page);
    expect(state.names).toEqual([`book-${index.bookId}@${base}`]);
    for (const f of index.files) {
      const e = state.entries[`${base}${f.path}`];
      expect(e, f.path).toBeTruthy();
      expect(e.sha, f.path).toBe(f.sha256);
      expect(e.size, f.path).toBe(f.size);
    }
    expect(state.entries[`${base}book.json`]).toBeTruthy();

    // D-8.7 : fichier logique recomposé sous son URL d'origine, parties retirées du cache
    if (!parted.length) test.info().annotations.push({ type: 'note', description: 'aucun fichier découpé : construire avec --part-mib 1' });
    for (const f of parted) {
      expect(await digest(page, `${SERVER}${base}${f.path}`), f.path).toBe(f.sha256);
      for (const p of f.parts!) expect(state.entries[`${base}${p.path}`], p.path).toBeUndefined();
    }

    // Hors ligne : la page, l'application et les assets viennent du cache (service worker)
    if (!state.controlled) {
      test.info().annotations.push({ type: 'note', description: 'service worker non actif dans ce navigateur : test hors ligne non fait' });
      return;
    }
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Vérification du livre…')).toBeHidden({ timeout: 20_000 });
    await expect(installHeading(page)).toBeHidden();
    await expect(page.getByText('Connexion requise')).toBeHidden();
    await context.setOffline(false);
  });
}

test('reprise après coupure : les parties déjà vérifiées ne sont pas retéléchargées', async ({ page }) => {
  const index = await serverIndex(page);
  const target = index.files.find((f) => f.parts);
  test.skip(!target, 'aucun fichier découpé : construire avec --part-mib 1');
  const [first, second] = target!.parts!;
  // 3 coupures = toutes les tentatives automatiques échouent
  await page.request.get(`${SERVER}/__fail?path=${encodeURIComponent(second.path)}&times=3`);

  await page.goto(`${SERVER}/#/s/street`);
  await expect(installHeading(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Installer' }).click();
  await expect(page.getByText('La connexion a été interrompue')).toBeVisible({ timeout: 120_000 });
  const trace = await page.evaluate(() => localStorage.getItem('glbi:install-trace'));
  expect(JSON.parse(trace!).state).toBe('error');

  // Acquis vérifié (fichiers entiers + parties) : la barre ne doit jamais repartir en dessous à la reprise.
  const verified = await page.evaluate(async (files: IndexFile[]) => {
    const name = (await caches.keys()).find((n) => n.startsWith('book-'))!;
    const cache = await caches.open(name);
    const sha = async (p: string) => (await cache.match(new URL(p, location.href).href))?.headers.get('x-glbi-sha256');
    let n = 0;
    for (const f of files) {
      if ((await sha(f.path)) === f.sha256) n += f.size;
      else for (const p of f.parts ?? []) if ((await sha(p.path)) === p.sha256) n += p.size;
    }
    return n;
  }, index.files);
  const total = index.files.reduce((t, f) => t + f.size, 0);
  const floorPct = Math.floor((verified / total) * 100);
  expect(verified).toBeGreaterThan(first.size - 1);

  await page.getByRole('button', { name: 'Reprendre' }).click();
  const seen: number[] = [];
  for (let i = 0; i < 10 && (await installHeading(page).isVisible()); i++) {
    const m = /(\d+) %/.exec((await page.getByText(/Téléchargement… \d+ %/).textContent().catch(() => '')) ?? '');
    if (m) seen.push(Number(m[1]));
    await page.waitForTimeout(30);
  }
  for (const pct of seen) expect(pct, `progression affichée à la reprise (acquis ${floorPct} %)`).toBeGreaterThanOrEqual(floorPct);
  await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
  const s = await stats(page);
  expect(s[first.path]).toBe(1);
  expect(s[second.path]).toBe(4);
  expect(await digest(page, `${SERVER}/${target!.path}`)).toBe(target!.sha256);
});

test('reconstruction du livre : seul le fichier modifié est retéléchargé (invalidation par sha256)', async ({ page }) => {
  await page.goto(`${SERVER}/#/s/street`);
  await installAndWait(page);
  const before = await stats(page);

  await page.request.get(`${SERVER}/__mutate?on=1`);
  const mutated = await serverIndex(page);
  const html = mutated.files.find((f) => f.path === 'index.html')!;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mise à jour du livre' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Mettre à jour' }).click();
  await expect(page.getByRole('heading', { name: 'Mise à jour du livre' })).toBeHidden({ timeout: 60_000 });
  await expect(installHeading(page)).toBeHidden({ timeout: 20_000 });

  const after = await stats(page);
  const redownloaded = Object.keys(after).filter((p) => p !== 'book.json' && p !== 'sw.js' && (after[p] ?? 0) > (before[p] ?? 0) && p !== 'index.html');
  // Après la mise à jour, la page est rechargée depuis le cache : seuls book.json et index.html sont redemandés au réseau.
  expect(redownloaded).toEqual([]);
  const state = await cacheState(page);
  expect(state.entries['/index.html'].sha).toBe(html.sha256);
});

test('console de débogage chargée seulement avec ?debug=1', async ({ page }) => {
  await page.goto(`${SERVER}/`);
  await expect(installHeading(page)).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => !!document.getElementById('eruda'))).toBe(false);
  await page.goto(`${SERVER}/?debug=1`);
  await expect(page.locator('#eruda')).toBeAttached({ timeout: 20_000 });
});
