// Ajout à l'écran d'accueil sur Android (Chrome, Î9) : `beforeinstallprompt` est capturé dès le chargement du module
// (il peut arriver avant le montage de l'écran d'installation), puis proposé par un bouton. Le prompt ne peut être
// affiché qu'une fois par événement ; Chrome ne le déclenche pas si l'application est déjà installée.
import { useSyncExternalStore } from 'react';
import { isInstalledApp } from './platform';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallPromptState {
  /** Un prompt est disponible (Chrome Android ou ordinateur). */
  canPrompt: boolean;
  /** Ajout fait dans cette session (`appinstalled`) ou page ouverte depuis l'icône. */
  installed: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallPromptState = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();

function set(next: Partial<InstallPromptState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  state = { canPrompt: false, installed: isInstalledApp() };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // pas de mini-barre de Chrome : le bouton du livre la remplace
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
}

/** Affiche le prompt d'installation ; renvoie true si l'utilisateur accepte. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  set({ canPrompt: false });
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted';
  } catch (err) {
    console.warn("Ajout à l'écran d'accueil impossible :", err);
    return false;
  }
}

/** État courant, hors React (fin de téléchargement). */
export function getInstallPromptState(): InstallPromptState {
  return state;
}

const SERVER_STATE: InstallPromptState = { canPrompt: false, installed: false };

export function useInstallPrompt(): InstallPromptState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER_STATE,
  );
}
