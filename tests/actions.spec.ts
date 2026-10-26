// Actions combinées sur le livre de test installé (AC2, spec-actions-combinees.md §12 et §16) : scène « duo » de
// `books/test-dino` (`npm run build -- --source books/test-dino --part-mib 1`), deux personnages aux os de même nom.
// Clips : chasse 4 s (événements morsure 2 s, souffle 2,5 s sans son, fuite 3,2 s), chute 2 s en coupe au noir (impact
// 1,5 s), regard 3 s avec empty de position de la caméra `CamRegard` (DP-19), course 1 s en boucle (pas_g 0,25 s, pas_d
// 0,75 s). Sons : chasse 330 Hz (2 s), regard 440 Hz, morsure 660 Hz, fuite 880 Hz, impact 220 Hz, pas 550 Hz (0,3 s),
// ambiance 110 Hz en boucle.
//
// Lus dans la page : `data-action-log` et `data-event-log` des boutons (dix derniers `id:phase` et `action:événement`),
// attributs du calque noir `cut-layer` (`data-cut`, `data-cut-count`, `data-camera`, `data-camera-log`,
// `data-target-followed`), journal des sons `window.__audioLog` (tests/audio-helpers.ts).
import { unlockAllScenes } from './progress-helpers';
import { sceneLaunched } from './scene-helpers';
import { INSTRUMENT } from './audio-helpers';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SERVER = 'http://localhost:4173';

test.beforeEach(async ({ page }) => {
  await unlockAllScenes(page);
});

async function openDuo(page: Page, needsAudio: boolean): Promise<Locator> {
  await page.addInitScript(INSTRUMENT);
  await page.request.get(`${SERVER}/__reset`);
  await page.goto(`${SERVER}/#/s/duo`);
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Installer$/ }).click();
  await expect(page.getByRole('heading', { name: /Installer le livre/ })).toBeHidden({ timeout: 120_000 });
  const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl, 'navigateur de test sans WebGL 2 : lecteur non monté');
  const webAudio = await page.evaluate(() => typeof AudioContext !== 'undefined' || 'webkitAudioContext' in window);
  test.skip(needsAudio && !webAudio, 'navigateur de test sans Web Audio : aucun son à vérifier');
  return sceneLaunched(page);
}

const attr = async (loc: Locator, name: string) => (await loc.getAttribute(name)) ?? '';
const words = async (loc: Locator, name: string) => (await attr(loc, name)).split(' ').filter(Boolean);
/** Sons joués d'une hauteur donnée (± 5 %). */
const sounds = (page: Page, hz: number) => page.evaluate((f) => window.__audioLog.filter((e) => Math.abs(e.freq - f) / f < 0.05), hz);

test('événements : sons aux instants des marqueurs, avec le son de l’action et l’ambiance ; interruption ; relance', async ({ page }) => {
  const bar = await openDuo(page, true);
  await bar.locator('[data-action-id="chasse"]').click();
  await expect.poll(() => words(bar, 'data-event-log'), { timeout: 10_000 }).toEqual(['chasse:morsure', 'chasse:souffle', 'chasse:fuite']);
  const chasse = (await sounds(page, 330)).at(-1)!;
  const morsure = (await sounds(page, 660)).at(-1)!;
  const fuite = (await sounds(page, 880)).at(-1)!;
  // Instants relatifs au son de l'action (lancé à start) : 2 s et 3,2 s du clip ; marge pour une faible cadence d'images
  // (pas plafonné à 0,1 s : le clip peut prendre jusqu'à 30 % de retard sur l'horloge)
  const m = (morsure.at - chasse.at) / 1000;
  const f = (fuite.at - chasse.at) / 1000;
  expect(m, `morsure à ${m} s`).toBeGreaterThan(1.9);
  expect(m).toBeLessThan(2.9);
  expect(f - m, `fuite − morsure : ${f - m} s`).toBeGreaterThan(1.1);
  expect(f - m).toBeLessThan(1.8);
  expect((await sounds(page, 110)).filter((e) => !e.stopped && !e.ended).length, 'ambiance continue').toBe(1);
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 10_000 });

  // Interruption entre « souffle » (2,5 s) et « fuite » (3,2 s) : événements restants annulés
  await bar.locator('[data-action-id="chasse"]').click();
  await expect.poll(async () => (await words(bar, 'data-event-log')).length, { timeout: 10_000, intervals: [50] }).toBe(5);
  const fuites = (await sounds(page, 880)).length;
  await bar.locator('[data-action-id="regard"]').click();
  await page.waitForTimeout(2000);
  expect(await words(bar, 'data-event-log'), 'fuite annulée').toEqual(['chasse:morsure', 'chasse:souffle', 'chasse:fuite', 'chasse:morsure', 'chasse:souffle']);
  expect((await sounds(page, 880)).length).toBe(fuites);
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 10_000 });

  // Relance à 0,5 s : les événements repartent du début (une seule morsure, au deuxième lancement)
  const morsures = (await sounds(page, 660)).length;
  await bar.locator('[data-action-id="chasse"]').click();
  await page.waitForTimeout(500);
  await bar.locator('[data-action-id="chasse"]').click();
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 10_000 });
  expect((await sounds(page, 660)).length - morsures).toBe(1);
  expect((await words(bar, 'data-action-log')).slice(-3)).toEqual(['chasse:interrupt', 'chasse:start', 'chasse:end']);
});

test('coupe au noir : calque présent puis retiré, start au noir, son de l’impact ; dernier clic retenu ; ambiance continue', async ({ page }) => {
  const bar = await openDuo(page, false);
  const layer = page.getByTestId('cut-layer');
  await expect(layer).toHaveAttribute('data-cut-count', '0');
  await bar.locator('[data-action-id="chute"]').click();
  await expect(layer).toHaveAttribute('data-cut', 'out');
  expect(await words(bar, 'data-action-log'), 'start pas avant le noir').toEqual([]);
  await expect(layer).toHaveAttribute('data-cut-count', '1');
  await expect.poll(() => words(bar, 'data-action-log')).toEqual(['chute:start']);
  await expect(layer).toHaveAttribute('data-cut', '', { timeout: 5_000 });
  expect(Number(await layer.evaluate((el) => (el as HTMLElement).style.opacity))).toBe(0);
  await expect.poll(() => words(bar, 'data-event-log')).toEqual(['chute:impact']);
  // Fin naturelle : end à la fin du clip, retour à idle au noir (deuxième noir)
  await expect(layer).toHaveAttribute('data-cut-count', '2', { timeout: 10_000 });
  expect(await words(bar, 'data-action-log')).toEqual(['chute:start', 'chute:end']);
  await expect(layer).toHaveAttribute('data-cut', '', { timeout: 5_000 });

  // Clics pendant la montée vers le noir : seul le dernier est exécuté, au noir. Les deux clics partent dans la même tâche
  // de la page (un clic de Playwright peut prendre plus que les 0,3 s de la montée dans un navigateur lent).
  await bar.evaluate((el) => {
    (el.querySelector('[data-action-id="chute"]') as HTMLButtonElement).click();
    (el.querySelector('[data-action-id="regard"]') as HTMLButtonElement).click();
  });
  await expect(layer).toHaveAttribute('data-cut-count', '3');
  await expect.poll(() => words(bar, 'data-action-log')).toEqual(['chute:start', 'chute:end', 'regard:start']);

  // Son : ambiance jamais coupée par les noirs
  const webAudio = await page.evaluate(() => typeof AudioContext !== 'undefined');
  if (webAudio) {
    expect((await sounds(page, 110)).filter((e) => e.stopped).length).toBe(0);
    expect((await sounds(page, 220)).length, 'son de l’impact joué').toBe(1);
  }
});

test('cible suivie pendant « chasse » (DP-7), immobile au repos ; action en boucle : événements à chaque tour', async ({ page }) => {
  const bar = await openDuo(page, false);
  const layer = page.getByTestId('cut-layer');
  await page.waitForTimeout(1500); // idle n'anime pas la cible
  await expect(layer).not.toHaveAttribute('data-target-followed', '1');
  await bar.locator('[data-action-id="chasse"]').click();
  await expect(layer).toHaveAttribute('data-target-followed', '1', { timeout: 5_000 });
  await expect(layer).toHaveAttribute('data-camera', 'free');
  await expect(bar).toHaveAttribute('data-current-action', '', { timeout: 10_000 });

  // « course » (boucle de 1 s) : pas_g, pas_d à chaque tour ; son propre bouton l'arrête
  await bar.locator('[data-action-id="course"]').click();
  await expect.poll(async () => (await words(bar, 'data-event-log')).filter((w) => w.startsWith('course:')).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(5);
  await bar.locator('[data-action-id="course"]').click();
  await expect(bar).toHaveAttribute('data-current-action', '');
  const steps = (await words(bar, 'data-event-log')).filter((w) => w.startsWith('course:'));
  // Journal limité aux dix derniers : on vérifie l'alternance pas_g / pas_d, quel que soit le premier gardé
  expect(steps.every((w, i) => (i === 0 ? w === 'course:pas_g' || w === 'course:pas_d' : w !== steps[i - 1])), `ordre des pas : ${steps.join(' ')}`).toBe(true);
  expect((await words(bar, 'data-action-log')).slice(-2)).toEqual(['course:start', 'course:end']);
});

test('empty de position (DP-19) : caméra posée puis retour en douceur ; interruption par une coupe : retour au noir', async ({ page }) => {
  const bar = await openDuo(page, false);
  const layer = page.getByTestId('cut-layer');
  await bar.locator('[data-action-id="regard"]').click();
  await expect(layer).toHaveAttribute('data-camera', 'locked', { timeout: 5_000 });
  // Contrôles inertes : un glisser sur la vue ne change rien au mode (la caméra suit l'empty)
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width / 2, vp.height / 3);
  await page.mouse.down();
  await page.mouse.move(vp.width / 2 + 200, vp.height / 3, { steps: 5 });
  await page.mouse.up();
  await expect(layer).toHaveAttribute('data-camera', 'locked');
  await expect(layer).toHaveAttribute('data-camera', 'free', { timeout: 10_000 });
  expect(await words(layer, 'data-camera-log')).toEqual(['enter', 'locked', 'return', 'free']);

  // Interruption par une action en coupe au noir : pas de retour en douceur, caméra rendue d'un coup au noir
  await bar.locator('[data-action-id="regard"]').click();
  await expect(layer).toHaveAttribute('data-camera', 'locked', { timeout: 5_000 });
  await bar.locator('[data-action-id="chute"]').click();
  await expect(layer).toHaveAttribute('data-cut-count', '1');
  await expect(layer).toHaveAttribute('data-camera', 'free');
  expect((await words(layer, 'data-camera-log')).slice(-3)).toEqual(['enter', 'locked', 'free']);
  expect((await words(bar, 'data-action-log')).slice(-2)).toEqual(['regard:interrupt', 'chute:start']);
});
