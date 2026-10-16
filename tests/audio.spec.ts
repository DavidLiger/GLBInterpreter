// Audio Web Audio sur le livre de test installé (Î11) : `out/` construit depuis `books/test-dino` (`npm run build -- --source
// books/test-dino --part-mib 1`). Sons du livre de test (scripts/make-test-book.ts) : bips de 2 s, walk 262 Hz, roar 392 Hz,
// eat 523 Hz (raptor : une octave plus haut, « walk » en boucle), ambiance 110 Hz en boucle.
//
// Un script injecté note chaque son lancé (`AudioBufferSourceNode.start`) : hauteur estimée sur les échantillons décodés,
// boucle, arrêt (`stop`) ou fin naturelle (`ended`). Aucun son n'est écouté : on vérifie que le bon son part et s'arrête.
import { expect, test, type Page } from '@playwright/test';

const SERVER = 'http://localhost:4173';

declare global {
  interface Window {
    __audioLog: { freq: number; loop: boolean; stopped: boolean; ended: boolean }[];
  }
}

const INSTRUMENT = () => {
  window.__audioLog = [];
  if (typeof AudioBufferSourceNode === 'undefined') return; // navigateur sans Web Audio : test sauté (install)
  const estimate = (buf: AudioBuffer) => {
    const d = buf.getChannelData(0);
    const n = Math.min(d.length, Math.floor(buf.sampleRate * 0.15));
    let z = 0;
    for (let i = 1; i < n; i++) if (d[i - 1] < 0 !== d[i] < 0) z++;
    return Math.round(z / 2 / (n / buf.sampleRate));
  };
  const P = AudioBufferSourceNode.prototype as AudioBufferSourceNode & { __i?: number };
  const start = P.start;
  const stop = P.stop;
  P.start = function (this: AudioBufferSourceNode & { __i?: number }, ...a: [number?, number?, number?]) {
    if (this.buffer && this.buffer.length > 1) {
      const entry = { freq: estimate(this.buffer), loop: this.loop, stopped: false, ended: false };
      this.__i = window.__audioLog.push(entry) - 1;
      this.addEventListener('ended', () => (entry.ended = true));
    }
    return start.apply(this, a);
  };
  P.stop = function (this: AudioBufferSourceNode & { __i?: number }, ...a: [number?]) {
    if (this.__i !== undefined) window.__audioLog[this.__i].stopped = true;
    return stop.apply(this, a);
  };
};

/** Sons en cours, par hauteur arrondie à la note (± 5 %). */
async function playing(page: Page): Promise<string[]> {
  const log = await page.evaluate(() => window.__audioLog);
  const name = (f: number) => {
    const notes: Record<string, number> = { ambiance: 110, 'walk-trex': 262, 'roar-trex': 392, 'eat-trex': 523, 'walk-raptor': 523, 'roar-raptor': 784, 'eat-raptor': 1046 };
    const hit = Object.entries(notes).filter(([, hz]) => Math.abs(f - hz) / hz < 0.05).map(([k]) => k);
    return hit.join('|') || `${f} Hz`;
  };
  return log.filter((e) => !e.stopped && !e.ended).map((e) => `${name(e.freq)}${e.loop ? ' (boucle)' : ''}`);
}

/** Console de la page (jointe au rapport de Playwright en cas d'échec). */
let consoleLines: string[] = [];

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach('console', { body: consoleLines.join('\n') || '(vide)', contentType: 'text/plain' });
    console.log(`Console de la page :\n${consoleLines.filter((l) => /AUDIO|Audio|audio/.test(l)).join('\n') || '(aucune ligne audio)'}`);
  }
});

async function install(page: Page, scene: string, needsAudio = true) {
  consoleLines = [];
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));
  await page.addInitScript(INSTRUMENT);
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/#/s/${scene}`);
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Installer$/ }).click();
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeHidden({ timeout: 120_000 });
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
  // WebKit de Playwright sous Windows : Web Audio peut manquer (build WinCairo) ; le lecteur affiche alors la scène sans son
  const webAudio = await page.evaluate(() => typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window);
  test.skip(needsAudio && !webAudio, 'navigateur de test sans Web Audio : aucun son à vérifier');
}

async function start(page: Page) {
  const startText = page.getByText(/Cliquer pour commencer|Toucher pour commencer/);
  await expect(startText).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.__audioLog.length), 'aucun son avant le geste').toBe(0);
  await startText.click();
  await expect(page.getByTestId('action-buttons')).toBeVisible({ timeout: 10_000 });
  return page.getByTestId('action-buttons');
}

test('ambiance en boucle après le geste ; son par action : lancement, interruption, relance', async ({ page }) => {
  const lines: string[] = [];
  page.on('console', (m) => lines.push(m.text()));
  await install(page, 'trex');
  const bar = await start(page);
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)']);

  await bar.locator('[data-action-id="roar"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)', 'roar-trex']);

  // Interruption par une autre action : roar coupé, eat part
  await bar.locator('[data-action-id="eat"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)', 'eat-trex|walk-raptor']);

  // Relance de la même action : un seul eat, reparti du début
  await bar.locator('[data-action-id="eat"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)', 'eat-trex|walk-raptor']);
  const eats = await page.evaluate(() => window.__audioLog.filter((e) => Math.abs(e.freq - 523) < 26).length);
  expect(eats).toBe(2);

  // Fin d'une action sans boucle (clip de 1,25 s) : le son (2 s) est coupé à la fin du clip (décision du 16/10)
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 5_000 });
  expect(await playing(page)).toEqual(['ambiance (boucle)']);
  const lastEat = await page.evaluate(() => window.__audioLog.filter((e) => Math.abs(e.freq - 523) < 26).at(-1));
  expect(lastEat?.stopped, 'coupé par la fin du clip, pas fini de lui-même').toBe(true);
  // Ni erreur audio, ni AudioContext refusé faute de geste
  expect(lines.filter((l) => /\[AUDIO\]|AudioContext was not allowed/.test(l))).toEqual([]);
});

test('action en boucle : son en boucle avec elle, arrêté par son bouton', async ({ page }) => {
  await install(page, 'raptor');
  const bar = await start(page);
  await bar.locator('[data-action-id="walk"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)', 'eat-trex|walk-raptor (boucle)']);
  await page.waitForTimeout(2500); // plus long que le son : il boucle toujours
  expect(await playing(page)).toEqual(['ambiance (boucle)', 'eat-trex|walk-raptor (boucle)']);
  await bar.locator('[data-action-id="walk"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)']);
});

test('volume et sourdine : clavier, libellés, persistance au rechargement', async ({ page }) => {
  await install(page, 'trex', false);
  await start(page);
  const button = page.getByTestId('volume-button');
  await expect(button).toHaveAttribute('aria-label', 'Volume 70 %');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const slider = page.getByRole('slider', { name: 'Volume' });
  await slider.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await expect(slider).toHaveAttribute('aria-valuetext', '50 %');
  const mute = page.getByRole('button', { name: 'Couper le son' });
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  await expect(page.getByRole('button', { name: 'Remettre le son' })).toHaveAttribute('aria-pressed', 'true');
  await expect(slider).toHaveAttribute('aria-valuetext', '0 % (son coupé)');
  // En plein écran (passé par « Cliquer pour commencer »), Échap est pris par le navigateur pour en sortir : on en sort
  // d'abord, Échap ferme alors le panneau
  await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined));
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('glbinterpreter:audio:test-dino'))).toBe('{"volume":0.5,"muted":true}');

  // Rechargement : réglages relus ; démuet rend 50 %
  await page.reload();
  await start(page);
  await expect(button).toHaveAttribute('aria-label', 'Volume (son coupé)');
  await button.click();
  await page.getByRole('button', { name: 'Remettre le son' }).click();
  await expect(page.getByRole('slider', { name: 'Volume' })).toHaveAttribute('aria-valuetext', '50 %');
});

test('hors ligne : les sons sont lus dans le Cache Storage du livre', async ({ page, context }) => {
  await install(page, 'trex');
  await context.setOffline(true);
  await page.reload();
  const bar = await start(page);
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)']);
  await bar.locator('[data-action-id="roar"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)', 'roar-trex']);
  await context.setOffline(false);
});
