// Progression du livre de test (Î13) pour les tests qui ne portent pas sur elle : toutes les scènes débloquées avant
// chaque chargement de page, comme pour un lecteur qui a déjà parcouru le livre (ni quiz ni écran de blocage).
// Le livre de test `books/test-dino` a quatre scènes dans l'ordre trex → raptor → ptero → duo (`scripts/make-test-book.ts` ;
// « duo », sans quiz, ajoutée en fin par AC1).
import type { Page } from '@playwright/test';

export const BOOK_ID = 'test-dino';
export const PROGRESS_KEY = `glbinterpreter:progress:${BOOK_ID}`;
export const BOOK_SCENES = ['trex', 'raptor', 'ptero', 'duo'];

export async function unlockAllScenes(page: Page): Promise<void> {
  const value = JSON.stringify({ unlockedScenes: BOOK_SCENES, quizPassed: { trex: true, ptero: true }, collected: {} });
  await page.addInitScript(
    ([key, v]) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        /* page sans stockage (about:blank) */
      }
    },
    [PROGRESS_KEY, value] as const,
  );
}
