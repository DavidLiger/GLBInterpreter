// Aide aux tests du mini-jeu (MJ1, spec-mini-jeu.md §2, §11) : livre de test installé, progression posée, requêtes du jeu
// observées. Le livre de test a un jeu (`book.json.game`, `unlockThreshold` 3) : arène, joueur `dino`, proie `compso`.
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, type Request } from '@playwright/test';
import { PROGRESS_KEY } from './progress-helpers';

export const SERVER = 'http://localhost:4173';
export const GAME_KEY = 'glbinterpreter:game:test-dino';

const installHeading = (page: Page) => page.getByRole('heading', { name: /Installer le livre|Install the book|Instalar el libro/ });

/** Livre installé depuis `server`, ouvert sur le menu de collection, page contrôlée par le service worker. */
export async function installAtMenu(page: Page, server = SERVER) {
  await page.request.get(`${server}/__reset`);
  await page.goto(`${server}/#/`);
  await expect(installHeading(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^(Installer|Install|Instalar)$/ }).click();
  await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
  await expect(page.getByTestId('collection')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 20_000 }).toBe(true);
}

/** Progression posée dans le stockage : `collected` des scènes données (cartes gagnées), toutes les scènes débloquées. */
export async function setCollected(page: Page, ids: string[]) {
  const value = JSON.stringify({ unlockedScenes: ['trex', 'raptor', 'ptero', 'duo', 'vallee'], quizPassed: { trex: true, ptero: true }, collected: Object.fromEntries(ids.map((id) => [id, true])) });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [PROGRESS_KEY, value] as const);
}

/** Fichiers des chunks du jeu (liste écrite par next build, `.next/glbi-game-chunks.json`), chemins relatifs à `out/`. */
export function gameChunks(): string[] {
  const raw = JSON.parse(fs.readFileSync(path.resolve('.next/glbi-game-chunks.json'), 'utf8')) as { files: string[] };
  return raw.files.map((f) => `_next/${f}`);
}

/** Requêtes de la page (servies par le réseau ou par le service worker) vers un fichier du jeu : chunk du jeu ou `game/`. */
export function recordGameRequests(page: Page): string[] {
  const chunks = gameChunks().map((f) => f.split('/').pop()!);
  const seen: string[] = [];
  page.on('request', (r: Request) => {
    const u = new URL(r.url()).pathname;
    if (chunks.some((c) => u.endsWith(c)) || /\/game\//.test(u)) seen.push(u);
  });
  return seen;
}
