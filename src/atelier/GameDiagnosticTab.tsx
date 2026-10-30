"use client";

// Onglet Diagnostic de l'entrée « Jeu » (MJ3, spec-mini-jeu.md §9) : un bloc par GLB de `game/` (arène d'abord), lus par le
// serveur dans le GLB source : fichier, GLBI_ROOT et couche 3D du jeu (`glbi_game_version`, `glbi_game_config`), contenu,
// clips et rôles déclarés, skins, crédits `src_*`. Choix de l'addon v0.4 (spec-mini-jeu.md §18), présentés comme tels et
// jamais comme des défauts : une entité est exportée sans lampes (l'éclairage du jeu vient de l'arène), l'arène sans
// animations (le moteur n'en joue aucune).
import type { GameGlbInfo, GameResponse } from "./api";

const mib = (b: number) => (b < 1048576 ? `${(b / 1024).toFixed(1)} Kio` : `${(b / 1048576).toFixed(2)} Mio`);
const sec = (s: number) => `${s.toFixed(2)} s`;
const ROLES: Record<string, string> = { player: "joueur", prey: "proie" };

export default function GameDiagnosticTab({ game }: { game: GameResponse }) {
  if (!game.glbs.length) {
    return <p className="text-sm text-neutral-400">Aucun GLB dans game/ : exporter l&apos;arène et les entités avec l&apos;addon (v0.4, modes « Arène » et « Entité de jeu »).</p>;
  }
  return (
    <div className="flex flex-col gap-6 text-sm" data-testid="game-diagnostic">
      {game.glbs.map((g) => (
        <GlbBlock key={g.rel} g={g} />
      ))}
    </div>
  );
}

function GlbBlock({ g }: { g: GameGlbInfo }) {
  const d = g.diagnostic;
  const arena = g.kind === "arena";
  const entity = g.kind === "entity";
  const title = arena ? "Arène" : entity ? `Entité « ${g.id} » (${ROLES[g.role ?? ""] ?? g.role ?? "rôle inconnu"})` : `« ${g.id} »`;
  if (d.error) {
    return (
      <section data-glb={g.rel}>
        <h3 className="mb-2 font-semibold">{title}</h3>
        <p className="rounded bg-red-950 px-3 py-2 text-red-200">
          {g.rel} illisible ({mib(d.bytes)}) : {d.error}
        </p>
      </section>
    );
  }
  const lights = entity && d.counts.lights === 0 ? "aucune (voulu : l'éclairage du jeu vient de l'arène)" : String(d.counts.lights);
  return (
    <section data-glb={g.rel} className="flex flex-col gap-2 rounded border border-neutral-800 p-3">
      <h3 className="font-semibold">{title}</h3>
      <Rows
        rows={[
          ["Fichier", g.rel],
          ["Poids (source)", `${mib(d.bytes)} — budgets mesurés sur le GLB optimisé : voir Rapport`],
          ["Générateur", d.generator ?? "—"],
          ["Extensions", d.extensions.length ? d.extensions.join(", ") : "aucune"],
          ["Contenu", `${d.counts.nodes} nœuds, ${d.counts.meshes} maillages, ${d.counts.materials} matériaux, ${d.counts.textures} textures`],
          ["Lumières", lights],
          ["Nœud GLBI_ROOT", d.glbiRoots === 1 ? "présent" : <Warn key="r">{d.glbiRoots === 0 ? "absent" : `${d.glbiRoots} nœuds (un seul attendu)`}</Warn>],
          ["glbi_game_version", d.gameVersion === undefined ? <Warn key="v">absent</Warn> : JSON.stringify(d.gameVersion)],
          ["glbi_game_config", d.gameConfigOk ? `lisible (kind « ${g.kind ?? "?"} »)` : <Warn key="c">absent ou illisible</Warn>],
        ]}
      />
      {arena ? (
        d.clips.length === 0 ? (
          <p className="text-xs text-neutral-400">Animations : aucune (voulu : l&apos;arène est exportée sans animations, le moteur n&apos;en joue aucune).</p>
        ) : (
          <p className="text-xs text-neutral-400">Animations : {d.clips.length}, ignorées par le moteur.</p>
        )
      ) : (
        <Clips clips={d.clips} />
      )}
      {d.skins.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {d.skins.map((s, i) => (
            <li key={i}>
              Skin <span className="font-mono">{s.name}</span> : {s.joints} os ; maillages : {s.meshes.length ? s.meshes.join(", ") : "aucun"}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-neutral-400">
        Crédits src_* : {d.srcCredits.length ? d.srcCredits.map((c) => [c.credit.name, c.credit.author, c.credit.license].filter(Boolean).join(" — ")).join(" ; ") : "aucun (avertissement « aucun crédit de modèle » attendu pour un GLB fait dans Blender sans bibliothèque d'assets)"}
      </p>
    </section>
  );
}

function Clips({ clips }: { clips: GameGlbInfo["diagnostic"]["clips"] }) {
  if (!clips.length) return <p className="text-xs text-amber-300">Clips : aucun (rôles de clip obligatoires : voir Rapport).</p>;
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-neutral-400">
        <tr>
          <th className="py-1">Clip</th>
          <th>Durée</th>
          <th>Pistes</th>
          <th>Rôle</th>
        </tr>
      </thead>
      <tbody>
        {clips.map((c) => (
          <tr key={c.name} className="border-t border-neutral-800" data-clip={c.name}>
            <td className="py-1 font-mono">{c.name}</td>
            <td className="tabular-nums">{sec(c.duration)}</td>
            <td className="tabular-nums">{c.tracks}</td>
            <td>{c.declaredAs.length ? c.declaredAs.join(", ") : <span className="text-amber-300">non déclaré</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-neutral-400">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return <span className="text-amber-300">{children}</span>;
}
