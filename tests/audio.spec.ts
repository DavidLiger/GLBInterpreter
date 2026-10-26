// Audio Web Audio sur le livre de test installé (Î11) : `out/` construit depuis `books/test-dino` (`npm run build -- --source
// books/test-dino --part-mib 1`). Sons du livre de test (scripts/make-test-book.ts) : bips de 2 s, walk 262 Hz, roar 392 Hz,
// eat 523 Hz (raptor : une octave plus haut, « walk » en boucle), ambiance 110 Hz en boucle.
//
// Un script injecté note chaque son lancé (`AudioBufferSourceNode.start`) : hauteur estimée sur les échantillons décodés,
// boucle, arrêt (`stop`) ou fin naturelle (`ended`). Aucun son n'est écouté : on vérifie que le bon son part et s'arrête.
import { unlockAllScenes } from './progress-helpers';
import { fullscreenElement, sceneLaunched } from './scene-helpers';
import { INSTRUMENT, watchIdle } from './audio-helpers';
import { expect, test, type Page } from '@playwright/test';

const SERVER = 'http://localhost:4173';

// Î13 : scènes débloquées (ni quiz ni écran de blocage) ; la progression elle-même est testée dans progress.spec.ts.
test.beforeEach(async ({ page }) => {
  await unlockAllScenes(page);
});

// Script injecté et journal `window.__audioLog` : tests/audio-helpers.ts (partagés avec tests/actions.spec.ts, AC2).

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

/** Î13bis : la scène se lance seule (plus d'écran « Cliquer pour commencer ») ; le geste de l'installation a déjà donné à la page le droit de jouer du son. */
async function start(page: Page) {
  return sceneLaunched(page);
}

test('ambiance en boucle dès le lancement automatique ; son par action : lancement, interruption, relance', async ({ page }) => {
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
  await watchIdle(page);
  await bar.locator('[data-action-id="eat"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)', 'eat-trex|walk-raptor']);
  const eats = await page.evaluate(() => window.__audioLog.filter((e) => Math.abs(e.freq - 523) < 26).length);
  expect(eats).toBe(2);

  // Fin d'une action sans boucle (clip de 1,25 s) : le son (2 s) est coupé à la fin du clip (décision du 16/10).
  // AC2 (test rendu robuste, intermittent dans le WebKit de Playwright sous Linux) : à faible cadence, le pas d'animation
  // plafonné à 0,1 s ralentit le clip, qui peut finir après le son ; on vérifie donc qu'aucun son « eat » ne joue encore
  // quand l'action se termine : coupé par la fin du clip, ou déjà fini de lui-même avant elle.
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 5_000 });
  expect(await playing(page)).toEqual(['ambiance (boucle)']);
  const { lastEat, idleAt } = await page.evaluate(() => ({
    lastEat: window.__audioLog.filter((e) => Math.abs(e.freq - 523) < 26).at(-1),
    idleAt: window.__idleAt,
  }));
  expect(idleAt, 'fin de l’action relevée').toBeDefined();
  const cutByClip = !!lastEat?.stopped && (lastEat.stoppedAt ?? Infinity) <= idleAt! + 50;
  const endedBefore = !!lastEat?.ended && (lastEat.endedAt ?? Infinity) <= idleAt! + 50;
  expect(cutByClip || endedBefore, `son « eat » encore joué après la fin du clip : ${JSON.stringify({ lastEat, idleAt })}`).toBe(true);
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
  // En plein écran, Échap est pris par le navigateur pour en sortir : on en sort d'abord (depuis Î13bis, l'arrivée par
  // l'installation ne met pas en plein écran), Échap ferme alors le panneau
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

// Règle d'autoplay de Chrome simulée : les navigateurs de test sans écran laissent jouer le son sans geste (Chromium ignore
// `--autoplay-policy` pour Web Audio en mode sans écran ; un nouvel onglet y a déjà `userActivation.hasBeenActive`, vérifié
// le 17/10). Le script injecté rend à `AudioContext` la règle du navigateur réel : tant que la page n'a reçu aucun geste
// réel (toucher, clic, touche du clavier), le contexte est suspendu et `resume()` n'aboutit pas ; après un geste, il démarre.
const GESTURE_REQUIRED = () => {
  const Orig = window.AudioContext;
  if (!Orig) return;
  let active = false;
  for (const type of ['pointerup', 'touchend', 'mousedown', 'keydown']) {
    window.addEventListener(type, (e) => {
      if (e.isTrusted && !(e instanceof KeyboardEvent && e.key === 'Escape')) active = true;
    }, true);
  }
  window.AudioContext = class extends Orig {
    constructor(...a: ConstructorParameters<typeof AudioContext>) {
      super(...a);
      if (!active) void this.suspend();
    }
    resume() {
      return active ? super.resume() : new Promise<void>(() => {});
    }
  };
};

test('Î13bis : arrivée sans geste dans la page (QR direct) : son bloqué, pastille, premier clic dans la page', async ({ page: first, context }) => {
  await install(first, 'trex');
  await sceneLaunched(first);
  await first.close();
  // Nouvel onglet sur l'adresse de la scène, sans geste (comme l'appareil photo qui ouvre un QR). Un rechargement ne
  // suffit pas : Chromium et WebKit gardent l'activation d'une page à la suivante du même site.
  const page = await context.newPage();
  await unlockAllScenes(page);
  await page.addInitScript(INSTRUMENT);
  await page.addInitScript(GESTURE_REQUIRED);
  await page.goto(`${SERVER}/#/s/trex`);
  await sceneLaunched(page);
  const hint = page.getByTestId('sound-hint');
  await expect(hint).toHaveText('🔇 Clique dans la page pour le son', { timeout: 10_000 });
  // Pastille en haut au centre, loin des boutons d'animation (batterie du 17/10)
  const vp = page.viewportSize()!;
  const h = (await hint.boundingBox())!;
  expect(h.y + h.height).toBeLessThan(vp.height / 3);
  expect(Math.abs(h.x + h.width / 2 - vp.width / 2)).toBeLessThan(4);
  // Premier clic dans la scène (hors boutons) : son débloqué, pastille retirée, ambiance en boucle ; plein écran de la
  // page demandé dans ce clic (décision de David du 17/10, Chromium : WebKit sous Windows n'a pas toujours l'API)
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect(hint).toHaveCount(0);
  await expect.poll(() => playing(page)).toContain('ambiance (boucle)');
  if (test.info().project.name === 'chromium') await expect.poll(() => fullscreenElement(page)).toBe('html');
  // Le premier clic n'a pas été retenu : les boutons répondent
  await page.getByTestId('action-buttons').locator('[data-action-id="roar"]').click();
  await expect.poll(() => playing(page)).toEqual(['ambiance (boucle)', 'roar-trex']);
});
