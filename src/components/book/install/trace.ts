// Trace « dernière étape atteinte » (Î8, test sur iPhone sans Mac). Écrite en localStorage à chaque étape du
// téléchargement et de la recomposition : si l'onglet est tué (mémoire), le relancement l'affiche. Lecture aussi
// possible dans la console de débogage (`#/debug`) : localStorage, clé `glbi:install-trace`.
export const TRACE_KEY = 'glbi:install-trace';

export interface InstallTrace {
  /** `running` laissé en place = la session précédente s'est arrêtée sans finir ni signaler d'erreur. */
  state: 'running' | 'done' | 'paused' | 'error';
  step: string;
  at: string;
}

export function writeTrace(state: InstallTrace['state'], step: string): void {
  try {
    localStorage.setItem(TRACE_KEY, JSON.stringify({ state, step, at: new Date().toISOString() } satisfies InstallTrace));
  } catch {
    /* stockage indisponible : la trace est une aide au diagnostic, pas une fonction */
  }
}

export function readTrace(): InstallTrace | null {
  try {
    const raw = localStorage.getItem(TRACE_KEY);
    return raw ? (JSON.parse(raw) as InstallTrace) : null;
  } catch {
    return null;
  }
}
