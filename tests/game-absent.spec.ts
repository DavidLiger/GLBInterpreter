// Livre sans mini-jeu (MJ1, décision de David du 28/10, spec-mini-jeu.md §2) : copie de `out/` reconstruite par build-book
// pour le livre de test sans `book.json.game` (`make-test-book.ts --sans-jeu`), servie à part (port 4174). Chunks du jeu
// absents du dossier et de `book.json.files` ; pas de case « Mini-jeu » ; `#/jeu` → page introuvable du livre, sans requête
// vers le jeu. Chromium seulement (préparation lourde ; rien de propre à WebKit).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { gameChunks, installAtMenu, recordGameRequests } from './game-helpers';

const PORT = 4174;
const SERVER = `http://localhost:${PORT}`;
const MARKER = 'glbi-game-mj1';
let work = '';
let server: ChildProcess | null = null;

test.skip(({ browserName }) => browserName !== 'chromium', 'livre reconstruit : Chromium seulement');

test.beforeAll(async ({ browserName }) => {
  if (browserName !== 'chromium') return;
  test.setTimeout(300_000);
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'glbi-sans-jeu-'));
  const src = path.join(work, 'source');
  const out = path.join(work, 'out');
  fs.cpSync(path.resolve('out'), out, { recursive: true });
  const tsx = path.resolve('node_modules/tsx/dist/cli.mjs');
  const run = (args: string[]) => {
    const r = spawnSync(process.execPath, [tsx, ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${args.join(' ')} :\n${r.stdout}\n${r.stderr}`);
  };
  run(['scripts/make-test-book.ts', src, '--sans-jeu']);
  run(['scripts/build-book.ts', '--source', src, '--out', out, '--qr-dir', path.join(work, 'qr')]);
  server = spawn(process.execPath, [tsx, 'tests/static-server.ts', String(PORT), out], { stdio: 'ignore' });
  await expect.poll(async () => fetch(`${SERVER}/__stats`).then((r) => r.ok, () => false), { timeout: 30_000 }).toBe(true);
});

test.afterAll(() => {
  server?.kill();
  if (work) fs.rmSync(work, { recursive: true, force: true });
});

test('livre sans jeu : chunks du jeu exclus du dossier et de book.json.files ; pas de case ; #/jeu introuvable sans requête', async ({ page }) => {
  const out = path.join(work, 'out');
  const index = JSON.parse(fs.readFileSync(path.join(out, 'book.json'), 'utf8')) as { files: { path: string }[]; game?: unknown };
  const files = index.files.map((f) => f.path);
  expect(index.game).toBeUndefined();
  for (const c of gameChunks()) {
    expect(fs.existsSync(path.join(out, c))).toBe(false);
    expect(files).not.toContain(c);
  }
  expect(files.filter((f) => f.startsWith('game/') || f.startsWith('jeu/'))).toEqual([]);
  expect(files.filter((f) => /\.(js|css)$/.test(f) && fs.readFileSync(path.join(out, f), 'utf8').includes(MARKER))).toEqual([]);
  expect(fs.existsSync(path.join(work, 'qr/test-dino/jeu.svg'))).toBe(false);

  await installAtMenu(page, SERVER);
  await expect(page.getByTestId('game-tile')).toHaveCount(0);
  await expect(page.getByTestId('game-tile-locked')).toHaveCount(0);
  const requests = recordGameRequests(page);
  await page.goto(`${SERVER}/#/jeu`);
  await expect(page.getByRole('heading', { name: 'Scène introuvable' })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
});
