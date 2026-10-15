"use client";

// Onglet Diagnostic (A2, spec-atelier-glbi.md §10.8, repris de test-glb.html) : fichier, GLBI_ROOT, clips, skins, extras,
// crédits `src_*` (lus par le serveur dans le GLB source) et lecture libre d'un clip par `ClipPreview` (lib/clipPreview.ts,
// hors bundle du livre) accrochée au lecteur par `onEngineReady`. Le mode `buttons` est suspendu pendant la lecture libre.
import { useEffect, useRef, useState } from "react";
import type { ReaderEngine } from "@/components/diorama/WebDioramaLoader";
import { ClipPreview, CLIP_PREVIEW_MAX_SPEED } from "@/components/diorama/lib/clipPreview";
import type { SceneResponse } from "./api";

const mib = (b: number) => (b < 1048576 ? `${(b / 1024).toFixed(1)} Kio` : `${(b / 1048576).toFixed(2)} Mio`);
const sec = (s: number) => `${s.toFixed(2)} s`;

export default function DiagnosticTab({ scene, engine }: { scene: SceneResponse; engine: ReaderEngine | null }) {
  const d = scene.diagnostic;
  const previewRef = useRef<ClipPreview | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState<{ current: number; duration: number } | null>(null);

  // Une lecture libre par scène chargée ; libérée au déchargement (le mode `buttons` reprend).
  useEffect(() => {
    if (!engine) return;
    const p = new ClipPreview(engine);
    previewRef.current = p;
    return () => {
      p.dispose();
      previewRef.current = null;
      setPlaying(null);
      setTime(null);
    };
  }, [engine]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTime(previewRef.current?.time ?? null), 100);
    return () => clearInterval(t);
  }, [playing]);

  const play = (name: string) => {
    if (previewRef.current?.play(name, { loop, speed })) setPlaying(name);
  };
  const stop = () => {
    previewRef.current?.stop();
    setPlaying(null);
    setTime(null);
  };

  if (d.error) {
    return (
      <div className="text-sm">
        <p className="rounded bg-red-950 px-3 py-2 text-red-200">
          {scene.glb} illisible ({mib(d.bytes)}) : {d.error}
        </p>
      </div>
    );
  }

  const declaredAs = (as: string[]) => (as.length ? as.join(", ") : <span className="text-amber-300">non déclaré</span>);

  return (
    <div className="flex flex-col gap-5 text-sm" data-testid="diagnostic">
      <Section title="Fichier">
        <Rows
          rows={[
            ["Fichier", scene.glb],
            ["Poids", mib(d.bytes)],
            ["Générateur", d.generator ?? "—"],
            ["Extensions", d.extensions.length ? d.extensions.join(", ") : "aucune"],
            ["Contenu", `${d.counts.nodes} nœuds, ${d.counts.meshes} maillages, ${d.counts.materials} matériaux, ${d.counts.textures} textures, ${d.counts.lights} lumière(s)`],
          ]}
        />
      </Section>

      <Section title="GLBI_ROOT">
        <Rows
          rows={[
            ["Nœud GLBI_ROOT", d.glbiRoots === 1 ? "présent" : d.glbiRoots === 0 ? <Warn key="r">absent (diagnostic seul)</Warn> : <Warn key="r">{d.glbiRoots} nœuds (un seul attendu)</Warn>],
            ["glbi_version", d.glbiVersion === undefined ? "—" : JSON.stringify(d.glbiVersion)],
            ["glbi_config", d.glbiRoots === 1 ? (d.glbiConfigOk ? "objet JSON lisible" : <Warn key="c">absent ou illisible</Warn>) : "—"],
          ]}
        />
      </Section>

      <Section title={`Clips (${d.clips.length})`}>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => {
                setLoop(e.target.checked);
                previewRef.current?.setLoop(e.target.checked);
              }}
            />
            boucle
          </label>
          <label className="flex items-center gap-2">
            vitesse
            <input
              type="range"
              min={0}
              max={CLIP_PREVIEW_MAX_SPEED}
              step={0.05}
              value={speed}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSpeed(v);
                previewRef.current?.setSpeed(v);
              }}
              data-testid="clip-speed"
            />
            <span className="w-10 tabular-nums">{speed.toFixed(2)}×</span>
          </label>
          <button type="button" onClick={stop} disabled={!playing} className="rounded bg-neutral-700 px-2 py-1 disabled:opacity-40">
            Arrêter (retour au mode boutons)
          </button>
        </div>
        {!engine && <p className="mb-2 text-xs text-neutral-400">Lecture libre disponible une fois la scène chargée.</p>}
        {playing && time && (
          <p className="mb-2 text-xs tabular-nums text-neutral-300" data-testid="clip-time">
            « {playing} » : {sec(time.current % Math.max(time.duration, 1e-6))} / {sec(time.duration)}
          </p>
        )}
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-400">
            <tr>
              <th className="py-1">Clip</th>
              <th>Durée</th>
              <th>Pistes</th>
              <th>Nœuds</th>
              <th>Déclaré</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.clips.map((c) => (
              <tr key={c.name} className={`border-t border-neutral-800 ${playing === c.name ? "bg-sky-950" : ""}`} data-clip={c.name}>
                <td className="py-1 font-mono">{c.name}</td>
                <td className="tabular-nums">{sec(c.duration)}</td>
                <td className="tabular-nums">{c.tracks}</td>
                <td className="tabular-nums">{c.targets}</td>
                <td>{declaredAs(c.declaredAs)}</td>
                <td className="text-right">
                  <button type="button" disabled={!engine} onClick={() => play(c.name)} className="rounded bg-sky-700 px-2 py-0.5 disabled:opacity-40" data-play={c.name}>
                    Lire
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Maillages skinnés (${d.skins.length} skin(s))`}>
        {d.skins.length === 0 ? (
          <p className="text-xs text-neutral-400">aucun</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {d.skins.map((s, i) => (
              <li key={i}>
                <span className="font-mono">{s.name}</span> : {s.joints} os ; maillages : {s.meshes.length ? s.meshes.join(", ") : "aucun"}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Nœuds porteurs d'extras (${d.extras.length})`}>
        {d.extras.length === 0 ? (
          <p className="text-xs text-neutral-400">aucun</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {d.extras.map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.node}</span> : {e.keys.join(", ")}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Crédits des modèles (src_*, ${d.srcCredits.length})`}>
        {d.srcCredits.length === 0 ? (
          <p className="text-xs text-neutral-400">aucun</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {d.srcCredits.map((c, i) => (
              <li key={i}>
                <span className="font-mono">{c.node}</span> : {[c.credit.name, c.credit.author, c.credit.license, c.credit.url].filter(Boolean).join(" — ")}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs">
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
