"use client";

// Écran « Installer le livre » (Î8, ancien L10C.9 ; exigence 1). Rien du livre ne s'affiche avant que tous ses
// fichiers soient dans le Cache Storage et vérifiés : pas de lecture pendant le téléchargement, pas de « Plus tard »
// pour une première installation. Une mise à jour (book.json du réseau différent de l'index installé) peut être
// remise à plus tard : la version installée est complète.
//
// En `npm run dev`, l'écran est contourné (pas de book.json ni de service worker hors export) : tester dans `out/`.
//
// Î9 : avant toute vérification, un iPhone ou un iPad voit l'écran « version iPhone à venir » (D-8.8, à retirer en
// Î16) et un navigateur intégré (Instagram, Facebook…) l'écran « Ouvrez le livre dans Chrome » (D-6.2 C) : rien n'y est
// téléchargé. Sur Chrome (Android, ordinateur), le bouton « Ajouter à l'écran d'accueil » utilise `beforeinstallprompt`.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import { bookBaseUrl, fetchRemoteIndex, sameFiles, totalBytes, type BookFilesIndex } from "./bookIndex";
import { cacheStorageAvailable, missingFiles, readInstalledIndex, remainingBytes } from "./bookCache";
import { InstallError, installBook, type InstallErrorKind, type InstallProgress } from "./downloader";
import { readTrace, type InstallTrace } from "./trace";
import { chromeIntentUrl, detectPlatform, shareableUrl, type Platform } from "./platform";
import { getInstallPromptState, promptInstall, useInstallPrompt } from "./installPrompt";
import { parseSceneHash } from "../sceneRoute";

type Mode = "install" | "update" | "repair";

type State =
  | { s: "checking" }
  | { s: "ready" }
  | { s: "ios" }
  | { s: "inapp"; app: string; android: boolean }
  | { s: "done" }
  | { s: "offline" }
  | { s: "unsupported" }
  | { s: "invalid"; message: string }
  | { s: "prompt"; index: BookFilesIndex; mode: Mode; missingBytes: number; available: number | null }
  | { s: "downloading"; index: BookFilesIndex; mode: Mode; progress: InstallProgress | null }
  | { s: "failed"; index: BookFilesIndex; mode: Mode; kind: InstallErrorKind; detail: string };

const toMB = (n: number) => (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0);

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

export default function InstallGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const MB = (n: number) => `${toMB(n)} ${t.install.megabytes}`;
  const [state, setState] = useState<State>({ s: "checking" });
  const [trace] = useState<InstallTrace | null>(() => (typeof window === "undefined" ? null : readTrace()));
  const [platform] = useState<Platform | null>(() => (typeof window === "undefined" ? null : detectPlatform()));
  const abortRef = useRef<AbortController | null>(null);
  /** Dernière progression affichée : gardée à la reprise jusqu'au recomptage de l'acquis (pas de retour à 0 %). */
  const lastProgressRef = useRef<InstallProgress | null>(null);

  const check = useCallback(async () => {
    setState({ s: "checking" });
    if (process.env.NODE_ENV === "development") {
      console.info("Installation du livre ignorée en développement (tester l'installation dans le dossier exporté)");
      setState({ s: "ready" });
      return;
    }
    const p = detectPlatform();
    if (p.ios) {
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
    setState({ s: "prompt", index: remote, mode, missingBytes: await remainingBytes(remote, base), available: await availableSpace() });
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

  if (state.s === "ready") return <>{children}</>;

  return (
    <main className="fixed inset-0 z-[9999] overflow-y-auto bg-black text-white">
      <div className="min-h-full flex flex-col items-center justify-center gap-5 p-6 text-center max-w-md mx-auto">
        {state.s === "checking" && <p className="text-white/80">{t.install.checking}</p>}

        {state.s === "offline" && <Notice title={t.install.offlineTitle} text={t.install.offline} action={t.install.retry} onAction={check} />}
        {state.s === "unsupported" && <Notice title={t.install.unsupportedTitle} text={t.install.unsupported} />}
        {state.s === "invalid" && <Notice title={t.install.invalidTitle} text={state.message} action={t.install.retry} onAction={check} />}
        {state.s === "ios" && <Notice title={t.install.iosTitle} text={t.install.ios} />}
        {state.s === "inapp" && <InAppBrowser app={state.app} android={state.android} />}

        {state.s === "done" && (
          <>
            <h1 className="text-2xl font-bold">{t.install.doneTitle}</h1>
            <p className="text-white/80">{t.install.done}</p>
            <AddToHomeScreen primary />
            <button onClick={() => setState({ s: "ready" })} className="min-h-11 px-6 py-2 rounded-full bg-white/15">
              {t.install.openBook}
            </button>
          </>
        )}

        {(state.s === "prompt" || state.s === "downloading" || state.s === "failed") && (
          <>
            <h1 className="text-2xl font-bold">
              {state.mode === "update" ? t.install.updateTitle : state.mode === "repair" ? t.install.repairTitle : t.install.title}
            </h1>
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
                {t.install.interrupted} {trace.step} ({new Date(trace.at).toLocaleString()})
              </p>
            )}
            <button
              onClick={() => start(state.index, state.mode)}
              className="min-h-11 px-8 py-3 rounded-full bg-white text-black font-bold"
            >
              {state.mode === "update" ? t.install.update : t.install.install}
            </button>
            {state.mode === "update" && (
              <button onClick={() => setState({ s: "ready" })} className="min-h-11 px-6 py-2 text-white/70 underline">
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
            <button onClick={() => abortRef.current?.abort()} className="min-h-11 px-6 py-2 rounded-full bg-white/15">
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
            {state.kind !== "aborted" && <p className="text-white/40 text-xs break-all">{state.detail}</p>}
            <button
              onClick={() => start(state.index, state.mode)}
              className="min-h-11 px-8 py-3 rounded-full bg-white text-black font-bold"
            >
              {t.install.resume}
            </button>
            <AddToHomeScreen />
          </>
        )}
      </div>
    </main>
  );
}

function ProgressBar({ progress }: { progress: InstallProgress | null }) {
  const { t } = useTranslation();
  const MB = (n: number) => `${toMB(n)} ${t.install.megabytes}`;
  const ratio = progress && progress.totalBytes > 0 ? Math.min(1, progress.doneBytes / progress.totalBytes) : 0;
  return (
    <div className="w-full flex flex-col gap-2" aria-live="polite">
      <div
        className="h-3 w-full rounded-full bg-white/15 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="text-sm text-white/80">
        {t.install.downloading} {Math.round(ratio * 100)} %
        {progress && ` — ${MB(progress.doneBytes)} / ${MB(progress.totalBytes)} — ${progress.doneFiles}/${progress.totalFiles} ${t.install.files}`}
      </p>
      {progress?.current && <p className="text-xs text-white/40 break-all">{progress.current}</p>}
    </div>
  );
}

function Notice({ title, text, action, onAction }: { title: string; text: string; action?: string; onAction?: () => void }) {
  return (
    <>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-white/80">{text}</p>
      {action && onAction && (
        <button onClick={onAction} className="min-h-11 px-8 py-3 rounded-full bg-white text-black font-bold">
          {action}
        </button>
      )}
    </>
  );
}

/** Bouton « Ajouter à l'écran d'accueil » (Chrome) ; rien si le prompt n'est pas disponible ou l'app déjà installée. */
function AddToHomeScreen({ primary = false }: { primary?: boolean }) {
  const { t } = useTranslation();
  const { canPrompt, installed } = useInstallPrompt();
  if (installed) return primary ? <p className="text-white/80 text-sm">{t.install.addedToHome}</p> : null;
  if (!canPrompt) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => void promptInstall()}
        className={primary ? "min-h-11 px-8 py-3 rounded-full bg-white text-black font-bold" : "min-h-11 px-6 py-2 rounded-full border border-white/40"}
      >
        {t.install.addToHome}
      </button>
      <p className="text-white/50 text-xs">{t.install.addToHomeHint}</p>
    </div>
  );
}

/** Navigateur intégré (D-6.2 C) : aucun téléchargement ; ouvrir la même adresse (scène comprise) dans Chrome. */
function InAppBrowser({ app, android }: { app: string; android: boolean }) {
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
      <h1 className="text-2xl font-bold">{t.install.inAppTitle}</h1>
      <p className="text-white/80">{(android ? t.install.inApp : t.install.inAppOther).replace("{app}", app)}</p>
      {android && (
        <a href={chromeIntentUrl(url)} className="min-h-11 px-8 py-3 rounded-full bg-white text-black font-bold">
          {t.install.openInChrome}
        </a>
      )}
      <button onClick={copy} className="min-h-11 px-6 py-2 rounded-full bg-white/15">
        {copied ? t.install.linkCopied : t.install.copyLink}
      </button>
      <p className="text-white/40 text-xs break-all select-all">{url}</p>
    </>
  );
}
