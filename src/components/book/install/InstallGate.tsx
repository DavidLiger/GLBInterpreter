"use client";

// Écran « Installer le livre » (Î8, ancien L10C.9 ; exigence 1). Rien du livre ne s'affiche avant que tous ses
// fichiers soient dans le Cache Storage et vérifiés : pas de lecture pendant le téléchargement, pas de « Plus tard »
// pour une première installation. Une mise à jour (book.json du réseau différent de l'index installé) peut être
// remise à plus tard : la version installée est complète.
//
// En `npm run dev`, l'écran est contourné (pas de book.json ni de service worker hors export) : tester dans `out/`.
//
// Î9 : avant toute vérification, un iPhone ou un iPad voit l'écran « version iPhone à venir » (D-8.8, à retirer en
// Î16 ; sauté dans un build d'essai iOS, `IOS_TRIAL` de `platform.ts`) et un navigateur intégré (Instagram,
// Facebook…) l'écran « Ouvrez le livre dans Chrome » (D-6.2 C) : rien n'y est
// téléchargé. Sur Chrome (Android, ordinateur), le bouton « Ajouter à l'écran d'accueil » utilise `beforeinstallprompt`.
// Î16 (D-16.4) : sur iPhone et iPad dans Safari (hors app installée), un livre absent passe d'abord par l'écran de
// guidage vers l'écran d'accueil (`IosGuide`), avec « Continuer dans Safari » vers l'installation habituelle.
//
// Î12 (U-02) : chaque écran est rendu par la primitive `<dialog>` (`ui/Dialog.tsx`) en mode non modal et non fermable :
// rôle « dialogue » nommé par le titre de l'écran, focus posé sur ce titre à chaque changement d'écran (annoncé par les
// lecteurs d'écran), Échap sans effet. Non modal : rien du livre n'est monté derrière, et l'invite de mise à jour du
// service worker comme la console de débogage (`#/debug`) doivent rester utilisables. Sélecteur de langue en haut à
// droite ; contenu dans les zones sûres ; boutons au style du livre (44 px).
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import { LOCALES } from "@/i18n/messages";
import Dialog from "@/components/ui/Dialog";
import LanguageSelector from "@/components/diorama/ui/LanguageSelector";
import { bookBaseUrl, fetchRemoteIndex, sameFiles, totalBytes, type BookFilesIndex } from "./bookIndex";
import { cacheStorageAvailable, missingFiles, readInstalledIndex, remainingBytes } from "./bookCache";
import { InstallError, installBook, type InstallErrorKind, type InstallProgress } from "./downloader";
import { readTrace, type InstallTrace } from "./trace";
import { chromeIntentUrl, detectPlatform, IOS_TRIAL, isInstalledApp, shareableUrl, type Platform } from "./platform";
import { getInstallPromptState, promptInstall, useInstallPrompt } from "./installPrompt";
import { parseSceneHash } from "../sceneRoute";

type Mode = "install" | "update" | "repair";

type PromptState = { s: "prompt"; index: BookFilesIndex; mode: Mode; missingBytes: number; available: number | null };

type State =
  | { s: "checking" }
  | { s: "ready" }
  | { s: "ios" }
  | { s: "inapp"; app: string; android: boolean }
  | { s: "done" }
  | { s: "offline" }
  | { s: "unsupported" }
  | { s: "invalid"; message: string }
  | PromptState
  /** Î16 : iPhone ou iPad dans Safari, livre absent : guidage vers l'écran d'accueil ; `prompt` si « Continuer dans Safari ». */
  | { s: "iosGuide"; prompt: PromptState }
  | { s: "downloading"; index: BookFilesIndex; mode: Mode; progress: InstallProgress | null }
  | { s: "failed"; index: BookFilesIndex; mode: Mode; kind: InstallErrorKind; detail: string };

/** Taille en Mo au format de la langue (Î12 : « 6,9 Mo » en français et en espagnol, « 6.9 MB » en anglais). */
const toMB = (n: number, lang: keyof typeof LOCALES) => {
  const digits = n < 10 * 1048576 ? 1 : 0;
  return (n / 1048576).toLocaleString(LOCALES[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

async function availableSpace(): Promise<number | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e?.quota !== undefined ? e.quota - (e.usage ?? 0) : null;
  } catch {
    return null;
  }
}

/** Attend que le service worker contrôle la page (1re installation), pour que la lecture passe par le cache. */
async function waitForController(ms = 3000): Promise<void> {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator) || navigator.serviceWorker.controller) return;
  await Promise.race([
    new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true })),
    new Promise((r) => setTimeout(r, ms)),
  ]);
  if (!navigator.serviceWorker.controller) console.warn("Service worker absent : les fichiers sont lus dans le cache par la page seulement");
}

const primary = "glbi-btn glbi-btn-primary px-8 py-3 font-bold";
const secondary = "glbi-btn glbi-btn-secondary";

export default function InstallGate({ children }: { children: ReactNode }) {
  const { t, lang } = useTranslation();
  const titleId = useId();
  const titleRef = useRef<HTMLElement | null>(null);
  const MB = (n: number) => `${toMB(n, lang)} ${t.install.megabytes}`;
  const [state, setState] = useState<State>({ s: "checking" });
  const [trace] = useState<InstallTrace | null>(() => (typeof window === "undefined" ? null : readTrace()));
  const [platform] = useState<Platform | null>(() => (typeof window === "undefined" ? null : detectPlatform()));
  const abortRef = useRef<AbortController | null>(null);
  /** Dernière progression affichée : gardée à la reprise jusqu'au recomptage de l'acquis (pas de retour à 0 %). */
  const lastProgressRef = useRef<InstallProgress | null>(null);
  /** Titre du livre lu dans `book.json` (réseau ou version installée) : titre du document pendant l'installation. */
  const [bookTitle, setBookTitle] = useState<Partial<Record<string, string>> | null>(null);
  useEffect(() => {
    const title = bookTitle?.[lang];
    if (title) document.title = title;
  }, [bookTitle, lang]);

  const check = useCallback(async () => {
    setState({ s: "checking" });
    if (process.env.NODE_ENV === "development") {
      console.info("Installation du livre ignorée en développement (tester l'installation dans le dossier exporté)");
      setState({ s: "ready" });
      return;
    }
    const p = detectPlatform();
    if (p.ios && IOS_TRIAL) {
      console.info("Build d'essai iOS (Î16) : écran « version iPhone à venir » sauté");
    } else if (p.ios) {
      setState({ s: "ios" });
      return;
    }
    if (p.inApp) {
      setState({ s: "inapp", app: p.inApp, android: p.android });
      return;
    }
    if (!(await cacheStorageAvailable())) {
      setState({ s: "unsupported" });
      return;
    }
    const base = bookBaseUrl();
    let remote: BookFilesIndex | null;
    try {
      remote = await fetchRemoteIndex(base);
    } catch (e) {
      setState({ s: "invalid", message: (e as Error).message });
      return;
    }
    const installed = await readInstalledIndex(base);
    setBookTitle(titleOf(remote ?? installed?.index));

    // Hors ligne : seule la version installée compte.
    if (!remote) {
      if (installed && (await missingFiles(installed.index, base)).length === 0) {
        await waitForController();
        setState({ s: "ready" });
      } else setState({ s: "offline" });
      return;
    }

    let mode: Mode = "install";
    if (installed) {
      const missingInstalled = await missingFiles(installed.index, base);
      if (sameFiles(installed.index, remote)) {
        if (missingInstalled.length === 0) {
          await waitForController();
          setState({ s: "ready" });
          return;
        }
        mode = "repair";
      } else mode = missingInstalled.length === 0 ? "update" : "repair";
    }
    const prompt: PromptState = { s: "prompt", index: remote, mode, missingBytes: await remainingBytes(remote, base), available: await availableSpace() };
    // Î16 (D-16.4) : sur iOS, hors app installée, guidage avant tout téléchargement (Safari et l'app ont des stockages
    // séparés, et Safari efface les données d'un site non installé après quelques jours sans visite). Un livre déjà
    // installé dans Safari (« Continuer dans Safari ») se met à jour ou se complète sans guidage.
    setState(mode === "install" && p.ios && !isInstalledApp() ? { s: "iosGuide", prompt } : prompt);
  }, []);

  useEffect(() => {
    void check();
    return () => abortRef.current?.abort();
  }, [check]);

  const start = useCallback(async (index: BookFilesIndex, mode: Mode) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ s: "downloading", index, mode, progress: lastProgressRef.current });
    try {
      await installBook(index, {
        signal: ctrl.signal,
        onProgress: (progress) => {
          lastProgressRef.current = progress;
          setState({ s: "downloading", index, mode, progress });
        },
      });
      if (mode === "update") {
        // Nouvelle version de l'application dans le cache : on la recharge (aucune scène n'est ouverte ici).
        window.location.reload();
        return;
      }
      await waitForController();
      // Première installation sur Chrome : proposer l'écran d'accueil avant d'ouvrir le livre.
      const prompt = getInstallPromptState();
      setState(mode === "install" && prompt.canPrompt && !prompt.installed ? { s: "done" } : { s: "ready" });
    } catch (e) {
      const err = e instanceof InstallError ? e : new InstallError("other", (e as Error)?.message ?? String(e));
      console.error("Installation du livre :", err);
      if (!ctrl.signal.aborted || err.kind === "aborted") setState({ s: "failed", index, mode, kind: err.kind, detail: err.message });
    }
  }, []);

  // Écran changé : focus sur son titre (pas à chaque progression du téléchargement).
  const screen = state.s === "prompt" || state.s === "downloading" || state.s === "failed" ? `${state.s}:${state.mode}` : state.s;
  useEffect(() => {
    if (screen !== "ready") titleRef.current?.focus({ preventScroll: true });
  }, [screen]);

  if (state.s === "ready") return <>{children}</>;

  const title = (text: string) => (
    <h1 id={titleId} ref={(el) => void (titleRef.current = el)} tabIndex={-1} className="text-2xl font-bold outline-none">
      {text}
    </h1>
  );

  return (
    <Dialog open modal={false} labelledBy={titleId} className="glbi-screen" testId="install-gate">
      <div className="glbi-corner-top-right z-10">
        <LanguageSelector />
      </div>
      <div className="glbi-safe-padding min-h-full flex flex-col items-center justify-center gap-5 text-center max-w-md mx-auto" style={{ paddingTop: "calc(var(--safe-top) + 3.75rem)" }}>
        {state.s === "checking" && (
          <p id={titleId} ref={(el) => void (titleRef.current = el)} tabIndex={-1} className="text-white/80 outline-none">
            {t.install.checking}
          </p>
        )}

        {state.s === "offline" && <Notice title={title(t.install.offlineTitle)} text={t.install.offline} action={t.install.retry} onAction={check} />}
        {state.s === "unsupported" && <Notice title={title(t.install.unsupportedTitle)} text={t.install.unsupported} />}
        {state.s === "invalid" && <Notice title={title(t.install.invalidTitle)} text={state.message} action={t.install.retry} onAction={check} />}
        {state.s === "ios" && <Notice title={title(t.install.iosTitle)} text={t.install.ios} />}
        {state.s === "iosGuide" && <IosGuide title={title(t.install.iosGuideTitle)} onSafari={() => setState(state.prompt)} />}
        {state.s === "inapp" && <InAppBrowser title={title(t.install.inAppTitle)} app={state.app} android={state.android} />}

        {state.s === "done" && (
          <>
            {title(t.install.doneTitle)}
            <p className="text-white/80">{t.install.done}</p>
            <AddToHomeScreen primary />
            <button type="button" onClick={() => setState({ s: "ready" })} className={secondary}>
              {t.install.openBook}
            </button>
          </>
        )}

        {(state.s === "prompt" || state.s === "downloading" || state.s === "failed") && (
          <>
            {title(state.mode === "update" ? t.install.updateTitle : state.mode === "repair" ? t.install.repairTitle : t.install.title)}
            <p className="text-white/80">
              {state.mode === "update" ? t.install.updateIntro : state.mode === "repair" ? t.install.repairIntro : t.install.intro}
            </p>
          </>
        )}

        {state.s === "prompt" && (
          <>
            <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-sm text-white/80">
              <dt>{t.install.bookSize}</dt>
              <dd className="text-right">{MB(totalBytes(state.index.files))}</dd>
              <dt>{t.install.toDownload}</dt>
              <dd className="text-right">{MB(state.missingBytes)}</dd>
              {state.available !== null && (
                <>
                  <dt>{t.install.available}</dt>
                  <dd className="text-right">{MB(state.available)}</dd>
                </>
              )}
            </dl>
            {state.available !== null && state.available < state.missingBytes * 1.1 && (
              <p className="text-amber-300 text-sm">{t.install.lowSpace}</p>
            )}
            <p className="text-white/60 text-sm">{t.install.wifi}</p>
            {platform?.firefoxDesktop && <p className="text-white/60 text-sm">{t.install.firefoxDesktop}</p>}
            {trace?.state === "running" && (
              <p className="text-white/50 text-xs">
                {t.install.interrupted} {trace.step} ({formatDate(trace.at, lang)})
              </p>
            )}
            <button type="button" onClick={() => start(state.index, state.mode)} className={primary}>
              {state.mode === "update" ? t.install.update : t.install.install}
            </button>
            {state.mode === "update" && (
              <button type="button" onClick={() => setState({ s: "ready" })} className="glbi-btn glbi-btn-link">
                {t.install.keepCurrent}
              </button>
            )}
            <AddToHomeScreen />
          </>
        )}

        {state.s === "downloading" && (
          <>
            <ProgressBar progress={state.progress} />
            <p className="text-white/60 text-sm">{t.install.wifi}</p>
            <button type="button" onClick={() => abortRef.current?.abort()} className={secondary}>
              {t.install.pause}
            </button>
            <AddToHomeScreen />
          </>
        )}

        {state.s === "failed" && (
          <>
            <p className={state.kind === "aborted" ? "text-white/80" : "text-amber-300"}>
              {state.kind === "aborted"
                ? t.install.paused
                : state.kind === "network"
                  ? t.install.errorNetwork
                  : state.kind === "integrity"
                    ? t.install.errorIntegrity
                    : state.kind === "quota"
                      ? t.install.errorQuota
                      : t.install.errorOther}
            </p>
            {state.kind !== "aborted" && <p className="text-white/60 text-xs break-all">{state.detail}</p>}
            <button type="button" onClick={() => start(state.index, state.mode)} className={primary}>
              {t.install.resume}
            </button>
            <AddToHomeScreen />
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Titre traduit de `book.json` (champ `title` du livre, absent de la cartouche de test). */
function titleOf(index: BookFilesIndex | null | undefined): Partial<Record<string, string>> | null {
  const title = (index as { title?: unknown } | null | undefined)?.title;
  return title && typeof title === "object" ? (title as Partial<Record<string, string>>) : null;
}

/** Date de la trace d'installation dans la langue du lecteur (au lieu du format du navigateur). */
function formatDate(iso: string, lang: keyof typeof LOCALES): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(LOCALES[lang], { dateStyle: "short", timeStyle: "short" });
  } catch {
    return d.toLocaleString(LOCALES[lang]);
  }
}

function ProgressBar({ progress }: { progress: InstallProgress | null }) {
  const { t, lang } = useTranslation();
  const MB = (n: number) => `${toMB(n, lang)} ${t.install.megabytes}`;
  const ratio = progress && progress.totalBytes > 0 ? Math.min(1, progress.doneBytes / progress.totalBytes) : 0;
  return (
    <div className="w-full flex flex-col gap-2" aria-live="polite">
      <div
        className="h-3 w-full rounded-full bg-white/15 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={t.install.downloading}
      >
        <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="text-sm text-white/80">
        {t.install.downloading} {Math.round(ratio * 100)} %
        {progress && ` — ${MB(progress.doneBytes)} / ${MB(progress.totalBytes)} — ${progress.doneFiles}/${progress.totalFiles} ${t.install.files}`}
      </p>
      {progress?.current && <p className="text-xs text-white/60 break-all">{progress.current}</p>}
    </div>
  );
}

function Notice({ title, text, action, onAction }: { title: ReactNode; text: string; action?: string; onAction?: () => void }) {
  return (
    <>
      {title}
      <p className="text-white/80">{text}</p>
      {action && onAction && (
        <button type="button" onClick={onAction} className={primary}>
          {action}
        </button>
      )}
    </>
  );
}

/** Bouton « Ajouter à l'écran d'accueil » (Chrome) ; rien si le prompt n'est pas disponible ou l'app déjà installée. */
function AddToHomeScreen({ primary: isPrimary = false }: { primary?: boolean }) {
  const { t } = useTranslation();
  const { canPrompt, installed } = useInstallPrompt();
  if (installed) return isPrimary ? <p className="text-white/80 text-sm">{t.install.addedToHome}</p> : null;
  if (!canPrompt) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => void promptInstall()} className={isPrimary ? primary : "glbi-btn glbi-btn-outline"}>
        {t.install.addToHome}
      </button>
      <p className="text-white/50 text-xs">{t.install.addToHomeHint}</p>
    </div>
  );
}

/**
 * Î16 (D-16.4) : guidage iOS vers l'écran d'accueil (Safari sur iPhone ou iPad, livre non installé). Pictogrammes dessinés
 * ici (aucune image d'Apple), icône réelle du livre à l'étape 3. Le lecteur qui a déjà l'app arrive ici quand il scanne
 * avec l'appareil photo d'iOS (le lien s'ouvre toujours dans Safari) : la phrase « Déjà ajouté ? » vient en premier.
 */
function IosGuide({ title, onSafari }: { title: ReactNode; onSafari: () => void }) {
  const { t } = useTranslation();
  const steps: [ReactNode, string][] = [
    [<GuideIcon key="share" kind="share" />, t.install.iosGuideStep1],
    [<GuideIcon key="add" kind="add" />, t.install.iosGuideStep2],
    [<img key="icon" src="apple-touch-icon.png" alt="" className="h-11 w-11 rounded-xl" />, t.install.iosGuideStep3],
  ];
  return (
    <>
      {title}
      <p className="rounded-2xl bg-white/10 px-4 py-3 text-white">{t.install.iosGuideAlready}</p>
      <p className="text-white/80">{t.install.iosGuideIntro}</p>
      <ol className="flex w-full flex-col gap-3 text-left">
        {steps.map(([icon, text], i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center" aria-hidden="true">
              {icon}
            </span>
            <span className="text-white/90">
              <span className="font-bold">{i + 1}. </span>
              {text}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-white/60 text-sm">{t.install.iosGuideCamera}</p>
      <button type="button" onClick={onSafari} className="glbi-btn glbi-btn-link">
        {t.install.iosGuideSafari}
      </button>
      <p className="text-white/50 text-xs">{t.install.iosGuideSafariNote}</p>
    </>
  );
}

/** Pictogrammes du guidage iOS : partage (carré et flèche vers le haut), ajout (carré et plus). */
function GuideIcon({ kind }: { kind: "share" | "add" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {kind === "share" ? (
        <>
          <path d="M8 9H6.5A1.5 1.5 0 0 0 5 10.5v9A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 17.5 9H16" />
          <path d="M12 14V3M8.5 6.5 12 3l3.5 3.5" />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3.5" />
          <path d="M12 8.5v7M8.5 12h7" />
        </>
      )}
    </svg>
  );
}

/** Navigateur intégré (D-6.2 C) : aucun téléchargement ; ouvrir la même adresse (scène comprise) dans Chrome. */
function InAppBrowser({ title, app, android }: { title: ReactNode; app: string; android: boolean }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = shareableUrl(parseSceneHash(window.location.hash));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt(t.install.copyLink, url);
    }
  };
  return (
    <>
      {title}
      <p className="text-white/80">{(android ? t.install.inApp : t.install.inAppOther).replace("{app}", app)}</p>
      {android && (
        <a href={chromeIntentUrl(url)} className={primary}>
          {t.install.openInChrome}
        </a>
      )}
      <button type="button" onClick={copy} className={secondary}>
        {copied ? t.install.linkCopied : t.install.copyLink}
      </button>
      <p className="text-white/60 text-xs break-all select-all">{url}</p>
    </>
  );
}
