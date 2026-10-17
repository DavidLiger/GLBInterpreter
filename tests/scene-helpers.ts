// Lancement d'une scène v1 du livre (Î13bis) : plus d'écran « Cliquer / Toucher pour commencer » ; chargeur rond, puis la
// scène se lance seule à la fin du chargement (barre des boutons d'animation visible).
import { expect, type Locator, type Page } from '@playwright/test';

/** Lecteur monté (chargeur rond ou scène lancée), ou écran WebGL sans GPU. */
export const readerShown = (page: Page): Locator =>
  page
    .getByTestId('round-loader')
    .or(page.getByTestId('action-buttons'))
    .or(page.getByText(/tout le monde s'est endormi/))
    .first();

/** Scène lancée sans geste : boutons d'animation visibles, aucun écran de démarrage. */
export async function sceneLaunched(page: Page, timeout = 30_000): Promise<Locator> {
  const bar = page.getByTestId('action-buttons');
  await expect(bar).toBeVisible({ timeout });
  await expect(page.getByRole('button', { name: /pour commencer|to start|para comenzar/i })).toHaveCount(0);
  await expect(page.getByTestId('loader-overlay')).toHaveCount(0);
  return bar;
}

/** Élément en plein écran par l'API (`null` sinon) : `html` depuis Î13bis (page entière). */
export const fullscreenElement = (page: Page) =>
  page.evaluate(() => {
    const d = document as Document & { webkitFullscreenElement?: Element | null };
    return (d.fullscreenElement ?? d.webkitFullscreenElement ?? null)?.tagName.toLowerCase() ?? null;
  });

/**
 * Page masquée puis rendue (passage en arrière-plan) : `document.hidden` et `visibilityState` simulés, puis
 * `visibilitychange` et `focus` comme au retour réel d'une application.
 */
export async function simulateBackground(page: Page): Promise<void> {
  await page.evaluate(() => {
    const set = (hidden: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    set(true);
    set(false);
    window.dispatchEvent(new Event('focus'));
  });
}
