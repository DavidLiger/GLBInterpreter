// Journal des sons joués par Web Audio (Î11 ; partagé avec les actions combinées, AC2).
//
// Un script injecté note chaque son lancé (`AudioBufferSourceNode.start`) : hauteur estimée sur les échantillons décodés,
// boucle, instant de départ, arrêt (`stop`) ou fin naturelle (`ended`) avec leur instant (`performance.now()`). Aucun son
// n'est écouté : on vérifie que le bon son part et s'arrête, et quand.
import type { Page } from '@playwright/test';

export interface AudioLogEntry {
  freq: number;
  loop: boolean;
  stopped: boolean;
  ended: boolean;
  at: number;
  stoppedAt?: number;
  endedAt?: number;
}

declare global {
  interface Window {
    __audioLog: AudioLogEntry[];
    /** Instant où la barre des boutons revient à `idle` (`watchIdle`). */
    __idleAt?: number;
  }
}

export const INSTRUMENT = () => {
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
      const entry: AudioLogEntry = { freq: estimate(this.buffer), loop: this.loop, stopped: false, ended: false, at: performance.now() };
      this.__i = window.__audioLog.push(entry) - 1;
      this.addEventListener('ended', () => {
        entry.ended = true;
        entry.endedAt ??= performance.now();
      });
    }
    return start.apply(this, a);
  };
  P.stop = function (this: AudioBufferSourceNode & { __i?: number }, ...a: [number?]) {
    if (this.__i !== undefined) {
      const entry = window.__audioLog[this.__i];
      if (!entry.stopped) entry.stoppedAt = performance.now();
      entry.stopped = true;
    }
    return stop.apply(this, a);
  };
};

/** Note dans `window.__idleAt` l'instant où la barre des boutons revient à `idle` (attribut `data-current-action` vide). */
export async function watchIdle(page: Page): Promise<void> {
  await page.evaluate(() => {
    delete window.__idleAt;
    const bar = document.querySelector('[data-testid="action-buttons"]');
    if (!bar) return;
    new MutationObserver((_, obs) => {
      if (bar.getAttribute('data-current-action') === '') {
        window.__idleAt = performance.now();
        obs.disconnect();
      }
    }).observe(bar, { attributes: true, attributeFilter: ['data-current-action'] });
  });
}
