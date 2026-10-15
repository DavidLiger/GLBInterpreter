"use client";

// Atelier de configuration, A2 (lecture seule) — spec-atelier-glbi.md §9 et §10.
// Barre du haut (livre, scène dans l'ordre de book.json, langue d'aperçu), lecteur réel au centre (`WebDioramaLoader`
// sur l'objet fusionné `draft`, mode `buttons`), onglets Rapport et Diagnostic. Le serveur (scripts/atelier/server.ts)
// prévient la page de toute modification du dossier source (SSE) : rapport relu, lecteur remonté si la scène affichée
// dépend du fichier modifié (réexport du GLB depuis Blender, edit.json, assets).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WebDioramaLoader, { type ReaderEngine } from "@/components/diorama/WebDioramaLoader";
import { ATELIER_MARKER, type BookResponse, type ChangeEvent, type SceneResponse } from "./api";
import DiagnosticTab from "./DiagnosticTab";
import ReportTab from "./ReportTab";
import { readerSceneOf, sceneFiles } from "./readerFromScene";

type Lang = "fr" | "en" | "es";
const LANGS: Lang[] = ["fr", "en", "es"];
/** Clé de langue du lecteur (TranslationContext) : la langue d'aperçu y est écrite avant de remonter le lecteur. */
const LANG_KEY = "webdiorama-lang";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `${path} : HTTP ${res.status}`);
  return body as T;
}

function hashScene(): string | null {
  const m = /^#\/s\/([^/]+)$/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Langue d'aperçu enregistrée ; sinon le français, écrit pour que le lecteur ne suive pas la langue du navigateur. */
function readLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "fr" || v === "en" || v === "es") return v;
    localStorage.setItem(LANG_KEY, "fr");
  } catch {
    // stockage indisponible : le lecteur suit la langue du navigateur
  }
  return "fr";
}

export default function Atelier() {
  const [book, setBook] = useState<BookResponse | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [scene, setScene] = useState<SceneResponse | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("fr");
  const [reload, setReload] = useState(0);
  const [engine, setEngine] = useState<ReaderEngine | null>(null);
  const [tab, setTab] = useState<"rapport" | "diagnostic">("rapport");
  const [live, setLive] = useState(false);
  const [lastChange, setLastChange] = useState<string | null>(null);
  const sceneIdRef = useRef<string | null>(null);
  const sceneRef = useRef<SceneResponse | null>(null);
  sceneIdRef.current = sceneId;
  sceneRef.current = scene;

  const loadBook = useCallback(async () => {
    try {
      const b = await getJson<BookResponse>("__api/book");
      setBook(b);
      setBookError(null);
      return b;
    } catch (e) {
      setBookError((e as Error).message);
      return null;
    }
  }, []);

  const loadScene = useCallback(async (id: string) => {
    try {
      const s = await getJson<SceneResponse>(`__api/scene/${encodeURIComponent(id)}`);
      if (sceneIdRef.current !== id) return null;
      setScene(s);
      setSceneError(null);
      return s;
    } catch (e) {
      if (sceneIdRef.current === id) setSceneError((e as Error).message);
      return null;
    }
  }, []);

  // Démarrage : langue d'aperçu, livre, scène du hash (#/s/<scène>) ou première scène.
  useEffect(() => {
    setLang(readLang());
    void loadBook().then((b) => {
      if (!b) return;
      const wanted = hashScene();
      const id = wanted && b.scenes.some((s) => s.id === wanted) ? wanted : (b.scenes[0]?.id ?? null);
      setSceneId(id);
    });
  }, [loadBook]);

  useEffect(() => {
    if (!sceneId) return;
    setScene(null);
    setEngine(null);
    if (hashScene() !== sceneId) history.replaceState(null, "", `#/s/${encodeURIComponent(sceneId)}`);
    void loadScene(sceneId);
  }, [sceneId, loadScene]);

  // Modifications du dossier source (serveur, SSE).
  useEffect(() => {
    const es = new EventSource("__api/events");
    let generation: number | null = null;
    es.addEventListener("hello", (e) => {
      setLive(true);
      const g = (JSON.parse((e as MessageEvent).data) as { generation: number }).generation;
      // Reconnexion après un redémarrage du serveur : tout relire.
      if (generation !== null && g !== generation) {
        void loadBook();
        if (sceneIdRef.current) void loadScene(sceneIdRef.current).then((s) => s && setReload((r) => r + 1));
      }
      generation = g;
    });
    es.addEventListener("change", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as ChangeEvent;
      generation = ev.generation;
      setLastChange(`${new Date().toLocaleTimeString("fr-FR")} : ${ev.files.join(", ")}`);
      const before = sceneRef.current;
      const deps = before ? sceneFiles(before) : new Set<string>();
      void loadBook();
      const id = sceneIdRef.current;
      if (id) {
        void loadScene(id).then((after) => {
          if (!after) return;
          const touched = ev.files.some((f) => deps.has(f) || sceneFiles(after).has(f));
          if (touched) setReload((r) => r + 1);
        });
      }
    });
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [loadBook, loadScene]);

  const changeLang = (l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // aperçu en français seulement
    }
    setLang(l);
  };

  // Le lecteur ne change de scène que par remontage (clé) : nouvelle scène, langue, réexport, edit.json modifié.
  const draftKey = scene ? JSON.stringify([scene.id, scene.draft, scene.diagnostic.rootNode, scene.diagnostic.error]) : "";
  const reader = useMemo(
    () => (scene && book ? readerSceneOf(scene, book) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftKey, reload],
  );
  const onEngineReady = useCallback((e: ReaderEngine | null) => setEngine(e), []);
  const readerKey = `${scene?.id ?? ""}|${lang}|${reload}`;
  useEffect(() => setEngine(null), [readerKey]);

  const errors = book?.report.filter((l) => l.level === "error").length ?? 0;
  const warnings = (book?.report.length ?? 0) - errors;
  const title = book?.book?.title?.fr ?? book?.book?.bookId ?? "livre";
  const bookScenes = book?.scenes.filter((s) => s.inBook) ?? [];
  const extraScenes = book?.scenes.filter((s) => !s.inBook) ?? [];

  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-neutral-100" style={{ fontFamily: "system-ui, sans-serif" }} data-atelier={ATELIER_MARKER}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 px-4 py-2 text-sm">
        <div className="flex min-w-0 flex-col">
          <span className="font-semibold">Atelier — {title}</span>
          <span className="truncate text-xs text-neutral-400" title={book?.source}>
            {book?.source ?? "…"}
          </span>
        </div>
        <label className="flex items-center gap-2">
          Scène
          <select
            className="rounded bg-neutral-800 px-2 py-1"
            value={sceneId ?? ""}
            onChange={(e) => setSceneId(e.target.value)}
            data-testid="scene-select"
          >
            {bookScenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
            {extraScenes.length > 0 && (
              <optgroup label="Hors book.json (diagnostic seul)">
                {extraScenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="flex items-center gap-1" role="group" aria-label="Langue d'aperçu">
          <span className="mr-1">Aperçu</span>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => changeLang(l)}
              className={`rounded px-2 py-1 uppercase ${lang === l ? "bg-sky-700" : "bg-neutral-800 hover:bg-neutral-700"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTab("rapport")}
          className={`rounded px-2 py-1 text-xs ${errors ? "bg-red-900 text-red-100" : warnings ? "bg-amber-900 text-amber-100" : "bg-emerald-900 text-emerald-100"}`}
          data-testid="report-badge"
        >
          {errors} erreur(s), {warnings} avertissement(s)
        </button>
        <span className="ml-auto flex items-center gap-2 text-xs text-neutral-400">
          <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-red-500"}`} title={live ? "surveillance active" : "serveur déconnecté"} />
          lecture seule (A2)
        </span>
      </header>

      <main className="flex min-h-0 flex-1">
        {/* `transform` : les éléments `fixed` du lecteur (modales) restent dans cette zone. */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-black" style={{ transform: "translateZ(0)" }} data-testid="reader-area">
          {bookError && <Centered>Livre illisible : {bookError}</Centered>}
          {sceneError && <Centered>{sceneError}</Centered>}
          {!bookError && !sceneError && scene && !reader && <Centered>{scene.glb} illisible : {scene.diagnostic.error}</Centered>}
          {reader && (
            <>
              <WebDioramaLoader key={readerKey} scene={reader.reader} embedded onEngineReady={onEngineReady} />
              {(reader.diagnosticOnly || scene?.editIgnored) && (
                <p className="absolute left-1/2 top-2 z-[60] -translate-x-1/2 rounded bg-amber-900/90 px-3 py-1 text-xs text-amber-100" data-testid="reader-notice">
                  {reader.diagnosticOnly
                    ? "Couche 3D inutilisable : diagnostic seul (voir Rapport)"
                    : "edit.json refusé : aperçu avec la couche 3D seule (voir Rapport)"}
                </p>
              )}
            </>
          )}
        </div>

        <aside className="flex w-[30rem] max-w-[45%] flex-col border-l border-neutral-800">
          <nav className="flex border-b border-neutral-800 text-sm">
            {(["rapport", "diagnostic"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 px-3 py-2 capitalize ${tab === t ? "bg-neutral-800 font-semibold" : "hover:bg-neutral-900"}`}
                data-tab={t}
              >
                {t === "rapport" ? "Rapport" : "Diagnostic"}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {book && tab === "rapport" && <ReportTab book={book} scene={scene} />}
            {tab === "diagnostic" && (scene ? <DiagnosticTab key={readerKey} scene={scene} engine={engine} /> : <p className="text-sm text-neutral-400">…</p>)}
          </div>
          {lastChange && (
            <p className="border-t border-neutral-800 px-4 py-2 text-xs text-neutral-400" data-testid="last-change">
              Dernière modification : {lastChange}
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-neutral-300">{children}</div>;
}
