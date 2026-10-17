"use client";

// Onglets d'édition de la couche éditoriale (A3, spec-atelier-glbi.md §10) : Scène, Actions, Ambiance, Quiz, Crédits.
// Ils modifient le formulaire de la page (editModel.ts) ; rien n'est écrit avant « Enregistrer ». Chaque champ porte un
// attribut `data-field` (liens du Rapport). Les assets se choisissent dans des menus des fichiers présents du dossier
// source, filtrés par extension acceptée ; un nom refusé par le contrat (caractères) est listé mais non sélectionnable.
import { useEffect, useState } from "react";
import { audioPathSchema, imagePathSchema, IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, LANGUAGES } from "@/schema/glbi";
import type { ModelCredit } from "@/schema/glbi";
import Quiz from "@/components/quiz/Quiz";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { emptyAction, emptyL3, quizPreviewOf, type ActionForm, type CreditForm, type EditForm, type L3, type Lang, type QuizForm } from "./editModel";

export type SetForm = (update: (f: EditForm) => EditForm) => void;

export interface AssetOption {
  path: string;
  /** Nom accepté par le contrat (`imagePathSchema` / `audioPathSchema`). */
  ok: boolean;
}

export interface AssetOptions {
  images: AssetOption[];
  sounds: AssetOption[];
}

/** Fichiers du dossier source utilisables comme images et sons (icônes du livre à la racine exclues). */
export function assetOptions(assets: Record<string, string[]>): AssetOptions {
  const all = Object.entries(assets)
    .filter(([dir]) => dir !== ".")
    .flatMap(([, files]) => files)
    .sort();
  const ext = (p: string) => /\.([A-Za-z0-9]+)$/.exec(p)?.[1]?.toLowerCase() ?? "";
  return {
    images: all
      .filter((p) => (IMAGE_EXTENSIONS as readonly string[]).includes(ext(p)))
      .map((p) => ({ path: p, ok: imagePathSchema.safeParse(p).success })),
    sounds: all
      .filter((p) => (AUDIO_EXTENSIONS as readonly string[]).includes(ext(p)))
      .map((p) => ({ path: p, ok: audioPathSchema.safeParse(p).success })),
  };
}

export interface GlbAction {
  id: string;
  clip: string;
  loop: boolean;
}

// ---------------------------------------------------------------------------------------------------------
// Briques
// ---------------------------------------------------------------------------------------------------------

const input = "w-full rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-sky-600";
const small = "rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700 disabled:opacity-40";

function Section({ title, children, hint }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      {children}
    </section>
  );
}

/** Texte en trois langues ; état « incomplet » visible quand une langue seulement manque. */
function L3Input({ field, label, value, onChange, multiline }: { field: string; label?: string; value: L3; onChange: (v: L3) => void; multiline?: boolean }) {
  const filled = LANGUAGES.filter((l) => value[l].trim()).length;
  const partial = filled > 0 && filled < LANGUAGES.length;
  return (
    <div data-field={field} className={`flex flex-col gap-1 rounded p-1 ${partial ? "ring-1 ring-amber-600" : ""}`}>
      {label && (
        <span className="text-xs text-neutral-400">
          {label}
          {partial && <span className="ml-2 text-amber-400">incomplet, non enregistré</span>}
        </span>
      )}
      {LANGUAGES.map((l) => (
        <label key={l} className="flex items-start gap-2">
          <span className="w-6 pt-1 text-xs uppercase text-neutral-500">{l}</span>
          {multiline ? (
            <textarea className={`${input} min-h-[3rem]`} value={value[l]} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
          ) : (
            <input className={input} value={value[l]} onChange={(e) => onChange({ ...value, [l]: e.target.value })} />
          )}
        </label>
      ))}
    </div>
  );
}

/** Lecture d'un son (une à la fois dans la page). */
let playing: { audio: HTMLAudioElement; stop: () => void } | null = null;

function ListenButton({ src }: { src: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => () => {
    if (playing && playing.audio.src.endsWith(src)) playing.stop();
  }, [src]);
  const toggle = () => {
    if (on && playing) return playing.stop();
    playing?.stop();
    const audio = new Audio(src);
    const stop = () => {
      audio.pause();
      setOn(false);
      if (playing?.audio === audio) playing = null;
    };
    audio.onended = stop;
    audio.onerror = stop;
    playing = { audio, stop };
    setOn(true);
    audio.play().catch(stop);
  };
  return (
    <button type="button" className={small} disabled={!src} onClick={toggle}>
      {on ? "■ Arrêter" : "▶ Écouter"}
    </button>
  );
}

function AssetSelect({
  field,
  value,
  options,
  kind,
  onChange,
}: {
  field: string;
  value: string;
  options: AssetOption[];
  kind: "image" | "son";
  onChange: (v: string) => void;
}) {
  const missing = value && !options.some((o) => o.path === value);
  return (
    <div data-field={field} className="flex items-center gap-2">
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">(aucun{kind === "image" ? "e" : ""})</option>
        {missing && <option value={value}>{value} (absent du dossier)</option>}
        {options.map((o) => (
          <option key={o.path} value={o.path} disabled={!o.ok}>
            {o.path}
            {o.ok ? "" : " (nom refusé : lettres, chiffres, _, - et . seulement)"}
          </option>
        ))}
      </select>
      {kind === "image" ? (
        value ? (
          // eslint-disable-next-line @next/next/no-img-element -- vignette d'un fichier du dossier source
          <img src={value} alt="" className="h-10 w-10 shrink-0 rounded bg-neutral-800 object-contain" />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded bg-neutral-900" />
        )
      ) : (
        <ListenButton src={value} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------------------------------------

export function SceneTab({ form, setForm, assets, onShowLoader }: { form: EditForm; setForm: SetForm; assets: AssetOptions; onShowLoader: () => void }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Section title="Nom de la scène" hint="Affiché sur l'écran de chargement (3 langues obligatoires).">
        <L3Input field="scene.name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />
      </Section>
      <Section title="Image de chargement" hint="Images présentes dans le dossier du livre.">
        <AssetSelect field="scene.loaderImage" kind="image" value={form.loaderImage} options={assets.images} onChange={(loaderImage) => setForm((f) => ({ ...f, loaderImage }))} />
        <button type="button" className={`${small} self-start`} onClick={onShowLoader}>
          Voir l&apos;écran de chargement
        </button>
      </Section>
    </div>
  );
}

export function ActionsTab({ form, setForm, glbActions, assets }: { form: EditForm; setForm: SetForm; glbActions: GlbAction[]; assets: AssetOptions }) {
  const entry = (id: string) => form.actions.find(([k]) => k === id)?.[1] ?? emptyAction();
  const setEntry = (id: string, a: ActionForm) =>
    setForm((f) => ({
      ...f,
      actions: f.actions.some(([k]) => k === id) ? f.actions.map(([k, v]) => [k, k === id ? a : v]) : [...f.actions, [id, a]],
    }));
  const glbIds = glbActions.map((a) => a.id);
  const orphans = form.actions.filter(([id]) => !glbIds.includes(id));
  const hasContent = (a: ActionForm) => !!(a.icon || a.sound || LANGUAGES.some((l) => a.label[l].trim()));

  const attach = (orphan: string, target: string) => {
    const o = entry(orphan);
    if (hasContent(entry(target)) && !window.confirm(`L'action « ${target} » a déjà un libellé, une icône ou un son : les remplacer par ceux de « ${orphan} » ?`)) return;
    setForm((f) => {
      const rest = f.actions.filter(([k]) => k !== orphan && k !== target);
      return { ...f, actions: [...rest, [target, o]] };
    });
  };
  const remove = (orphan: string) => {
    if (!window.confirm(`Supprimer l'entrée orpheline « ${orphan} » (libellé, icône, son) ?`)) return;
    setForm((f) => ({ ...f, actions: f.actions.filter(([k]) => k !== orphan) }));
  };

  return (
    <div className="flex flex-col gap-5 text-sm" data-field="actions">
      {glbActions.length === 0 && <p className="text-neutral-400">Pas de module animations dans le GLB (couche 3D) : aucune action.</p>}
      {glbActions.map((g, i) => {
        const a = entry(g.id);
        return (
          <section key={g.id} className="flex flex-col gap-2 rounded border border-neutral-800 p-3">
            <h3 className="flex flex-wrap items-baseline gap-x-3 font-semibold">
              <span>
                {i + 1}. {g.id}
              </span>
              <span className="text-xs font-normal text-neutral-400">
                clip « {g.clip} » · {g.loop ? "en boucle" : "une fois"} (GLB, lecture seule)
              </span>
            </h3>
            <L3Input field={`action.${g.id}.label`} label="Libellé du bouton" value={a.label} onChange={(label) => setEntry(g.id, { ...a, label })} />
            <span className="text-xs text-neutral-400">Icône</span>
            <AssetSelect field={`action.${g.id}.icon`} kind="image" value={a.icon} options={assets.images} onChange={(icon) => setEntry(g.id, { ...a, icon })} />
            <span className="text-xs text-neutral-400">Son</span>
            <AssetSelect field={`action.${g.id}.sound`} kind="son" value={a.sound} options={assets.sounds} onChange={(sound) => setEntry(g.id, { ...a, sound })} />
          </section>
        );
      })}

      {orphans.length > 0 && (
        <Section title="Entrées orphelines" hint="Présentes dans edit.json, absentes du GLB (action renommée ou retirée dans Blender).">
          {orphans.map(([id, a]) => (
            <div key={id} data-field={`orphan.${id}`} className="flex flex-col gap-2 rounded border border-amber-800 bg-amber-950/30 p-3">
              <p>
                <span className="font-semibold">{id}</span>
                <span className="ml-2 text-xs text-neutral-400">
                  {LANGUAGES.map((l) => a.label[l]).filter(Boolean).join(" / ") || "sans libellé"}
                  {a.icon && ` · ${a.icon}`}
                  {a.sound && ` · ${a.sound}`}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className={`${input} w-auto`}
                  value=""
                  onChange={(e) => e.target.value && attach(id, e.target.value)}
                  disabled={!glbIds.length}
                  data-testid={`attach-${id}`}
                >
                  <option value="">Rattacher à…</option>
                  {glbIds.map((g) => (
                    <option key={g} value={g}>
                      {g}
                      {hasContent(entry(g)) ? " (remplace l'existant)" : ""}
                    </option>
                  ))}
                </select>
                <button type="button" className={small} onClick={() => remove(id)} data-testid={`remove-${id}`}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

export function AmbianceTab({ form, setForm, assets }: { form: EditForm; setForm: SetForm; assets: AssetOptions }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <Section
        title="Son d'ambiance"
        hint="Joué en boucle par le lecteur après « Cliquer pour commencer » ; un changement recharge la vue."
      >
        <AssetSelect field="audio.ambientSound" kind="son" value={form.ambientSound} options={assets.sounds} onChange={(ambientSound) => setForm((f) => ({ ...f, ambientSound }))} />
      </Section>
    </div>
  );
}

export function QuizTab({ form, setForm, lang, sceneId }: { form: EditForm; setForm: SetForm; lang: Lang; sceneId: string }) {
  const q = form.quiz;
  const set = (quiz: QuizForm) => setForm((f) => ({ ...f, quiz }));
  return (
    <div className="flex flex-col gap-5 text-sm">
      <p className="text-xs text-neutral-500">
        Une question, 3 réponses, une seule bonne, une explication ; les 3 langues partout. Enregistré seulement complet.
        Aperçu en bas de l&apos;onglet, dans la langue d&apos;aperçu.
      </p>
      <Section title="Question">
        <L3Input field="quiz.question" value={q.question} onChange={(question) => set({ ...q, question })} multiline />
      </Section>
      <div data-field="quiz.correct" className="flex flex-col gap-4">
        {q.choices.map((c, i) => (
          <Section key={i} title={`Réponse ${i + 1}`}>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" name="quiz-correct" checked={q.correct === i} onChange={() => set({ ...q, correct: i })} />
              bonne réponse
            </label>
            <L3Input
              field={`quiz.choice.${i}`}
              value={c}
              onChange={(v) => set({ ...q, choices: q.choices.map((x, j) => (j === i ? v : x)) as QuizForm["choices"] })}
            />
          </Section>
        ))}
      </div>
      <Section title="Explication" hint="Affichée après la bonne réponse.">
        <L3Input field="quiz.explanation" value={q.explanation} onChange={(explanation) => set({ ...q, explanation })} multiline />
      </Section>
      <button
        type="button"
        className={`${small} self-start`}
        onClick={() =>
          window.confirm("Vider le quiz (question, réponses, explication) ?") &&
          set({ question: emptyL3(), choices: [emptyL3(), emptyL3(), emptyL3()], correct: null, explanation: emptyL3() })
        }
      >
        Vider le quiz
      </button>
      <QuizPreview quiz={q} lang={lang} title={form.name[lang].trim() || sceneId} />
    </div>
  );
}

/**
 * Aperçu du quiz (A5) : composant du lecteur monté tel quel, dans la langue d'aperçu (fournisseur à langue imposée, qui
 * ne réutilise pas celui du lecteur et ne touche pas `<html lang>`), sans `onContinue` (« Passer » remet le quiz à son
 * début) ni progression. Source : la saisie de la page, enregistrée ou non ; affiché dès que le quiz est complet dans la
 * langue d'aperçu (décision du 17/10). Remonté à chaque changement du quiz (réponses grisées remises à zéro). La fenêtre
 * « Bravo ! » est la modale du livre : elle couvre l'atelier jusqu'à « Passer », Échap ou un clic sur le fond.
 */
function QuizPreview({ quiz, lang, title }: { quiz: QuizForm; lang: Lang; title: string }) {
  const p = quizPreviewOf(quiz, lang);
  const key = p.quiz ? JSON.stringify(p.quiz) : "";
  return (
    <Section title={`Aperçu (${lang.toUpperCase()})`} hint="Quiz tel que le lecteur l'affiche ; rien n'est enregistré ni compté dans la progression.">
      <div data-testid="quiz-preview" className="flex flex-col gap-2">
        {!p.started ? (
          <p className="text-xs text-neutral-400">Pas de quiz pour cette scène : la scène s&apos;ouvre sans question.</p>
        ) : !p.quiz ? (
          <p className="rounded bg-amber-950 px-3 py-2 text-xs text-amber-200" data-testid="quiz-preview-missing">
            Aperçu impossible en {lang.toUpperCase()} : {p.missingHere.join(", ")} à compléter.
          </p>
        ) : (
          <>
            {p.otherLangs.length > 0 && (
              <p className="rounded bg-amber-950 px-3 py-2 text-xs text-amber-200" data-testid="quiz-preview-incomplete">
                Quiz incomplet, non enregistré : à traduire en {p.otherLangs.join(", ")}.
              </p>
            )}
            <div className="flex justify-center rounded-lg bg-black px-4 py-6 text-white">
              <TranslationProvider lang={lang}>
                <Quiz key={key} quiz={p.quiz} title={title} />
              </TranslationProvider>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

export function CreditsTab({
  form,
  setForm,
  used,
  modelCredits,
}: {
  form: EditForm;
  setForm: SetForm;
  /** Assets utilisés par la scène (image de chargement, icônes, sons). */
  used: { asset: string; kind: "image" | "son" }[];
  /** Crédits `src_*` du GLB, dédoublonnés (lecture seule). */
  modelCredits: ModelCredit[];
}) {
  const credit = (asset: string): CreditForm =>
    form.credits.find((c) => c.asset === asset) ?? { asset, title: "", author: "", license: "", source: "" };
  const setCredit = (c: CreditForm) =>
    setForm((f) => ({
      ...f,
      credits: f.credits.some((x) => x.asset === c.asset) ? f.credits.map((x) => (x.asset === c.asset ? c : x)) : [...f.credits, c],
    }));
  const unused = form.credits.filter((c) => !used.some((u) => u.asset === c.asset));
  const state = (c: CreditForm, kind: "image" | "son" | null) => {
    const filled = [c.title, c.author, c.license].filter((v) => v.trim()).length;
    if (filled === 3) return { text: "crédité", cls: "text-emerald-400" };
    if (filled > 0 || c.source.trim()) return { text: "incomplet (titre, auteur, licence)", cls: "text-amber-400" };
    return kind === "son" ? { text: "sans crédit : obligatoire (V-10)", cls: "text-red-400" } : { text: "sans crédit (facultatif)", cls: "text-neutral-400" };
  };

  const row = (c: CreditForm, kind: "image" | "son" | null) => {
    const s = state(c, kind);
    const f = (k: "title" | "author" | "license" | "source", label: string) => (
      <label className="flex items-center gap-2">
        <span className="w-16 text-xs text-neutral-400">{label}</span>
        <input className={input} value={c[k]} onChange={(e) => setCredit({ ...c, [k]: e.target.value })} />
      </label>
    );
    return (
      <div key={c.asset} data-field={`credit.${c.asset}`} className="flex flex-col gap-1 rounded border border-neutral-800 p-3">
        <p className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-xs">{c.asset}</span>
          <span className={`text-xs ${s.cls}`}>
            {kind ?? "non utilisé"} · {s.text}
          </span>
        </p>
        {f("title", "Titre")}
        {f("author", "Auteur")}
        {f("license", "Licence")}
        {f("source", "Source")}
        {kind === null && (
          <button type="button" className={`${small} self-start`} onClick={() => setForm((ff) => ({ ...ff, credits: ff.credits.filter((x) => x.asset !== c.asset) }))}>
            Supprimer ce crédit
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5 text-sm" data-field="credits">
      <Section title="Sons et images de la scène" hint="Un crédit par son est obligatoire (V-10) ; titre, auteur et licence requis, source facultative.">
        {used.length === 0 && <p className="text-neutral-400">Aucun son ni image utilisé.</p>}
        {used.map((u) => row(credit(u.asset), u.kind))}
      </Section>
      {unused.length > 0 && <Section title="Crédits d'assets non utilisés">{unused.map((c) => row(c, null))}</Section>}
      <Section title="Modèles 3D (src_* du GLB, lecture seule)" hint="Modifiés dans Blender, propriétés src_name, src_author, src_license, src_url.">
        {modelCredits.length === 0 && <p className="text-neutral-400">Aucun crédit de modèle dans le GLB.</p>}
        {modelCredits.map((c, i) => (
          <p key={i} className="rounded bg-neutral-900 px-3 py-2 text-xs">
            {[c.name, c.author, c.license, c.url].filter(Boolean).join(" · ")}
          </p>
        ))}
      </Section>
    </div>
  );
}
