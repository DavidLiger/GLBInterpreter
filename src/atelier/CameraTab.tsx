"use client";

// Onglet Caméra (A4, spec-atelier-glbi.md §10.2) : cadrage orbital de la couche éditoriale, réglé dans le lecteur réel.
// Distances en mètres, angles en degrés (écrits en radians), `zoom` dans [0, 1] (décision du 13/10). « Prendre la vue
// actuelle » (◎) recopie la vue du lecteur dans un champ ; la page pose ensuite le cadrage saisi en place sur le lecteur
// (Atelier.tsx, `applyFramingInPlace`). La cible est lue dans la couche 3D du GLB : affichée, non éditable.
// AC3 : pendant une action à position de caméra (DP-19) et son retour, la caméra est tenue par le lecteur : « ◎ vue » et
// « Aller à la vue de départ » sont désactivés, un bandeau le dit ; la saisie au clavier est posée au retour de la caméra.
import { useEffect, useMemo, useState } from "react";
import type { ReaderEngine } from "@/components/diorama/WebDioramaLoader";
import { resolveOrbit } from "@/components/diorama/lib/orbitFraming";
import {
  CAMERA_LABELS,
  emptyCameraFields,
  fmt,
  framingOf,
  takeFromView,
  toDeg,
  viewOf,
  withFields,
  type CameraForm,
  type CameraNumKey,
  type LookAxis,
  type OrbitView,
} from "./cameraForm";
import type { Incomplete } from "./editModel";

const input = "w-24 rounded bg-neutral-800 px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-sky-600";
const small = "rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700 disabled:opacity-40";

const deg = (rad: number) => (Number.isFinite(rad) ? `${fmt(toDeg(rad), 1)}°` : "sans borne");
const m = (v: number) => `${fmt(v, 3)} m`;

export default function CameraTab({
  camera,
  setCamera,
  savedCamera,
  target,
  engine,
  bounds,
  onBounds,
  onStartView,
  incomplete,
  held = null,
}: {
  camera: CameraForm;
  /** Nouvelle saisie ; `move` : la vue du lecteur passe à la vue de départ de la saisie. */
  setCamera: (next: CameraForm, move: boolean) => void;
  /** Cadrage du fichier enregistré (`edit.json` relu). */
  savedCamera: CameraForm;
  /** `modules.camera.target` de la couche 3D, `null` si le GLB n'a pas de cible. */
  target: string | null;
  engine: ReaderEngine | null;
  bounds: boolean;
  onBounds: (on: boolean) => void;
  onStartView: () => void;
  /** Champs signalés dans « Saisie incomplète » (onglet Caméra). */
  incomplete: Incomplete[];
  /**
   * Caméra tenue par le lecteur (action à position de caméra, DP-19, ou retour à la vue d'avant) ; `action` et `empty` :
   * action en cours et son empty, `null` pendant le retour.
   */
  held?: { action: string | null; empty: string | null } | null;
}) {
  // Vue actuelle du lecteur, relue 4 fois par seconde.
  const [view, setView] = useState<OrbitView | null>(null);
  useEffect(() => {
    if (!engine) {
      setView(null);
      return;
    }
    const read = () => setView(viewOf(engine.camera.position, engine.controls.target));
    read();
    const t = setInterval(read, 250);
    return () => clearInterval(t);
  }, [engine]);

  const radius = engine?.radius ?? null;
  const defaults = useMemo(() => (radius ? resolveOrbit({}, radius) : null), [radius]);
  const frame = useMemo(() => (radius ? resolveOrbit(framingOf(camera), radius) : null), [camera, radius]);
  const issueOf = (k: CameraNumKey) => incomplete.find((i) => i.field === `camera.${k}`)?.message;

  const setText = (k: CameraNumKey, v: string, move = true) => setCamera(withFields(camera, { text: { [k]: v } }), move);
  const take = (k: CameraNumKey) => {
    if (!view || !frame) return;
    setText(k, takeFromView(k, view, frame), false);
  };

  const placeholder = (k: CameraNumKey): string => {
    if (!defaults) return "";
    switch (k) {
      case "zoom":
        return "0.5";
      case "minDistance":
        return fmt(defaults.minDistance, 3);
      case "maxDistance":
        return fmt(defaults.maxDistance, 3);
      case "minPolarAngle":
        return "0";
      case "maxPolarAngle":
        return "90";
      default:
        return "sans borne";
    }
  };

  const row = (k: CameraNumKey, unit: string) => {
    const issue = issueOf(k);
    return (
      <div key={k} data-field={`camera.${k}`} className={`flex flex-col gap-1 rounded p-1 ${issue ? "ring-1 ring-amber-600" : ""}`}>
        <label className="flex items-center gap-2">
          <span className="w-40 text-xs text-neutral-300">{CAMERA_LABELS[k]}</span>
          <input
            className={input}
            inputMode="decimal"
            value={camera.text[k]}
            placeholder={placeholder(k)}
            onChange={(e) => setText(k, e.target.value)}
            data-testid={`camera-${k}`}
          />
          <span className="w-4 text-xs text-neutral-500">{unit}</span>
          <button
            type="button"
            className={small}
            disabled={!view || !frame || !!held}
            onClick={() => take(k)}
            title={held ? "Caméra tenue par l'action (position de caméra du GLB) : attendre son retour" : "Prendre la vue actuelle du lecteur"}
            data-testid={`take-${k}`}
          >
            ◎ vue
          </button>
        </label>
        {issue && <span className="text-xs text-amber-400">{issue.replace(/^cadrage : /, "")}</span>}
      </div>
    );
  };

  if (!target) {
    const hasFraming = Object.keys(framingOf(camera)).length > 0;
    return (
      <div className="flex flex-col gap-3 text-sm" data-field="camera">
        <p className="text-neutral-300">
          Pas de cible caméra dans le GLB (<span className="font-mono">camera.target</span>, addon) : le lecteur garde sa vue par défaut et le
          cadrage ne peut pas être réglé ici.
        </p>
        {hasFraming && (
          <button type="button" className={`${small} self-start`} onClick={() => setCamera(withFields(camera, emptyCameraFields()), false)}>
            Vider le cadrage d&apos;edit.json
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-sm" data-field="camera">
      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">Cible</h3>
        <p className="rounded bg-neutral-900 px-3 py-2 text-xs" data-field="camera.target">
          <span className="font-mono">{target}</span>
          {engine && (
            <span className="text-neutral-400">
              {" "}
              · position monde ({[engine.controls.target.x, engine.controls.target.y, engine.controls.target.z].map((v) => fmt(v, 3)).join(", ")})
            </span>
          )}
          <span className="block text-neutral-500">Couche 3D : se règle dans Blender (addon), non éditable ici.</span>
        </p>
      </section>

      {held && (
        <p className="rounded bg-amber-950 px-3 py-2 text-xs text-amber-200" data-testid="camera-held">
          {held.action ? (
            <>
              Caméra tenue par l&apos;action « {held.action} » (posée sur l&apos;empty <span className="font-mono">{held.empty}</span>, couche 3D)
            </>
          ) : (
            "Caméra en retour à la vue d'avant l'action"
          )}
          {" "}: elle revient seule à la fin de l&apos;action. En attendant, « ◎ vue » et « Aller à la vue de départ » sont désactivés ; une
          valeur saisie au clavier est gardée et posée sur le lecteur au retour de la caméra.
        </p>
      )}

      <section className="flex flex-col gap-1" data-testid="camera-view">
        <h3 className="font-semibold">Vue actuelle du lecteur</h3>
        {view && frame ? (
          <p className="text-xs text-neutral-300">
            distance {m(view.distance)} · polaire {deg(view.polarAngle)} · azimut {deg(view.azimuthAngle)}
          </p>
        ) : (
          <p className="text-xs text-neutral-500">lecteur en cours de chargement…</p>
        )}
        <label className="mt-1 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={bounds} onChange={(e) => onBounds(e.target.checked)} data-testid="camera-bounds" />
          Appliquer les bornes (décoché : vue libre, pour viser au-delà des bornes saisies)
        </label>
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">Distances</h3>
        <p className="text-xs text-neutral-500">
          Vide = valeur par défaut du lecteur (1,5 r à 6 r, r = {radius ? m(radius) : "…"}). ◎ recopie la distance actuelle.
        </p>
        {row("minDistance", "m")}
        {row("maxDistance", "m")}
        {row("zoom", "")}
        <p className="text-xs text-neutral-500">
          Zoom de départ : 0 = distance minimale, 1 = maximale (vide = 0,5). ◎ calcule (distance − min) / (max − min) avec les distances ci-dessus.
        </p>
        <label className="flex items-center gap-2 text-xs" data-field="camera.enableZoom">
          <input
            type="checkbox"
            checked={camera.enableZoom}
            onChange={(e) => setCamera(withFields(camera, { enableZoom: e.target.checked }), false)}
            data-testid="camera-enableZoom"
          />
          {CAMERA_LABELS.enableZoom} (décoché : distance fixe, celle du départ)
        </label>
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">Angle polaire</h3>
        <p className="text-xs text-neutral-500">0° = caméra au-dessus, 90° = à l&apos;horizontale. Vide = [0°, 90°], départ à 70° ; déclaré, départ au milieu des bornes.</p>
        {row("minPolarAngle", "°")}
        {row("maxPolarAngle", "°")}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">Azimut</h3>
        <p className="text-xs text-neutral-500">
          0° = de face (vue de face de Blender), 90° = profil (caméra sur +X). Vide = sans borne ; les deux bornes déclarées, départ au milieu.
        </p>
        {row("minAzimuthAngle", "°")}
        {row("maxAzimuthAngle", "°")}
        <label className="flex items-center gap-2" data-field="camera.lookAxis">
          <span className="w-40 text-xs text-neutral-300">{CAMERA_LABELS.lookAxis}</span>
          <select
            className="rounded bg-neutral-800 px-2 py-1 text-sm"
            value={camera.lookAxis}
            onChange={(e) => setCamera(withFields(camera, { lookAxis: e.target.value as LookAxis }), true)}
            data-testid="camera-lookAxis"
          >
            <option value="">(défaut : face)</option>
            <option value="x">x : profil</option>
            <option value="y">y : face</option>
            <option value="z">z : face</option>
          </select>
        </label>
        <p className="text-xs text-neutral-500">L&apos;axe de vue ne compte que si les deux bornes d&apos;azimut ne sont pas déclarées.</p>
      </section>

      {frame && (
        <section className="flex flex-col gap-1">
          <h3 className="font-semibold">Vue de départ de la saisie</h3>
          <p className="text-xs text-neutral-300" data-testid="camera-start">
            distance {m(frame.distance)} · polaire {deg(frame.polarAngle)} · azimut {deg(frame.azimuthAngle)}
            <span className="block text-neutral-500">
              bornes : {m(frame.minDistance)} à {m(frame.maxDistance)} · polaire {deg(frame.minPolarAngle)} à {deg(frame.maxPolarAngle)} · azimut{" "}
              {Number.isFinite(frame.minAzimuthAngle) || Number.isFinite(frame.maxAzimuthAngle)
                ? `${deg(frame.minAzimuthAngle)} à ${deg(frame.maxAzimuthAngle)}`
                : "sans borne"}
            </span>
          </p>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={small} disabled={!engine || !!held} onClick={onStartView} data-testid="camera-start-view">
          Aller à la vue de départ
        </button>
        <button
          type="button"
          className={small}
          onClick={() => setCamera(savedCamera, true)}
          data-testid="camera-revert"
          title="Reprendre le cadrage de edit.json enregistré"
        >
          Revenir au cadrage enregistré
        </button>
        <button
          type="button"
          className={small}
          onClick={() => setCamera(withFields(camera, emptyCameraFields()), true)}
          title="Tous les champs vides : valeurs par défaut du lecteur"
        >
          Vider le cadrage
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        Saisie en mètres et en degrés ; enregistrée en radians dans edit.json. Seuls les champs valides sont enregistrés ; une paire min &gt; max
        n&apos;enregistre aucune de ses deux bornes (signalé dans le Rapport).
      </p>
    </div>
  );
}
