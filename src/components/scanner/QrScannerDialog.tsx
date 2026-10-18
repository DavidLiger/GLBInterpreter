"use client";
// Scanner QR interne (Î14) : fenêtre modale (primitive `Dialog` d'Î12) avec la caméra et le décodage continu par
// `@zxing/browser` (décision d'architecture : `BarcodeDetector` natif inégal selon les navigateurs, iOS compris).
//
// Chargé par `next/dynamic` depuis le menu de collection (`BookApp.tsx`) : ce fichier et `@zxing/*` forment un chunk à
// part, téléchargé avec le livre (il est dans `out/`, donc dans `book.json.files` et le Cache Storage) et servi hors ligne.
//
// - Flux `getUserMedia`, caméra arrière de préférence (`facingMode: { ideal: "environment" }`, la webcam d'un ordinateur
//   convient aussi). Le flux est arrêté (`stop()` de chaque piste) et le décodeur libéré à la lecture d'une scène, à la
//   fermeture, au démontage et avant une nouvelle tentative.
// - QR valide de ce livre (`sceneFromScan`, décision du 17/10, option c) : vibration courte (Android), puis `onScene`,
//   qui navigue par `goToScene` (règle `sceneAccess` : scène, quiz ou écran de blocage). Pas d'écran intermédiaire.
// - QR d'un autre livre ou d'un autre site : message, le scan continue. QR illisible : rien, le scan continue.
// - Contexte non sécurisé (pas de `getUserMedia` hors HTTPS), permission refusée, pas de caméra, caméra occupée : message
//   traduit, « Réessayer » (sauf contexte non sécurisé) et « Fermer ». Caméra coupée par le système pendant le scan :
//   « Impossible d'ouvrir la caméra », « Réessayer ».
// - Î16 : sur iPhone et iPad, refus de la caméra → `deniedIos` (« Réessayer » redemande l'autorisation ; iOS ne garde pas
//   la réponse d'une app web d'un lancement à l'autre, et l'app installée n'a pas de réglages de navigateur).
import { useEffect, useId, useRef, useState } from "react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import Dialog from "@/components/ui/Dialog";
import { useTranslation } from "@/contexts/TranslationContext";
import { sceneFromScan } from "@/components/book/scanTarget";
import { detectPlatform } from "@/components/book/install/platform";

type Status = "starting" | "scanning" | "insecure" | "denied" | "noCamera" | "busy" | "error";

interface QrScannerDialogProps {
  /** Adresse imprimée du livre (`book.json.origin`). */
  origin?: string;
  scenes: readonly string[];
  onClose: () => void;
  /** Scène de ce livre lue dans un QR. */
  onScene: (sceneId: string) => void;
}

/** Délai d'affichage du message « pas une page de ce livre » après la dernière lecture d'un tel QR. */
const FOREIGN_MESSAGE_MS = 3000;

function stopStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** Erreur de `getUserMedia` → message (noms du standard, puis anciens noms de Chrome). */
function statusOf(e: unknown): Status {
  const name = e instanceof Error || (e && typeof e === "object" && "name" in e) ? String((e as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "noCamera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "error";
}

export default function QrScannerDialog({ origin, scenes, onClose, onScene }: QrScannerDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [foreign, setForeign] = useState(false);
  /** Nouvelle tentative (« Réessayer ») : relance l'effet de la caméra. */
  const [attempt, setAttempt] = useState(0);
  const onSceneRef = useRef(onScene);
  useEffect(() => {
    onSceneRef.current = onScene;
  });

  useEffect(() => {
    let cancelled = false;
    let done = false;
    let stream: MediaStream | null = null;
    let controls: IScannerControls | null = null;
    let foreignTimer: ReturnType<typeof setTimeout> | undefined;
    const video = videoRef.current;

    const release = () => {
      controls?.stop();
      controls = null;
      stopStream(stream);
      stream = null;
      if (video) video.srcObject = null;
      clearTimeout(foreignTimer);
    };

    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!window.isSecureContext || !md?.getUserMedia) {
      setStatus("insecure");
      return;
    }
    setStatus("starting");
    setForeign(false);
    const pageRoot = new URL("./", window.location.href).href;

    (async () => {
      try {
        stream = await md.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        console.warn("Scanner : caméra indisponible :", e);
        if (!cancelled) setStatus(statusOf(e));
        return;
      }
      if (cancelled || !video) {
        release();
        return;
      }
      // Caméra coupée par le système (application en arrière-plan, caméra prise par une autre application) : sans cela,
      // l'aperçu resterait figé sans message. `stop()` par `release` n'émet pas `ended`.
      for (const track of stream.getVideoTracks()) {
        track.addEventListener("ended", () => {
          if (cancelled || done) return;
          release();
          setStatus("error");
        });
      }
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 150, delayBetweenScanSuccess: 300 });
      try {
        controls = await reader.decodeFromStream(stream, video, (result, _error, ctrl) => {
          // Sans résultat : image sans QR lisible, on continue à scanner.
          if (!result || cancelled || done) return;
          const r = sceneFromScan(result.getText(), { origin, pageRoot, scenes });
          if (r.kind === "scene") {
            done = true;
            ctrl.stop();
            release();
            try {
              navigator.vibrate?.(60);
            } catch {
              /* vibration non permise : sans importance */
            }
            onSceneRef.current(r.sceneId);
            return;
          }
          setForeign(true);
          clearTimeout(foreignTimer);
          foreignTimer = setTimeout(() => setForeign(false), FOREIGN_MESSAGE_MS);
        });
      } catch (e) {
        console.warn("Scanner : lecture du flux impossible :", e);
        release();
        if (!cancelled) setStatus("error");
        return;
      }
      if (cancelled) {
        release();
        return;
      }
      setStatus("scanning");
    })();

    return () => {
      cancelled = true;
      release();
    };
  }, [attempt, origin, scenes]);

  const failed = status !== "starting" && status !== "scanning";
  const failedMessage = status === "denied" && detectPlatform().ios ? t.scanner.deniedIos : failed ? t.scanner[status] : "";
  const message = failed ? failedMessage : status === "starting" ? t.scanner.starting : foreign ? t.scanner.foreign : "";

  return (
    <Dialog open onClose={onClose} labelledBy={titleId} className="glbi-dialog" testId="scanner-dialog">
      <div className="glbi-panel flex max-h-[inherit] flex-col items-center gap-4 overflow-y-auto p-5 text-center">
        <h2 id={titleId} className="text-xl font-bold">
          {t.scanner.title}
        </h2>
        {!failed && <p className="text-white/85">{t.scanner.instructions}</p>}
        <div className={`relative w-full max-w-[max(8rem,calc(100dvh-17rem))] ${failed ? "hidden" : ""}`}>
          <video
            ref={videoRef}
            className="aspect-square w-full rounded-xl bg-black object-cover"
            muted
            playsInline
            autoPlay
            aria-hidden="true"
            data-testid="scanner-video"
          />
          {/* Cadre de visée, décoratif */}
          <div className="pointer-events-none absolute inset-[12%] rounded-xl border-4 border-white/80" aria-hidden="true" />
        </div>
        <p className={`min-h-6 max-w-sm ${failed ? "text-white" : foreign ? "font-semibold text-amber-300" : "text-white/70"}`} role="status" aria-live="polite" data-testid="scanner-status">
          {message}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {failed && status !== "insecure" && (
            <button type="button" className="glbi-btn glbi-btn-primary" onClick={() => setAttempt((a) => a + 1)} data-testid="scanner-retry">
              {t.common.retry}
            </button>
          )}
          <button type="button" className={`glbi-btn ${failed ? "glbi-btn-outline" : "glbi-btn-secondary"}`} onClick={onClose} data-testid="scanner-close">
            {t.common.close}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
