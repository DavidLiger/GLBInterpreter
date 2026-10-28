"use client";

// Onglet Carte de l'atelier (CC2, spec-carte-collection.md §8) : carte de collection de la scène (`modules.card` de
// `scenes/<id>.edit.json`). Intitulés du livre en lecture seule (`book.json.cardFields`, écrits par le studio) ; valeurs
// en FR, EN, ES, ou une seule valeur pour les trois langues ; sous-titre ; illustration ; paragraphe avec compteur.
// Règle d'A3 : seul un champ complet et assez court est enregistré (editModel.ts, `layerFromForm`) ; le reste de la scène
// s'enregistre. Aperçu en bas par `CollectionCard` tel quel (composant du livre), dans la langue d'aperçu, à partir de la
// saisie (règle d'A5 : dès que le paragraphe est écrit dans cette langue).
// Titre de la carte = nom de la scène (onglet Scène), sans limite de longueur dans le contrat : `CardTitleNotice` mesure le
// titre dans une carte invisible et signale une langue où il serait coupé (« … »).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CollectionCard from "@/components/card/CollectionCard";
import { CARD_WIDTH, type CardFieldLabel, type CardText } from "@/components/card/cardModel";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { MESSAGES } from "@/i18n/messages";
import { CARD_FIELDS_MAX, CARD_LIMITS, LANGUAGES } from "@/schema/glbi";
import { AssetSelect, input, L3Input, Section, small, type AssetOptions, type SetForm } from "./EditTabs";
import { cardPreviewOf, emptyCard, emptyL3, l3Started, type CardForm, type EditForm, type L3, type Lang } from "./editModel";

/** Ce que l'atelier sait du livre pour la carte : intitulés, rang de la scène, titre du livre (pied de la carte). */
export interface BookCardInfo {
  fields: CardFieldLabel[];
  /** Rang de la scène dans `book.json.scenes` (à partir de 1) et nombre de scènes. */
  number: number;
  total: number;
  bookTitle?: CardText;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
const LANG_UP = (l: Lang) => l.toUpperCase();

/**
 * Langues où le nom de la scène serait coupé (« … ») dans le titre de la carte : titre et numéro posés dans l'en-tête
 * d'une carte invisible, aux styles du livre (`glbi-card*`), mesurés après le rendu et quand les polices sont chargées.
 */
function useTitleOverflow(name: L3, number: number, total: number): { ref: React.RefObject<HTMLDivElement | null>; cut: Lang[] } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cut, setCut] = useState<Lang[]>([]);
  const key = JSON.stringify([name, number, total]);
  useLayoutEffect(() => {
    const measure = () => {
      const root = ref.current;
      if (!root) return;
      const out: Lang[] = [];
      for (const el of root.querySelectorAll<HTMLElement>("[data-probe-lang]")) {
        if (el.scrollWidth > el.clientWidth + 1) out.push(el.dataset.probeLang as Lang);
      }
      setCut((c) => (c.join() === out.join() ? c : out));
    };
    measure();
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [key]);
  return { ref, cut };
}

/**
 * Avertissement « nom coupé sur la carte » (point de clôture de CC1) : affiché dans l'onglet Scène et l'onglet Carte. Le
 * contrat ne limite pas `scene.name` ; l'atelier le signale seulement (raccourcir le nom, ou accepter la coupure).
 */
export function CardTitleNotice({ name, number, total }: { name: L3; number: number; total: number }) {
  const { ref, cut } = useTitleOverflow(name, number, total);
  return (
    <>
      <div ref={ref} aria-hidden="true" style={{ position: "absolute", left: -10000, top: 0, width: CARD_WIDTH, visibility: "hidden", pointerEvents: "none" }}>
        {LANGUAGES.map((l) => (
          <article key={l} className="glbi-card" style={{ position: "relative", width: CARD_WIDTH, height: "auto" }}>
            <div className="glbi-card-inner">
              <header className="glbi-card-head">
                <h2 className="glbi-card-title" data-probe-lang={l}>
                  {name[l].trim()}
                </h2>
                <span className="glbi-card-number">{fill(MESSAGES[l].card.number, { i: number, total })}</span>
              </header>
            </div>
          </article>
        ))}
      </div>
      {cut.length > 0 && (
        <p className="rounded bg-amber-950 px-3 py-2 text-xs text-amber-200" data-testid="card-title-cut">
          Nom trop long pour le titre de la carte de collection en {cut.map(LANG_UP).join(", ")} : il y sera coupé (« … »).
          Raccourcir le nom de la scène, ou accepter la coupure.
        </p>
      )}
    </>
  );
}

/** Valeur d'une caractéristique : trois langues, ou une seule valeur pour les trois (« même valeur dans les 3 langues »). */
function FieldValue({ id, label, value, same, onSame, onChange }: { id: string; label: string; value: L3; same: boolean; onSame: (v: boolean) => void; onChange: (v: L3) => void }) {
  const max = CARD_LIMITS.fieldValue;
  const n = value.fr.trim().length;
  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-800 p-2" data-card-field={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">{label}</span>
        <label className="flex items-center gap-1 text-xs text-neutral-400">
          <input type="checkbox" checked={same} onChange={(e) => onSame(e.target.checked)} data-testid={`card-same-${id}`} />
          même valeur dans les 3 langues
        </label>
      </div>
      {same ? (
        <div data-field={`card.field.${id}`} className={`flex items-center gap-2 rounded p-1 ${n > max ? "ring-1 ring-red-600" : ""}`}>
          <span className="w-6 text-xs text-neutral-500">3</span>
          <input
            className={input}
            value={value.fr}
            onChange={(e) => onChange({ fr: e.target.value, en: e.target.value, es: e.target.value })}
            aria-label={`${label} (FR, EN, ES)`}
          />
          <span className={`w-14 shrink-0 text-right text-xs tabular-nums ${n > max ? "font-semibold text-red-400" : "text-neutral-500"}`} data-count="all">
            {n}/{max}
          </span>
        </div>
      ) : (
        <L3Input field={`card.field.${id}`} value={value} onChange={onChange} max={max} />
      )}
      {same && n > max && <span className="text-xs text-red-400">trop long, non enregistré</span>}
    </div>
  );
}

const allSame = (v: L3) => !!v.fr.trim() && v.fr === v.en && v.fr === v.es;

export function CardTab({
  form,
  setForm,
  assets,
  lang,
  sceneId,
  info,
}: {
  form: EditForm;
  setForm: SetForm;
  assets: AssetOptions;
  lang: Lang;
  sceneId: string;
  info: BookCardInfo;
}) {
  const c = form.card;
  const set = (card: CardForm) => setForm((f) => ({ ...f, card }));
  const valueOf = (id: string): L3 => c.fields.find(([k]) => k === id)?.[1] ?? emptyL3();
  const setValue = (id: string, v: L3) =>
    setForm((f) => ({
      ...f,
      card: {
        ...f.card,
        fields: f.card.fields.some(([k]) => k === id) ? f.card.fields.map(([k, x]) => [k, k === id ? v : x]) : [...f.card.fields, [id, v]],
      },
    }));
  // « Même valeur dans les 3 langues » : état de la page, coché d'office pour une valeur identique dans les 3 langues.
  const [same, setSame] = useState<Record<string, boolean>>({});
  useEffect(() => setSame({}), [sceneId]);
  const isSame = (id: string) => same[id] ?? allSame(valueOf(id));
  const toggleSame = (id: string, on: boolean) => {
    const v = valueOf(id);
    if (on) {
      const first = LANGUAGES.map((l) => v[l]).find((x) => x.trim()) ?? "";
      const differ = LANGUAGES.some((l) => v[l].trim() && v[l] !== first);
      if (differ && !window.confirm(`Les trois langues de « ${id} » ont des valeurs différentes : garder « ${first} » pour les trois ?`)) return;
      setValue(id, { fr: first, en: first, es: first });
    }
    setSame((s) => ({ ...s, [id]: on }));
  };

  const ids = info.fields.map((f) => f.id);
  const orphans = c.fields.filter(([id, v]) => !ids.includes(id) && l3Started(v));
  const removeOrphan = (id: string) => {
    if (!window.confirm(`Retirer la valeur « ${id} » de la carte (intitulé absent de book.json) ?`)) return;
    set({ ...c, fields: c.fields.filter(([k]) => k !== id) });
  };

  return (
    <div className="flex flex-col gap-5 text-sm">
      <p className="text-xs text-neutral-500">
        Carte gagnée à la première action jouée dans la scène. Le paragraphe est obligatoire, le reste facultatif. Seuls les
        textes complets (3 langues) et assez courts sont enregistrés ; les autres restent dans la page (« Saisie incomplète »).
      </p>
      <Section title="Titre" hint="Nom de la scène (onglet Scène) ; numéro et titre du livre viennent de book.json.">
        <p className="rounded bg-neutral-900 px-3 py-2 text-xs">
          {form.name[lang].trim() || <span className="text-neutral-500">(pas de nom en {LANG_UP(lang)} : « {sceneId} » affiché)</span>}
          <span className="ml-2 text-neutral-500">
            · n° {info.number} / {info.total}
          </span>
        </p>
        <CardTitleNotice name={form.name} number={info.number} total={info.total} />
      </Section>
      <Section title="Sous-titre" hint={`Facultatif : nom scientifique, époque… ${CARD_LIMITS.subtitle} caractères au plus.`}>
        <L3Input field="card.subtitle" value={c.subtitle} onChange={(subtitle) => set({ ...c, subtitle })} max={CARD_LIMITS.subtitle} />
      </Section>
      <Section title="Illustration" hint="Images présentes dans le dossier du livre ; conseillé 3:2, 900 × 600, WebP. Aucune : image de chargement de la scène, sinon icône du livre.">
        <AssetSelect field="card.image" kind="image" value={c.image} options={assets.images} onChange={(image) => set({ ...c, image })} />
      </Section>
      <Section
        title="Caractéristiques"
        hint={`Intitulés communs à toutes les cartes du livre (book.json, réglés dans le studio : « Informations du livre »), ${CARD_FIELDS_MAX} au plus ; valeur de ${CARD_LIMITS.fieldValue} caractères au plus ; sans valeur : « — ».`}
      >
        <div data-field="card.fields" className="flex flex-col gap-2">
          {info.fields.length === 0 && (
            <p className="rounded bg-neutral-900 px-3 py-2 text-xs text-neutral-400">
              Le livre n&apos;a pas d&apos;intitulés (book.json.cardFields) : les ajouter dans le studio, « Informations du livre », section Carte de collection.
            </p>
          )}
          {info.fields.map((f) => (
            <FieldValue
              key={f.id}
              id={f.id}
              label={`${f.label.fr} · ${f.label.en} · ${f.label.es}`}
              value={valueOf(f.id)}
              same={isSame(f.id)}
              onSame={(on) => toggleSame(f.id, on)}
              onChange={(v) => setValue(f.id, v)}
            />
          ))}
          {orphans.map(([id, v]) => (
            <div key={id} data-field={`card.field.${id}`} className="flex flex-wrap items-center gap-2 rounded border border-amber-800 bg-amber-950/30 p-2">
              <span className="text-xs">
                <span className="font-mono font-semibold">{id}</span>
                <span className="ml-2 text-neutral-400">{LANGUAGES.map((l) => v[l]).filter(Boolean).join(" / ")}</span>
              </span>
              <span className="text-xs text-amber-300">intitulé absent de book.json : erreur de vérification</span>
              <button type="button" className={small} onClick={() => removeOrphan(id)} data-testid={`card-remove-${id}`}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Paragraphe" hint={`Obligatoire pour que la scène ait une carte ; ${CARD_LIMITS.text} caractères au plus par langue.`}>
        <L3Input field="card.text" value={c.text} onChange={(text) => set({ ...c, text })} multiline max={CARD_LIMITS.text} />
      </Section>
      <button
        type="button"
        className={`${small} self-start`}
        onClick={() => window.confirm("Vider la carte (sous-titre, illustration, valeurs, paragraphe) ?") && set(emptyCard())}
      >
        Vider la carte
      </button>
      <CardPreview form={form} lang={lang} sceneId={sceneId} info={info} />
    </div>
  );
}

/**
 * Aperçu (CC2) : `CollectionCard` du livre, tel quel, sous un fournisseur à langue imposée (langue d'aperçu, comme le
 * quiz d'A5), à l'échelle 1 ; remonté quand l'illustration change (l'image de repli est un état du composant). Paragraphe
 * trop long pour la carte dans cette langue (mesuré) : signalé.
 */
function CardPreview({ form, lang, sceneId, info }: { form: EditForm; lang: Lang; sceneId: string; info: BookCardInfo }) {
  const p = cardPreviewOf(form.card, lang, form.loaderImage);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [textCut, setTextCut] = useState(false);
  const key = p.card ? JSON.stringify([p.card, form.name[lang]]) : "";
  useLayoutEffect(() => {
    const measure = () => {
      const el = boxRef.current?.querySelector<HTMLElement>(".glbi-card-text");
      setTextCut(!!el && el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    return () => {
      alive = false;
    };
  }, [key]);
  const name = form.name[lang].trim() || sceneId;
  const title: CardText = { fr: name, en: name, es: name };
  return (
    <Section title={`Aperçu (${LANG_UP(lang)})`} hint="Carte telle que le livre l'affiche ; rien n'est enregistré ni compté dans la progression.">
      <div data-testid="card-preview" className="flex flex-col gap-2">
        {!p.started ? (
          <p className="text-xs text-neutral-400">Pas de carte pour cette scène : ni bandeau ni bouton « Carte » dans le livre.</p>
        ) : !p.card ? (
          <p className="rounded bg-amber-950 px-3 py-2 text-xs text-amber-200" data-testid="card-preview-missing">
            Aperçu impossible en {LANG_UP(lang)} : paragraphe à écrire. Sans paragraphe, la scène n&apos;a pas de carte dans le livre.
          </p>
        ) : (
          <>
            {p.otherLangs.length > 0 && (
              <p className="rounded bg-amber-950 px-3 py-2 text-xs text-amber-200" data-testid="card-preview-incomplete">
                Carte incomplète : à traduire en {p.otherLangs.join(", ")} ; les textes incomplets ne sont pas enregistrés.
              </p>
            )}
            {textCut && (
              <p className="rounded bg-amber-950 px-3 py-2 text-xs text-amber-200" data-testid="card-text-cut">
                Paragraphe coupé en bas de la carte en {LANG_UP(lang)} : le raccourcir.
              </p>
            )}
            <div ref={boxRef} className="flex justify-center rounded-lg bg-black px-4 py-6">
              <TranslationProvider lang={lang}>
                <CollectionCard
                  key={p.card.image}
                  card={p.card}
                  title={title}
                  fields={info.fields}
                  number={info.number}
                  total={info.total}
                  bookTitle={info.bookTitle}
                  lang={lang}
                />
              </TranslationProvider>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
