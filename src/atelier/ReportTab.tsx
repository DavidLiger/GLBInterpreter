"use client";

// Onglet Rapport (A2, A3 ; spec-atelier-glbi.md §10.7) : erreurs et avertissements du livre, en direct, par origine. Mêmes
// contrôles et mêmes textes que `npm run book:check -- --source <dossier>` (scripts/book-check.ts, partagé). Pendant une
// saisie non enregistrée, le rapport est celui de l'aperçu (contrôles refaits avec la saisie à la place de edit.json).
// A3 : les champs commencés mais incomplets (non enregistrés) sont listés en tête ; chaque ligne qui concerne la couche
// éditoriale de la scène affichée mène au champ concerné.
import { useState } from "react";
import type { ReportLine, ReportOrigin, SceneResponse } from "./api";
import type { FieldRef, Incomplete } from "./editModel";

const ORIGINS: { origin: ReportOrigin; title: string; hint: string }[] = [
  { origin: "glb", title: "GLB (couche 3D)", hint: "corrigé dans Blender (addon GLBGenerator)" },
  { origin: "edit", title: "edit.json (couche éditoriale)", hint: "corrigé dans l'atelier ou à la main" },
  { origin: "fusion", title: "Fusion des deux couches", hint: "cohérence entre le GLB et edit.json" },
  { origin: "build", title: "Contrôles du build", hint: "références, clips, crédits, assets, livre" },
];

export default function ReportTab({
  report,
  summary,
  scene,
  incomplete,
  previewing,
  linkOf,
  onGoto,
}: {
  report: ReportLine[];
  summary: string;
  scene: SceneResponse | null;
  incomplete: Incomplete[];
  /** Rapport calculé avec la saisie non enregistrée. */
  previewing: boolean;
  linkOf: (line: ReportLine) => FieldRef | null;
  onGoto: (ref: FieldRef) => void;
}) {
  const [onlyScene, setOnlyScene] = useState(false);
  const lines = onlyScene && scene ? report.filter((l) => l.scene === scene.id) : report;
  const errors = report.filter((l) => l.level === "error").length;
  const warnings = report.length - errors;

  return (
    <div className="flex flex-col gap-4 text-sm">
      {incomplete.length > 0 && (
        <section className="rounded border border-amber-700 bg-amber-950/40 px-3 py-2" data-testid="incomplete">
          <h3 className="mb-1 font-semibold text-amber-200">Saisie incomplète, non enregistrée ({incomplete.length})</h3>
          <p className="mb-2 text-xs text-amber-200/80">Gardée dans la page seulement : perdue si l&apos;onglet est fermé.</p>
          <ul className="flex flex-col gap-1">
            {incomplete.map((i, k) => (
              <li key={k}>
                <button type="button" onClick={() => onGoto(i)} className="text-left text-xs text-amber-100 underline decoration-dotted hover:text-white">
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={`rounded px-3 py-2 font-mono text-xs ${errors ? "bg-red-950 text-red-200" : "bg-emerald-950 text-emerald-200"}`} data-testid="report-summary">
        {summary}
        {previewing && <span className="ml-2 font-sans text-[10px] uppercase text-neutral-300">(avec la saisie non enregistrée)</span>}
      </p>
      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span>
          {errors} erreur(s), {warnings} avertissement(s) — livre entier
        </span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyScene} onChange={(e) => setOnlyScene(e.target.checked)} />
          scène affichée seulement
        </label>
      </div>

      {scene && !scene.inBook && (
        <p className="rounded bg-amber-950 px-3 py-2 text-amber-200">
          « {scene.id} » n&apos;est pas dans book.json : diagnostic seul, hors contrôles du livre.
        </p>
      )}
      {scene && scene.orphans.length > 0 && (
        <p className="rounded bg-neutral-800 px-3 py-2 text-neutral-200">
          Actions de edit.json absentes du GLB (orphelines, à rattacher ou supprimer dans Actions) :{" "}
          {scene.orphans.map((o, i) => (
            <span key={o}>
              {i > 0 && ", "}
              <button type="button" className="underline decoration-dotted" onClick={() => onGoto({ tab: "actions", field: `orphan.${o}` })}>
                {o}
              </button>
            </span>
          ))}
        </p>
      )}

      {scene && (scene.eventOrphans ?? []).length > 0 && (
        <p className="rounded bg-neutral-800 px-3 py-2 text-neutral-200">
          Événements de edit.json absents du GLB (orphelins, à rattacher ou supprimer dans Actions) :{" "}
          {scene.eventOrphans.map((o, i) => (
            <span key={`${o.action}.${o.event}`}>
              {i > 0 && ", "}
              <button
                type="button"
                className="underline decoration-dotted"
                onClick={() => onGoto({ tab: "actions", field: `eventOrphan.${o.action}.${o.event}` })}
              >
                {o.action} : {o.event}
              </button>
            </span>
          ))}
        </p>
      )}

      {ORIGINS.map(({ origin, title, hint }) => {
        const group = lines.filter((l) => l.origin === origin);
        return (
          <section key={origin} data-origin={origin}>
            <h3 className="mb-1 flex items-baseline justify-between font-semibold">
              <span>{title}</span>
              <span className="text-xs font-normal text-neutral-400">{group.length ? `${group.length}` : "rien"}</span>
            </h3>
            <p className="mb-2 text-xs text-neutral-500">{hint}</p>
            {group.length > 0 && (
              <ul className="flex flex-col gap-1">
                {group.map((l, i) => (
                  <Line key={i} line={l} current={scene?.id ?? null} link={linkOf(l)} onGoto={onGoto} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Line({ line, current, link, onGoto }: { line: ReportLine; current: string | null; link: FieldRef | null; onGoto: (ref: FieldRef) => void }) {
  const err = line.level === "error";
  const other = line.scene !== null && line.scene !== current;
  const body = (
    <>
      <span className="font-sans font-semibold">{err ? "ERREUR :" : "avertissement :"}</span> {line.message}
      {line.scene === null && <span className="ml-2 font-sans text-[10px] uppercase text-neutral-400">livre</span>}
    </>
  );
  return (
    <li
      className={`rounded border-l-4 font-mono text-xs leading-snug ${
        err ? "border-red-500 bg-red-950/50" : "border-amber-500 bg-amber-950/40"
      } ${other ? "opacity-60" : ""}`}
      data-level={line.level}
    >
      {link ? (
        <button type="button" onClick={() => onGoto(link)} className="w-full px-2 py-1 text-left hover:bg-white/5" title="Aller au champ" data-link={link.field}>
          {body} <span className="font-sans text-sky-400">→</span>
        </button>
      ) : (
        <div className="px-2 py-1">{body}</div>
      )}
    </li>
  );
}
