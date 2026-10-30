"use client";

// Entrée « Jeu » de l'atelier (MJ3, spec-mini-jeu.md §9 ; spec-atelier-glbi.md §15) : au centre, le jeu réel jouable
// (`GameView` du lecteur, monté sur l'objet fusionné `draft` de `mergeGame`), à droite les onglets Règles, Caméra, Textes,
// Sons, Crédits, Rapport et Diagnostic. Seule écriture : `game/game.edit.json` (couche `gameEditSchema`, « Enregistrer » et
// Ctrl+S). Même règle que les scènes (A3) : seuls les champs complets et valides sont enregistrés et envoyés à l'aperçu.
// Le jeu est remonté quand l'objet fusionné change (saisie valide, réexport d'un GLB de game/ depuis Blender) ;
// « Recommencer » lance une nouvelle partie. Meilleur score et réglages des commandes : en mémoire (`MemoryStorage`), jamais
// sous les clés du livre.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAME_DEFAULTS, GAME_LIMITS, type GameConfig, type ModelCredit } from "@/schema/glbi";
import GameView from "@/components/game/GameView";
import { TranslationProvider } from "@/contexts/TranslationContext";
import type { BookResponse, ChangeEvent, GamePreviewResponse, GameResponse, ReportLine, SaveResponse } from "./api";
import { formatGameEdit } from "./editLayerFile";
import { AssetSelect, CreditsTab, input, L3Input, Section, small, type AssetOptions } from "./EditTabs";
import type { FieldRef, GameTabId, L3, Lang } from "./editModel";
import {
  fixFrenchSpacing,
  frenchSpacingIssues,
  gameFieldOfMessage,
  gameFormFromEdit,
  gameLayerFromForm,
  gameUsedSounds,
  GAME_RULE_FIELDS,
  GAME_SOUND_KEYS,
  GAME_SOUND_LABELS,
  isGameLine,
  MemoryStorage,
  readerGameOf,
  type GameForm,
} from "./gameModel";
import GameDiagnosticTab from "./GameDiagnosticTab";
import ReportTab from "./ReportTab";

const PREVIEW_DELAY_MS = 350;
/**
 * Remontage du jeu après une modification (correctif de la batterie de MJ3) : attendu ce délai après le dernier aperçu, soit
 * environ 1 s après la dernière frappe ; une saisie n'est plus interrompue par le jeu à chaque caractère.
 */
const REMOUNT_DELAY_MS = 650;
type Tab = GameTabId | "rapport" | "diagnostic";
const TABS: { id: Tab; label: string }[] = [
  { id: "regles", label: "Règles" },
  { id: "gcamera", label: "Caméra" },
  { id: "textes", label: "Textes" },
  { id: "sons", label: "Sons" },
  { id: "gcredits", label: "Crédits" },
  { id: "rapport", label: "Rapport" },
  { id: "diagnostic", label: "Diagnostic" },
];

async function sendJson<T>(method: "PUT" | "POST", path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(path, { method, cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json().catch(() => ({ ok: false, error: `${path} : HTTP ${res.status}`, messages: [] }))) as T };
}

export default function GameWorkshop({
  book,
  lang,
  onLang,
  change,
  assets,
  dirtyRef,
}: {
  book: BookResponse;
  lang: Lang;
  onLang: (l: Lang) => void;
  /** Dernière modification du dossier source (SSE de la page) : jeu relu. */
  change: { n: number; ev: ChangeEvent | null };
  assets: AssetOptions;
  /** Saisie non enregistrée (lue par la page : changement d'entrée, Ctrl+S, fermeture). */
  dirtyRef: { current: boolean };
}) {
  const [game, setGame] = useState<GameResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setFormState] = useState<GameForm | null>(null);
  const [preview, setPreview] = useState<(GamePreviewResponse & { key: string }) | null>(null);
  const [tab, setTab] = useState<Tab>("regles");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ error: string; messages: string[] } | null>(null);
  const [diskChanged, setDiskChanged] = useState(false);
  const [focus, setFocus] = useState<{ field: string; n: number } | null>(null);
  const restartRef = useRef<(() => void) | null>(null);
  // Meilleur score et réglages des commandes du jeu d'essai : en mémoire, gardés tant que l'onglet est ouvert.
  const storage = useMemo(() => new MemoryStorage(), []);

  const setForm = useCallback((u: (f: GameForm) => GameForm) => setFormState((f) => (f ? u(f) : f)), []);

  const load = useCallback(async (resetForm = false) => {
    try {
      const res = await fetch("__api/game", { cache: "no-store" });
      const g = (await res.json()) as GameResponse & { error?: string };
      if (!res.ok) throw new Error(g.error ?? `__api/game : HTTP ${res.status}`);
      setGame(g);
      setError(null);
      if (resetForm || !dirtyRef.current) setFormState(gameFormFromEdit(g.edit));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [dirtyRef]);

  useEffect(() => {
    void load(true);
  }, [load]);

  // Modification du dossier source : jeu relu (réexport d'un GLB de game/ : le jeu est remonté par sa clé).
  useEffect(() => {
    if (!change.n) return;
    const ev = change.ev;
    if (ev && !ev.byAtelier && ev.files.includes("game/game.edit.json") && dirtyRef.current) setDiskChanged(true);
    void load();
  }, [change, load, dirtyRef]);

  const { layer, incomplete } = useMemo(() => (form ? gameLayerFromForm(form) : { layer: null, incomplete: [] }), [form]);
  const layerText = layer ? formatGameEdit(layer) : "";
  const fileText = game ? formatGameEdit(game.edit ?? { version: 1 }) : "";
  const editable = !!game?.inBook;
  const dirty = !!form && editable && (layerText !== fileText || incomplete.length > 0);
  const canSave = !!form && editable && !saving && (dirty || game?.edit === null || !!game?.editIgnored);
  dirtyRef.current = dirty;

  // Aperçu de la saisie (fusion `draft` et rapport recalculés par le serveur).
  const layerRef = useRef(layerText);
  layerRef.current = layerText;
  useEffect(() => {
    if (!game || !layer || !editable || layerText === fileText) {
      setPreview(null);
      return;
    }
    const key = layerText;
    const t = setTimeout(() => {
      void sendJson<GamePreviewResponse>("POST", "__api/game/preview", layer).then((r) => {
        if (r.status === 200 && layerRef.current === key) setPreview({ ...r.body, key });
      });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layer` suit `layerText`
  }, [layerText, fileText, game?.generation, editable]);
  const active = preview && preview.key === layerText ? preview : null;
  const shown = active ? active.game : game;
  const report = active ? active.report : book.report;
  const summary = active ? active.summary : book.summary;

  const save = useCallback(async () => {
    if (!canSave || !layer) return;
    if (diskChanged && !window.confirm("game/game.edit.json a été modifié hors de l'atelier : l'écraser avec la saisie ?")) return;
    setSaving(true);
    try {
      const r = await sendJson<SaveResponse>("PUT", "__api/game/edit", layer);
      if (r.body.ok) {
        setSaveError(null);
        setDiskChanged(false);
        await load(true);
      } else setSaveError({ error: r.body.error, messages: r.body.messages });
    } catch (e) {
      setSaveError({ error: (e as Error).message, messages: [] });
    } finally {
      setSaving(false);
    }
  }, [canSave, layer, diskChanged, load]);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Rapport → champ.
  const goto = useCallback((ref: FieldRef) => {
    setTab(ref.tab as Tab);
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
  const linkOf = useCallback((l: ReportLine) => (form && editable && l.scene === null ? gameFieldOfMessage(l.message, form) : null), [form, editable]);

  // Jeu monté : remonté quand l'objet fusionné ou un GLB de game/ change, une fois la saisie arrêtée (REMOUNT_DELAY_MS) ;
  // premier montage sans attendre.
  const liveDraft = shown?.draft ?? null;
  const liveKey = liveDraft ? JSON.stringify([liveDraft, shown?.glbs.map((g) => g.mtime)]) : "";
  const [mounted, setMounted] = useState<{ key: string; draft: GameConfig | null; first: boolean }>({ key: "", draft: null, first: true });
  useEffect(() => {
    if (liveKey === mounted.key) return;
    const t = setTimeout(() => setMounted({ key: liveKey, draft: liveDraft, first: false }), mounted.first ? 0 : REMOUNT_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `liveDraft` suit `liveKey`
  }, [liveKey]);
  const draft = mounted.draft;
  const gameKey = mounted.key;
  const reader = useMemo(() => {
    if (!draft) return { game: null, error: null };
    try {
      return { game: readerGameOf(draft), error: null };
    } catch (e) {
      return { game: null, error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `draft` suit `gameKey`
  }, [gameKey]);

  const modelCredits = useMemo(() => {
    const seen = new Map<string, ModelCredit>();
    for (const g of game?.glbs ?? []) {
      for (const { credit: c } of g.diagnostic.srcCredits) {
        const k = JSON.stringify([c.name, c.author, c.license, c.url]);
        if (!seen.has(k)) seen.set(k, c);
      }
    }
    return [...seen.values()];
  }, [game?.glbs]);
  const used = useMemo(() => (form ? gameUsedSounds(form) : []), [form]);
  const errors = report.filter((l) => l.level === "error" && isGameLine(l)).length;

  return (
    <main className="flex min-h-0 flex-1 flex-col" data-testid="game-workshop">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2 text-sm">
        <span className="font-semibold">Mini-jeu{game?.template ? ` — gabarit « ${game.template} »` : ""}</span>
        <button type="button" className={small} onClick={() => restartRef.current?.()} disabled={!reader.game} data-testid="game-restart">
          Recommencer
        </button>
        <span className="text-xs text-neutral-400">Meilleur score et commandes de l&apos;essai : gardés dans cet onglet seulement, jamais dans le livre.</span>
        <div className="ml-auto flex items-center gap-3">
          {editable && (
            <span className={`text-xs ${dirty ? "text-amber-300" : "text-neutral-500"}`} data-testid="game-dirty">
              {dirty ? "● modifié, non enregistré" : game?.edit === null ? "game.edit.json absent" : "enregistré"}
            </span>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            title="Enregistrer game/game.edit.json (Ctrl+S)"
            className="rounded bg-sky-700 px-3 py-1 text-sm font-semibold hover:bg-sky-600 disabled:bg-neutral-800 disabled:text-neutral-500"
            data-testid="game-save"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* `transform` : les éléments `fixed` du jeu (écrans, commandes) restent dans cette zone. */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-black" style={{ transform: "translateZ(0)" }} data-testid="game-area">
          {error && <Centered>Jeu illisible : {error}</Centered>}
          {!error && game && !game.inBook && <Centered>book.json n&apos;a pas de game : choisir le gabarit du jeu dans le studio (Informations du livre, section « Jeu »).</Centered>}
          {!error && game?.inBook && !liveDraft && <Centered>Jeu non monté : GLB de game/ manquants ou illisibles (voir Rapport et Diagnostic).</Centered>}
          {reader.error && <Centered>{reader.error}</Centered>}
          {reader.game && (
            <TranslationProvider lang={lang} onLangChange={onLang}>
              <GameView key={gameKey} bookId={book.book?.bookId ?? "atelier"} game={reader.game} onBack={() => {}} embedded storage={storage} restartRef={restartRef} />
            </TranslationProvider>
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
                {t.id === "rapport" && errors > 0 && <span className="ml-1 text-red-400">({errors})</span>}
              </button>
            ))}
          </nav>
          {(saveError || diskChanged || (game?.editIgnored && editable)) && (
            <div className="flex flex-col gap-2 border-b border-neutral-800 px-4 py-2 text-xs">
              {saveError && (
                <div className="rounded bg-red-950 px-3 py-2 text-red-200" data-testid="game-save-error">
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
                  game.edit.json a été modifié hors de l&apos;atelier ; ta saisie non enregistrée est gardée (Enregistrer l&apos;écrasera).{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      if (!game || !window.confirm("Abandonner la saisie et reprendre game.edit.json du disque ?")) return;
                      setDiskChanged(false);
                      dirtyRef.current = false;
                      setFormState(gameFormFromEdit(game.edit));
                    }}
                  >
                    Reprendre le fichier du disque
                  </button>
                </div>
              )}
              {game?.editIgnored && editable && (
                <p className="rounded bg-amber-950 px-3 py-2 text-amber-200">
                  game.edit.json actuel refusé par son schéma (voir Rapport) : le formulaire reprend ce qui est lisible ; Enregistrer réécrit le fichier depuis le formulaire.
                </p>
              )}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "rapport" && (
              <ReportTab
                report={report}
                summary={summary}
                scene={null}
                incomplete={editable ? incomplete : []}
                previewing={!!active}
                linkOf={linkOf}
                onGoto={goto}
                only={{ label: "jeu seulement", test: isGameLine }}
              />
            )}
            {tab === "diagnostic" && (game ? <GameDiagnosticTab game={game} /> : <p className="text-sm text-neutral-400">…</p>)}
            {tab !== "rapport" && tab !== "diagnostic" && (!form || !game ? (
              <p className="text-sm text-neutral-400">…</p>
            ) : !editable ? (
              <p className="text-sm text-neutral-400">book.json n&apos;a pas de game : couche éditoriale du jeu non modifiable.</p>
            ) : (
              <>
                {tab === "regles" && <RulesTab form={form} setForm={setForm} preyIds={game.preyIds} />}
                {tab === "gcamera" && <CameraTab form={form} setForm={setForm} />}
                {tab === "textes" && <TextsTab form={form} setForm={setForm} />}
                {tab === "sons" && <SoundsTab form={form} setForm={setForm} assets={assets} />}
                {tab === "gcredits" && (
                  <CreditsTab
                    credits={form.credits}
                    setCredits={(u) => setForm((f) => ({ ...f, credits: u(f.credits) }))}
                    used={used}
                    modelCredits={modelCredits}
                    usedTitle="Sons du jeu"
                    modelsHint="Propriétés src_* des GLB de game/, modifiées dans Blender."
                  />
                )}
              </>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

type SetGameForm = (u: (f: GameForm) => GameForm) => void;

function NumberField({ field, label, value, placeholder, hint, onChange }: { field: string; label: string; value: string; placeholder: string; hint: string; onChange: (v: string) => void }) {
  return (
    <label data-field={field} className="flex flex-col gap-1 rounded p-1">
      <span className="text-xs text-neutral-400">{label}</span>
      <span className="flex items-center gap-2">
        <input className={`${input} w-28`} inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        <span className="text-xs text-neutral-500">{hint}</span>
      </span>
    </label>
  );
}

const DEFAULT_OF: Record<string, number> = {
  duration: GAME_DEFAULTS.duration,
  playerSpeed: GAME_DEFAULTS.playerSpeed,
  preySpeed: GAME_DEFAULTS.preySpeed,
  detectionRadius: GAME_DEFAULTS.detectionRadius,
  points: GAME_DEFAULTS.points,
};

function RulesTab({ form, setForm, preyIds }: { form: GameForm; setForm: SetGameForm; preyIds: string[] }) {
  const r = form.rules;
  const setRule = (k: keyof GameForm["rules"], v: unknown) => setForm((f) => ({ ...f, rules: { ...f.rules, [k]: v } }));
  const setPrey = (i: number, p: [string, string]) => setRule("preys", r.preys.map((x, j) => (j === i ? p : x)));
  const total = r.preys.reduce((s, [, c]) => s + (Number(c.replace(",", ".")) || 0), 0);
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Section title="Réglages de la partie" hint="Vide : valeur par défaut du gabarit (en grisé). Hors des bornes : non enregistré. Visible en jouant, après « Recommencer ».">
        {GAME_RULE_FIELDS.map((f) => (
          <NumberField
            key={f.key}
            field={`rules.${f.key}`}
            label={f.label}
            value={r[f.key]}
            placeholder={String(DEFAULT_OF[f.key])}
            hint={`${f.limits[0]} à ${f.limits[1]}${f.int ? ", entier" : ""}`}
            onChange={(v) => setRule(f.key, v)}
          />
        ))}
        <label data-field="rules.respawn" className="flex items-center gap-2 rounded p-1">
          <span className="text-xs text-neutral-400">Réapparition d&apos;une proie capturée</span>
          <select className={`${input} w-48`} value={r.respawn} onChange={(e) => setRule("respawn", e.target.value)}>
            <option value="">(défaut : oui)</option>
            <option value="oui">oui</option>
            <option value="non">non</option>
          </select>
        </label>
      </Section>
      <Section
        title="Proies en même temps"
        hint={`Une ligne par sorte de proie, ${GAME_LIMITS.preys[1]} proies au plus en tout. Aucune ligne avec une seule sorte de proie : ${GAME_DEFAULTS.preyCount} proies.`}
      >
        <div data-field="rules.preys" className="flex flex-col gap-2 rounded p-1">
          {r.preys.map(([entity, count], i) => (
            <div key={i} className="flex items-center gap-2">
              <select className={input} value={entity} onChange={(e) => setPrey(i, [e.target.value, count])}>
                <option value="">(entité)</option>
                {entity && !preyIds.includes(entity) && <option value={entity}>{entity} (absente de game/)</option>}
                {preyIds.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input className={`${input} w-20`} inputMode="numeric" value={count} placeholder={String(GAME_DEFAULTS.preyCount)} onChange={(e) => setPrey(i, [entity, e.target.value])} />
              <button type="button" className={small} onClick={() => setRule("preys", r.preys.filter((_, j) => j !== i))}>
                Retirer
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button type="button" className={`${small} self-start`} onClick={() => setRule("preys", [...r.preys, [preyIds.length === 1 && !r.preys.length ? preyIds[0] : "", ""]])}>
              Ajouter une sorte de proie
            </button>
            {r.preys.length > 0 && <span className={`text-xs ${total > GAME_LIMITS.preys[1] ? "text-red-400" : "text-neutral-500"}`}>{total} en même temps</span>}
          </div>
        </div>
      </Section>
    </div>
  );
}

function CameraTab({ form, setForm }: { form: GameForm; setForm: SetGameForm }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Section title="Caméra" hint="Caméra plongeante (environ 50° au-dessus de l'horizon) qui suit le joueur. Vide : valeur par défaut.">
        <NumberField
          field="camera.distance"
          label="Distance de la caméra au joueur (m)"
          value={form.camera.distance}
          placeholder={String(GAME_DEFAULTS.cameraDistance)}
          hint={`${GAME_LIMITS.cameraDistance[0]} à ${GAME_LIMITS.cameraDistance[1]}`}
          onChange={(v) => setForm((f) => ({ ...f, camera: { distance: v } }))}
        />
      </Section>
    </div>
  );
}

const TEXTS: { key: keyof GameForm["texts"]; label: string; multiline: boolean; hint?: string }[] = [
  { key: "title", label: "Titre du jeu (obligatoire)", multiline: false },
  { key: "instructions", label: "Consigne, écran avant « Jouer » (obligatoire)", multiline: true },
  { key: "end", label: "Message de fin (facultatif)", multiline: true, hint: "sinon, écran de fin générique" },
];

function TextsTab({ form, setForm }: { form: GameForm; setForm: SetGameForm }) {
  const set = (k: keyof GameForm["texts"], v: L3) => setForm((f) => ({ ...f, texts: { ...f.texts, [k]: v } }));
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Section title="Textes du jeu" hint="En français, une espace insécable avant ? ! : ; et à l'intérieur des guillemets « », pour qu'un signe ne passe jamais seul à la ligne.">
        {TEXTS.map((t) => {
          const issues = frenchSpacingIssues(form.texts[t.key].fr);
          return (
            <div key={t.key} className="flex flex-col gap-1">
              <L3Input field={`texts.${t.key}`} label={`${t.label}${t.hint ? ` — ${t.hint}` : ""}`} value={form.texts[t.key]} onChange={(v) => set(t.key, v)} multiline={t.multiline} />
              {issues.length > 0 && (
                <p className="flex flex-wrap items-center gap-2 rounded bg-amber-950/60 px-2 py-1 text-xs text-amber-200" data-testid={`nbsp-${t.key}`}>
                  FR : espace ordinaire {issues.map((c) => (c === "«" ? "après « « »" : `avant « ${c} »`)).join(", ")} : une insécable est attendue.
                  <button type="button" className={small} onClick={() => set(t.key, { ...form.texts[t.key], fr: fixFrenchSpacing(form.texts[t.key].fr) })}>
                    Corriger
                  </button>
                </p>
              )}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function SoundsTab({ form, setForm, assets }: { form: GameForm; setForm: SetGameForm; assets: AssetOptions }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Section title="Sons du jeu" hint="Choisis parmi les sons du dossier du livre ; chaque son utilisé doit être crédité (onglet Crédits, V-10).">
        {GAME_SOUND_KEYS.map((k) => (
          <div key={k} className="flex flex-col gap-1">
            <span className="text-xs text-neutral-400">{GAME_SOUND_LABELS[k]}</span>
            <AssetSelect field={`sounds.${k}`} value={form.sounds[k]} options={assets.sounds} kind="son" onChange={(v) => setForm((f) => ({ ...f, sounds: { ...f.sounds, [k]: v } }))} />
          </div>
        ))}
      </Section>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-neutral-300">{children}</div>;
}
