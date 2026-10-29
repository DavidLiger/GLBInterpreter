"use client";
// Écrans du mini-jeu (MJ2, spec-mini-jeu.md §3 « Affichage », §4) : consigne (titre, règle, « Jouer »), pause
// (« Continuer »), fin (« Bravo ! », score, meilleur score, nouveau record, « Rejouer ») ; panneau des réglages des
// commandes (DP-24 : côté et taille, à icônes, effet immédiat) sur l'écran de consigne et l'écran de pause ; aide du
// clavier (DP-26) si l'appareil en a un, de la manette (DP-27) si une manette est branchée. Style `glbi-*`, zones sûres.
import type { ReactNode } from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import type { ControlSettings } from "./gameStorage";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** Fond d'un écran du jeu : colonne centrée, au-dessus de la scène, dans les zones sûres. */
export function GameScreen({ children, testId, label }: { children: ReactNode; testId: string; label: string }) {
  return (
    <section
      aria-label={label}
      className="glbi-safe-padding absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/65 text-center text-white"
      style={{ paddingTop: "calc(var(--safe-top) + 3.75rem)" }}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

/** Icône du côté : téléphone couché, joystick (cercle) et bouton (point) placés selon le côté. */
function SideIcon({ side }: { side: ControlSettings["side"] }) {
  const joyX = side === "right" ? 11 : 29;
  const btnX = side === "right" ? 30 : 10;
  return (
    <svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true">
      <rect x="1" y="1" width="38" height="22" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx={joyX} cy="14" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx={btnX} cy="15" r="3" fill="currentColor" />
    </svg>
  );
}

function SizeIcon({ size }: { size: ControlSettings["size"] }) {
  const r = size === "large" ? 8 : 5;
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="currentColor" />
    </svg>
  );
}

function Choice({ pressed, onClick, label, icon, testId }: { pressed: boolean; onClick: () => void; label: string; icon: ReactNode; testId: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`glbi-btn min-h-11 gap-2 px-3 py-2 text-sm ${pressed ? "glbi-btn-primary" : "glbi-btn-secondary"}`}
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** Réglages des commandes (DP-24) : côté (droitier, gaucher) et taille (normale, grande), effet immédiat. */
export function ControlsPanel({ settings, onChange }: { settings: ControlSettings; onChange: (s: ControlSettings) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="glbi-panel flex w-full max-w-md flex-col gap-3 px-4 py-3" data-testid="game-controls-panel">
      <legend className="sr-only">{t.jeu.controls}</legend>
      <p className="text-sm font-semibold text-white/80" aria-hidden="true">{t.jeu.controls}</p>
      <div role="group" aria-label={t.jeu.side} className="flex flex-wrap items-center justify-center gap-2">
        <span className="w-16 text-left text-sm text-white/70" aria-hidden="true">{t.jeu.side}</span>
        <Choice pressed={settings.side === "right"} onClick={() => onChange({ ...settings, side: "right" })} label={t.jeu.sideRight} icon={<SideIcon side="right" />} testId="controls-side-right" />
        <Choice pressed={settings.side === "left"} onClick={() => onChange({ ...settings, side: "left" })} label={t.jeu.sideLeft} icon={<SideIcon side="left" />} testId="controls-side-left" />
      </div>
      <div role="group" aria-label={t.jeu.size} className="flex flex-wrap items-center justify-center gap-2">
        <span className="w-16 text-left text-sm text-white/70" aria-hidden="true">{t.jeu.size}</span>
        <Choice pressed={settings.size === "normal"} onClick={() => onChange({ ...settings, size: "normal" })} label={t.jeu.sizeNormal} icon={<SizeIcon size="normal" />} testId="controls-size-normal" />
        <Choice pressed={settings.size === "large"} onClick={() => onChange({ ...settings, size: "large" })} label={t.jeu.sizeLarge} icon={<SizeIcon size="large" />} testId="controls-size-large" />
      </div>
    </fieldset>
  );
}

/** Aide du clavier (si l'appareil en a un) et de la manette (si une manette est branchée). */
export function InputHelp({ keyboard, gamepad, buttons }: { keyboard: boolean; gamepad: boolean; buttons: string[] }) {
  const { t } = useTranslation();
  if (!keyboard && !gamepad) return null;
  const keyNames = [t.jeu.keySpace, "J", "K", "L"];
  return (
    <div className="max-w-md text-sm text-white/75" data-testid="game-input-help">
      {keyboard && (
        <ul className="flex flex-col gap-0.5" aria-label={t.jeu.keyboard} data-testid="game-keys">
          <li>{t.jeu.keysMove}</li>
          {buttons.map((name, i) => (
            <li key={name}>{fill(t.jeu.keysButton, { key: keyNames[i], name })}</li>
          ))}
          <li>{t.jeu.keysPause}</li>
        </ul>
      )}
      {gamepad && <p className="mt-1" data-testid="game-pad-help">{fill(t.jeu.gamepad, { name: buttons[0] ?? "" })}</p>}
    </div>
  );
}

export { fill };
