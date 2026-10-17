// Scanner QR interne (Î14) : le toucher du bouton du scanner est un geste dans la page. La scène ouverte ensuite (raptor,
// sans quiz, accessible une fois trex débloqué) joue son son sans pastille « Clique dans la page pour le son » (Î13bis).
// Règle d'autoplay de Chrome simulée comme dans `audio.spec.ts` (les navigateurs sans écran laissent jouer le son sans
// geste) : contexte suspendu tant que la page n'a reçu aucun geste réel. Caméra simulée par Chromium.
import { expect, test } from '@playwright/test';
import { PROGRESS_KEY } from './progress-helpers';
import { sceneLaunched } from './scene-helpers';
import { CHROMIUM_ONLY, ORIGIN, SERVER, fakeCamera, installAtMenu, liveTracks, qrVideo, recordCamera } from './scanner-helpers';

test.skip(({ browserName }) => browserName !== 'chromium', CHROMIUM_ONLY);

test.use(fakeCamera(qrVideo('raptor', `${ORIGIN}/s/raptor`)));

const GESTURE_REQUIRED = () => {
  const w = window as unknown as { __glbiContexts: AudioContext[] };
  w.__glbiContexts = [];
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
      w.__glbiContexts.push(this);
      if (!active) void this.suspend();
    }
    resume() {
      return active ? super.resume() : new Promise<void>(() => {});
    }
  };
};

test('scène ouverte par le scanner : son sans pastille, sans autre geste', async ({ page: first, context }) => {
  await installAtMenu(first);
  await first.close();
  // Nouvel onglet sans geste, livre installé, trex déjà débloqué : raptor est accessible et n'a pas de quiz.
  const page = await context.newPage();
  await page.addInitScript(
    ([key, v]) => localStorage.setItem(key, v),
    [PROGRESS_KEY, JSON.stringify({ unlockedScenes: ['trex'], quizPassed: { trex: true }, collected: {} })] as const,
  );
  await page.addInitScript(GESTURE_REQUIRED);
  await recordCamera(page);
  await page.goto(`${SERVER}/#/`);
  await expect(page.getByTestId('collection')).toBeVisible({ timeout: 20_000 });
  test.skip(!(await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2') && 'AudioContext' in window)), 'sans WebGL 2 ou Web Audio');

  await page.getByTestId('scanner-button').click();
  await sceneLaunched(page);
  expect(await page.evaluate(() => location.hash)).toBe('#/s/raptor');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __glbiContexts: AudioContext[] }).__glbiContexts.some((c) => c.state === 'running')))
    .toBe(true);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('sound-hint')).toHaveCount(0);
  expect(await liveTracks(page)).toBe(0);
});
