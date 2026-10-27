"use client";

// Atelier de configuration — A2 (lecture seule), A3 (écriture de la couche éditoriale) ; spec-atelier-glbi.md §9 et §10.
// Barre du haut (livre, scène dans l'ordre de book.json, langue d'aperçu, « modifié, non enregistré », Enregistrer et
// Ctrl+S), lecteur réel au centre (`WebDioramaLoader` sur l'objet fusionné `draft`, mode `buttons`), onglets à droite.
// La saisie vit dans la page (editModel.ts) : seuls ses champs complets sont envoyés à l'aperçu (fusion `draft` et rapport
// recalculés par le serveur) et écrits par Enregistrer (pas d'enregistrement automatique). Le serveur prévient la page de
// toute modification du dossier source (SSE) : un réexport depuis Blender recharge la scène sans perdre la saisie.
// Caméra (A4) : le cadrage saisi est posé en place sur le lecteur (caméra et contrôles de la poignée `onEngineReady`,
// `applyFramingInPlace`), sans remonter le lecteur ni relire le GLB ; le livre publié n'est pas concerné.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WebDioramaLoader, { type ReaderEngine } from "@/components/diorama/WebDioramaLoader";
import type { ModelCredit } from "@/schema/glbi";
import { ATELIER_MARKER, type BookResponse, type ChangeEvent, type PreviewResponse, type ReportLine, type SaveResponse, type SceneResponse } from "./api";
import DiagnosticTab from "./DiagnosticTab";
import CameraTab from "./CameraTab";
import { applyFramingInPlace, framingOf, type CameraForm } from "./cameraForm";
import { ActionsTab, AmbianceTab, assetOptions, CreditsTab, QuizTab, SceneTab } from "./EditTabs";
import { formatEditLayer, glbActionIds, glbActionsOf, glbEventIds } from "./editLayerFile";
import { formFromEdit, layerFromForm, usedAssets, type EditForm, type FieldRef, type Lang, type TabId } from "./editModel";
import ReportTab from "./ReportTab";
import { fieldOfMessage } from "./reportLinks";
import { readerSceneOf, sceneFiles } from "./readerFromScene";

const LANGS: Lang[] = ["fr", "en", "es"];
/** Clé de langue du lecteur (TranslationContext) : langue d'aperçu gardée d'une session à l'autre. */
const LANG_KEY = "webdiorama-lang";
/** Délai entre la dernière frappe et l'aperçu (fusion `draft` et rapport recalculés par le serveur). */
const PREVIEW_DELAY_MS = 350;

const TABS: { id: TabId; label: string }[] = [
  { id: "scene", label: "Scène" },
  { id: "camera", label: "Caméra" },
  { id: "actions", label: "Actions" },
  { id: "ambiance", label: "Ambiance" },
  { id: "quiz", label: "Quiz" },
  { id: "credits", label: "Crédits" },
  { id: "rapport", label: "Rapport" },
  { id: "diagnostic", label: "Diagnostic" },
];

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `${path} : HTTP ${res.status}`);
  return body as T;
}

async function sendJson<T>(method: "PUT" | "POST", path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(path, { method, cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({ ok: false, error: `${path} : HTTP ${res.status}`, messages: [] }))) as T };
}

function hashScene(): string | null {
  const m = /^#\/s\/([^/]+)$/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Langue d'aperçu enregistrée ; sinon le français. */
function readLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === "fr" || v === "en" || v === "es") return v;
  } catch {
    // stockage indisponible
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
  const [tab, setTab] = useState<TabId>("rapport");
  const [live, setLive] = useState(false);
  // Saisie (A3)
  const [form, setFormState] = useState<EditForm | null>(null);
  const [preview, setPreview] = useState<(PreviewResponse & { key: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ error: string; messages: string[] } | null>(null);
  const [diskChanged, setDiskChanged] = useState(false);
  const [focus, setFocus] = useState<{ field: string; n: number } | null>(null);
  // Caméra (A4) : bornes appliquées au lecteur pendant le réglage ; demande de retour à la vue de départ.
  const [cameraBounds, setCameraBounds] = useState(true);
  const [startTick, setStartTick] = useState(0);

  const sceneIdRef = useRef<string | null>(null);
  const sceneRef = useRef<SceneResponse | null>(null);
  const dirtyRef = useRef(false);
  sceneIdRef.current = sceneId;
  sceneRef.current = scene;

  const setForm = useCallback((update: (f: EditForm) => EditForm) => setFormState((f) => (f ? update(f) : f)), []);

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

  /** Relit la scène ; le formulaire est repris du fichier seulement s'il n'y a pas de saisie non enregistrée. */
  const loadScene = useCallback(async (id: string, resetForm = false) => {
    try {
      const s = await getJson<SceneResponse>(`__api/scene/${encodeURIComponent(id)}`);
      if (sceneIdRef.current !== id) return null;
      setScene(s);
      setSceneError(null);
      if (resetForm || !dirtyRef.current) setFormState(formFromEdit(s.edit));
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
    setFormState(null);
    setPreview(null);
    setSaveError(null);
    setDiskChanged(false);
    dirtyRef.current = false;
    if (hashScene() !== sceneId) history.replaceState(null, "", `#/s/${encodeURIComponent(sceneId)}`);
    void loadScene(sceneId, true);
  }, [sceneId, loadScene]);

  // Modifications du dossier source (serveur, SSE).
  useEffect(() => {
    const es = new EventSource("__api/events");
    let generation: number | null = null;
    es.addEventListener("hello", (e) => {
      setLive(true);
      const g = (JSON.parse((e as MessageEvent).data) as { generation: number }).generation;
      // Reconnexion après un redémarrage du serveur : tout relire (la saisie non enregistrée est gardée).
      if (generation !== null && g !== generation) {
        void loadBook();
        if (sceneIdRef.current) void loadScene(sceneIdRef.current).then((s) => s && setReload((r) => r + 1));
      }
      generation = g;
    });
    es.addEventListener("change", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as ChangeEvent;
      generation = ev.generation;
      const before = sceneRef.current;
      const deps = before ? sceneFiles(before) : new Set<string>();
      void loadBook();
      const id = sceneIdRef.current;
      if (!id) return;
      const editRel = `scenes/${id}.edit.json`;
      // edit.json modifié hors de l'atelier pendant une saisie : la saisie est gardée, signalée.
      if (!ev.byAtelier && ev.files.includes(editRel) && dirtyRef.current) setDiskChanged(true);
      void loadScene(id).then((after) => {
        if (!after) return;
        // Enregistrement fait par la page : l'aperçu montre déjà ce contenu, pas de rechargement du lecteur.
        const own = ev.byAtelier && ev.files.every((f) => f === editRel);
        const touched = ev.files.some((f) => deps.has(f) || sceneFiles(after).has(f));
        if (touched && !own) setReload((r) => r + 1);
      });
    });
    es.onerror = () => setLive(false);
    return () => es.close();
  }, [loadBook, loadScene]);

  const changeLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // langue d'aperçu non gardée
    }
    setLang(l);
  }, []);

  // --- Saisie : couche enregistrable, champs incomplets, état « modifié » ---
  const glbActions = useMemo(() => glbActionsOf(scene?.layer3d), [scene?.layer3d]);
  const glbIds = useMemo(() => glbActionIds(scene?.layer3d), [scene?.layer3d]);
  // Événements de chaque action dans l'ordre du GLB (AC3) : forme écrite, crédits, liens du Rapport.
  const glbEvents = useMemo(() => glbEventIds(scene?.layer3d), [scene?.layer3d]);
  const editable = !!scene?.inBook;
  const { layer, incomplete } = useMemo(() => (form ? layerFromForm(form) : { layer: null, incomplete: [] }), [form]);
  const layerText = layer ? formatEditLayer(layer, glbIds, glbEvents) : "";
  const fileText = scene ? formatEditLayer(scene.edit ?? { version: 1 }, glbIds, glbEvents) : "";
  const dirty = !!form && editable && (layerText !== fileText || incomplete.length > 0);
  const canSave = !!form && editable && !saving && (dirty || scene?.edit === null || !!scene?.editIgnored);
  dirtyRef.current = dirty;

  // Aperçu de la saisie : fusion `draft` et rapport recalculés par le serveur avec la couche saisie.
  const layerRef = useRef(layerText);
  layerRef.current = layerText;
  useEffect(() => {
    if (!scene || !layer || !editable || layerText === fileText) {
      setPreview(null);
      return;
    }
    const key = layerText;
    const id = scene.id;
    const t = setTimeout(() => {
      void sendJson<PreviewResponse>("POST", `__api/scene/${encodeURIComponent(id)}/preview`, layer).then((r) => {
        if (r.status === 200 && layerRef.current === key && sceneIdRef.current === id) setPreview({ ...r.body, key });
      });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layer` suit `layerText`
  }, [layerText, fileText, scene?.id, scene?.generation, editable]);

  const activePreview = preview && preview.key === layerText && preview.scene.id === scene?.id ? preview : null;
  const shown = activePreview ? activePreview.scene : scene;
  const report = activePreview ? activePreview.report : (book?.report ?? []);
  const summary = activePreview ? activePreview.summary : (book?.summary ?? "");

  // --- Enregistrer (bouton et Ctrl+S) ---
  const save = useCallback(async () => {
    if (!canSave || !layer || !scene) return;
    if (diskChanged && !window.confirm(`${scene.id}.edit.json a été modifié hors de l'atelier : l'écraser avec la saisie ?`)) return;
    setSaving(true);
    try {
      const r = await sendJson<SaveResponse>("PUT", `__api/scene/${encodeURIComponent(scene.id)}/edit`, layer);
      if (r.body.ok) {
        setSaveError(null);
        setDiskChanged(false);
        await loadScene(scene.id);
      } else {
        setSaveError({ error: r.body.error, messages: r.body.messages });
      }
    } catch (e) {
      setSaveError({ error: (e as Error).message, messages: [] });
    } finally {
      setSaving(false);
    }
  }, [canSave, layer, scene, diskChanged, loadScene]);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, []);

  const changeScene = (id: string) => {
    if (dirtyRef.current && !window.confirm(`Modifications non enregistrées sur « ${sceneId} » : les abandonner ?`)) return;
    setSceneId(id);
  };

  // --- Rapport → champ ---
  const goto = useCallback((ref: FieldRef) => {
    setTab(ref.tab);
    setFocus((f) => ({ field: ref.field, n: (f?.n ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    if (!focus) return;
    const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(focus.field)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
    const prev = el.style.outline;
    el.style.outline = "2px solid #0ea5e9";
    const t = setTimeout(() => (el.style.outline = prev), 1500);
    return () => clearTimeout(t);
  }, [focus]);
  const linkOf = useCallback(
    (l: ReportLine) => (form && scene && editable && l.scene === scene.id ? fieldOfMessage(l.message, scene.id, form, glbIds, glbEvents) : null),
    [form, scene, editable, glbIds, glbEvents],
  );

  // --- Lecteur : remonté seulement pour une nouvelle scène, un fichier modifié, l'écran de chargement ou l'ambiance ;
  //     libellés, icônes, nom et image de chargement suivent la saisie sans remontage ; langue imposée par la barre.
  const draftKey = shown ? JSON.stringify([shown.id, shown.draft, shown.diagnostic.rootNode, shown.diagnostic.error]) : "";
  const reader = useMemo(
    () => (shown && book ? readerSceneOf(shown, book) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftKey, reload],
  );
  const onEngineReady = useCallback((e: ReaderEngine | null) => setEngine(e), []);
  const ambient = shown?.draft?.modules.audio?.ambientSound ?? "";
  const readerKey = `${scene?.id ?? ""}|${reload}|${ambient}`;
  useEffect(() => setEngine(null), [readerKey]);

  // --- Caméra (A4) : le cadrage saisi (champs valides seulement) est posé en place sur le lecteur ; la caméra va à la vue
  //     de départ quand le lecteur est (re)monté, quand un champ est saisi au clavier, sur « Revenir au cadrage
  //     enregistré » et « Aller à la vue de départ » ; pas après « prendre la vue actuelle » ni en changeant de bornes.
  // Caméra tenue par une action à `cameraPosition` (DP-19, point de clôture d'AC2) : pendant l'action et son retour, le
  // lecteur verrouille ses OrbitControls (`enabled` faux, seul `cameraRig` y touche) puis rend, à la fin, la vue et les
  // bornes d'avant l'action : un cadrage posé pendant ce temps serait écrasé, et « prendre la vue » lirait la vue de
  // l'empty. Choix (AC3) : bloquer. Les boutons qui lisent ou déplacent la vue sont désactivés ; une saisie au clavier
  // reste permise, enregistrable, et n'est posée sur le lecteur qu'une fois la caméra rendue.
  const cameraHolders = useMemo(() => new Map(glbActions.filter((a) => a.cameraPosition).map((a) => [a.id, a.cameraPosition as string])), [glbActions]);
  const [cameraHeld, setCameraHeld] = useState<{ action: string | null; empty: string | null } | null>(null);
  useEffect(() => {
    setCameraHeld(null);
    if (!engine || !cameraHolders.size) return;
    const read = () => {
      if (engine.controls.enabled) return setCameraHeld((h) => (h ? null : h));
      const id = engine.buttons?.currentId ?? null;
      const action = id && cameraHolders.has(id) ? id : null;
      setCameraHeld((h) => (h && h.action === action ? h : { action, empty: action ? (cameraHolders.get(action) ?? null) : null }));
    };
    read();
    const t = setInterval(read, 100);
    return () => clearInterval(t);
  }, [engine, cameraHolders]);
  const held = !!cameraHeld;

  const framing = useMemo(() => (form ? framingOf(form.camera) : null), [form]);
  const framingKey = JSON.stringify(framing);
  const skipMoveKeyRef = useRef<string | null>(null);
  const appliedRef = useRef<{ engine: ReaderEngine | null; key: string; tick: number }>({ engine: null, key: "", tick: 0 });
  useEffect(() => {
    if (!engine || !framing) return;
    // Caméra tenue (DP-19) : rien n'est posé ; la saisie l'est au retour de la caméra (déplacement compris s'il a été demandé).
    if (held) return;
    const prev = appliedRef.current;
    const keyChanged = prev.key !== framingKey;
    const move = prev.engine !== engine || prev.tick !== startTick || (keyChanged && skipMoveKeyRef.current !== framingKey);
    skipMoveKeyRef.current = null;
    appliedRef.current = { engine, key: framingKey, tick: startTick };
    applyFramingInPlace(engine, framing, { bounds: cameraBounds, moveToStart: move });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `framing` suit `framingKey`
  }, [engine, framingKey, cameraBounds, startTick, held]);
  const setCamera = useCallback(
    (next: CameraForm, move: boolean) => {
      if (!move) skipMoveKeyRef.current = JSON.stringify(framingOf(next));
      else setStartTick((t) => t + 1);
      setForm((f) => ({ ...f, camera: next }));
    },
    [setForm],
  );
  const savedCamera = useMemo(() => formFromEdit(scene?.edit).camera, [scene?.edit]);
  const cameraTarget = useMemo(() => {
    const t = (scene?.layer3d as { modules?: { camera?: { target?: unknown } } } | null | undefined)?.modules?.camera?.target;
    return typeof t === "string" ? t : null;
  }, [scene?.layer3d]);

  const errors = report.filter((l) => l.level === "error").length;
  const warnings = report.length - errors;
  const title = book?.book?.title?.fr ?? book?.book?.bookId ?? "livre";
  const bookScenes = book?.scenes.filter((s) => s.inBook) ?? [];
  const extraScenes = book?.scenes.filter((s) => !s.inBook) ?? [];
  const assets = useMemo(() => assetOptions(book?.assets ?? {}), [book?.assets]);
  const used = useMemo(() => (form ? usedAssets(form, glbIds, glbEvents) : []), [form, glbIds, glbEvents]);
  const lastChange = book?.lastChange;
  const modelCredits = useMemo(() => {
    const seen = new Map<string, ModelCredit>();
    for (const { credit: c } of scene?.diagnostic.srcCredits ?? []) {
      const k = JSON.stringify([c.name, c.author, c.license, c.url]);
      if (!seen.has(k)) seen.set(k, c);
    }
    return [...seen.values()];
  }, [scene?.diagnostic.srcCredits]);

  const editTab = (node: React.ReactNode) =>
    !scene ? (
      <p className="text-sm text-neutral-400">…</p>
    ) : !editable ? (
      <p className="text-sm text-neutral-400">« {scene.id} » n&apos;est pas dans book.json : diagnostic seul, pas de couche éditoriale.</p>
    ) : form ? (
      node
    ) : null;

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
          <select className="rounded bg-neutral-800 px-2 py-1" value={sceneId ?? ""} onChange={(e) => changeScene(e.target.value)} data-testid="scene-select">
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
        <div className="ml-auto flex items-center gap-3">
          {editable && (
            <span className={`text-xs ${dirty ? "text-amber-300" : "text-neutral-500"}`} data-testid="dirty">
              {dirty ? "● modifié, non enregistré" : scene?.edit === null ? "edit.json absent" : "enregistré"}
            </span>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            title="Enregistrer scenes/<scène>.edit.json (Ctrl+S)"
            className="rounded bg-sky-700 px-3 py-1 text-sm font-semibold hover:bg-sky-600 disabled:bg-neutral-800 disabled:text-neutral-500"
            data-testid="save"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-emerald-500" : "bg-red-500"}`} title={live ? "surveillance active" : "serveur déconnecté"} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1">
        {/* `transform` : les éléments `fixed` du lecteur (modales) restent dans cette zone. */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-black" style={{ transform: "translateZ(0)" }} data-testid="reader-area">
          {bookError && <Centered>Livre illisible : {bookError}</Centered>}
          {sceneError && <Centered>{sceneError}</Centered>}
          {!bookError && !sceneError && shown && !reader && <Centered>{shown.glb} illisible : {shown.diagnostic.error}</Centered>}
          {reader && (
            <>
              <WebDioramaLoader key={readerKey} scene={reader.reader} embedded onEngineReady={onEngineReady} lang={lang} onLangChange={changeLang} />
              {(reader.diagnosticOnly || shown?.editIgnored) && (
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
          <nav className="flex flex-wrap border-b border-neutral-800 text-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 px-2 py-2 ${tab === t.id ? "bg-neutral-800 font-semibold" : "hover:bg-neutral-900"}`}
                data-tab={t.id}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {(saveError || diskChanged || (scene?.editIgnored && editable)) && (
            <div className="flex flex-col gap-2 border-b border-neutral-800 px-4 py-2 text-xs">
              {saveError && (
                <div className="rounded bg-red-950 px-3 py-2 text-red-200" data-testid="save-error">
                  <p className="font-semibold">{saveError.error}</p>
                  {saveError.messages.map((m, i) => (
                    <p key={i} className="font-mono">
                      {m}
                    </p>
                  ))}
                </div>
              )}
              {diskChanged && (
                <div className="rounded bg-amber-950 px-3 py-2 text-amber-200">
                  edit.json a été modifié hors de l&apos;atelier ; ta saisie non enregistrée est gardée (Enregistrer l&apos;écrasera).{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      if (!scene || !window.confirm("Abandonner la saisie et reprendre edit.json du disque ?")) return;
                      setDiskChanged(false);
                      dirtyRef.current = false;
                      setFormState(formFromEdit(scene.edit));
                    }}
                  >
                    Reprendre le fichier du disque
                  </button>
                </div>
              )}
              {scene?.editIgnored && editable && (
                <p className="rounded bg-amber-950 px-3 py-2 text-amber-200">
                  edit.json actuel refusé par son schéma (voir Rapport) : le formulaire reprend ce qui est lisible ; Enregistrer réécrit le fichier depuis le formulaire.
                </p>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "scene" && editTab(form && <SceneTab form={form} setForm={setForm} assets={assets} onShowLoader={() => setReload((r) => r + 1)} />)}
            {tab === "camera" &&
              editTab(
                form && (
                  <CameraTab
                    camera={form.camera}
                    setCamera={setCamera}
                    savedCamera={savedCamera}
                    target={cameraTarget}
                    engine={engine}
                    bounds={cameraBounds}
                    onBounds={setCameraBounds}
                    onStartView={() => setStartTick((t) => t + 1)}
                    held={cameraHeld}
                    incomplete={incomplete.filter((i) => i.tab === "camera")}
                  />
                ),
              )}
            {tab === "actions" && editTab(form && <ActionsTab form={form} setForm={setForm} glbActions={glbActions} assets={assets} />)}
            {tab === "ambiance" && editTab(form && <AmbianceTab form={form} setForm={setForm} assets={assets} />)}
            {tab === "quiz" && editTab(form && <QuizTab form={form} setForm={setForm} lang={lang} sceneId={scene?.id ?? ""} />)}
            {tab === "credits" && editTab(form && <CreditsTab form={form} setForm={setForm} used={used} modelCredits={modelCredits} />)}
            {book && tab === "rapport" && (
              <ReportTab report={report} summary={summary} scene={shown} incomplete={editable ? incomplete : []} previewing={!!activePreview} linkOf={linkOf} onGoto={goto} />
            )}
            {tab === "diagnostic" && (scene ? <DiagnosticTab key={readerKey} scene={scene} engine={engine} /> : <p className="text-sm text-neutral-400">…</p>)}
          </div>
          {lastChange && (
            <p className="border-t border-neutral-800 px-4 py-2 text-xs text-neutral-400" data-testid="last-change">
              Dernière modification : {new Date(lastChange.at).toLocaleTimeString("fr-FR")} : {lastChange.files.join(", ")}
              {lastChange.byAtelier ? " (enregistré par l'atelier)" : ""}
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
