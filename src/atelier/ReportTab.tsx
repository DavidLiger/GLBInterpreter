"use client";

// Onglet Rapport (A2, spec-atelier-glbi.md §10.7) : erreurs et avertissements du livre, en direct, par origine. Mêmes
// contrôles et mêmes textes que `npm run book:check -- --source <dossier>` (scripts/book-check.ts, partagé).
// Le lien d'une ligne vers le champ concerné arrive avec les onglets d'édition (A3).
import { useState } from "react";
import type { BookResponse, ReportLine, ReportOrigin, SceneResponse } from "./api";

const ORIGINS: { origin: ReportOrigin; title: string; hint: string }[] = [
  { origin: "glb", title: "GLB (couche 3D)", hint: "corrigé dans Blender (addon GLBGenerator)" },
  { origin: "edit", title: "edit.json (couche éditoriale)", hint: "corrigé dans l'atelier (A3) ou à la main" },
  { origin: "fusion", title: "Fusion des deux couches", hint: "cohérence entre le GLB et edit.json" },
  { origin: "build", title: "Contrôles du build", hint: "références, clips, crédits, assets, livre" },
];

export default function ReportTab({ book, scene }: { book: BookResponse; scene: SceneResponse | null }) {
  const [onlyScene, setOnlyScene] = useState(false);
  const lines = onlyScene && scene ? book.report.filter((l) => l.scene === scene.id) : book.report;
  const errors = book.report.filter((l) => l.level === "error").length;
  const warnings = book.report.length - errors;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p className={`rounded px-3 py-2 font-mono text-xs ${errors ? "bg-red-950 text-red-200" : "bg-emerald-950 text-emerald-200"}`} data-testid="report-summary">
        {book.summary}
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
          Actions de edit.json absentes du GLB (orphelines, conservées dans le fichier) : {scene.orphans.join(", ")}
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
                  <Line key={i} line={l} current={scene?.id ?? null} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Line({ line, current }: { line: ReportLine; current: string | null }) {
  const err = line.level === "error";
  const other = line.scene !== null && line.scene !== current;
  return (
    <li
      className={`rounded border-l-4 px-2 py-1 font-mono text-xs leading-snug ${
        err ? "border-red-500 bg-red-950/50" : "border-amber-500 bg-amber-950/40"
      } ${other ? "opacity-60" : ""}`}
      data-level={line.level}
    >
      <span className="font-sans font-semibold">{err ? "ERREUR :" : "avertissement :"}</span> {line.message}
      {line.scene === null && <span className="ml-2 font-sans text-[10px] uppercase text-neutral-400">livre</span>}
    </li>
  );
}
