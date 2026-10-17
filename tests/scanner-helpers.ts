// Aide aux tests du scanner QR interne (Î14) : vidéo de caméra simulée montrant un QR, Chromium avec fausse caméra,
// livre installé ouvert sur le menu, pistes de caméra encore actives. Une vidéo par fichier de tests (`launchOptions`
// est fixé par fichier : il impose un navigateur par valeur).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import QRCode from 'qrcode';
import { expect, type Page } from '@playwright/test';
import { PROGRESS_KEY } from './progress-helpers';

export const SERVER = 'http://localhost:4173';
export const ORIGIN = 'https://dino.editions-liger.com'; // `origin` du livre de test (scripts/make-test-book.ts)

/** Vidéo .y4m (640×480, niveaux de gris) qui montre le QR de `text` sur fond blanc, pour `--use-file-for-fake-video-capture`. */
export function qrVideo(name: string, text: string): string {
  const W = 640;
  const H = 480;
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const cell = Math.floor(400 / (n + 8)); // zone calme de 4 modules de chaque côté
  const x0 = Math.floor((W - n * cell) / 2);
  const y0 = Math.floor((H - n * cell) / 2);
  const y = Buffer.alloc(W * H, 235);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c))
        for (let dy = 0; dy < cell; dy++) y.fill(16, (y0 + r * cell + dy) * W + x0 + c * cell, (y0 + r * cell + dy) * W + x0 + (c + 1) * cell);
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, chroma]);
  const file = path.join(os.tmpdir(), `glbi-scanner-${name}.y4m`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]));
  return file;
}

/** Chromium avec caméra simulée montrant `video` (et permission caméra accordée sans invite). */
export function fakeCamera(video: string) {
  const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`];
  const exe = process.env.PW_CHROMIUM_PATH;
  return {
    launchOptions: exe
      ? { executablePath: exe, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', ...args] }
      : { args },
  };
}

/** Le WebKit de Playwright ne simule pas de caméra : tests du scanner sautés pour lui (non critère, prompt d'Î14). */
export const CHROMIUM_ONLY = 'caméra simulée : Chromium seulement';

const installHeading = (page: Page) => page.getByRole('heading', { name: /Installer le livre|Install the book|Instalar el libro/ });


/** Flux de la caméra notés dans `__glbiStreams` (arrêt vérifié par `liveTracks`) ; `__glbiDeny` simule un refus. */
export async function recordCamera(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __glbiStreams: MediaStream[]; __glbiDeny?: boolean };
    w.__glbiStreams = [];
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) return;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c?: MediaStreamConstraints) => {
      if (w.__glbiDeny) throw new DOMException('Permission refusée (test)', 'NotAllowedError');
      const s = await orig(c);
      w.__glbiStreams.push(s);
      return s;
    };
  });
}

/** Livre installé, ouvert sur le menu de collection, page contrôlée par le service worker, caméra notée (`recordCamera`). */
export async function installAtMenu(page: Page) {
  await recordCamera(page);
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/#/`);
  await expect(installHeading(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^(Installer|Install|Instalar)$/ }).click();
  await expect(installHeading(page)).toBeHidden({ timeout: 120_000 });
  await expect(page.getByTestId('collection')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 20_000 }).toBe(true);
}

/** Pistes de caméra encore actives. */
export const liveTracks = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __glbiStreams: MediaStream[] }).__glbiStreams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length,
  );
export const progress = (page: Page) => page.evaluate((k) => localStorage.getItem(k), PROGRESS_KEY);
