"use client";
// Commandes tactiles du mini-jeu (MJ2, spec-mini-jeu.md §3 « Entrées », DP-24) : joystick **absolu** dans sa moitié de
// l'écran (il naît là où le doigt se pose) et groupe de boutons du gabarit de l'autre côté ; multitouche (un doigt sur le
// joystick, d'autres sur les boutons). Côté et taille selon les réglages du joueur, appliqués tout de suite.
// Écrit dans l'`InputCollector` lu par la boucle du jeu ; le joystick est dessiné sans rendu React à chaque mouvement.
import { useEffect, useRef } from "react";
import { CONTROL_SIZES, controlZones, inJoystickZone, joystickVector, type InputCollector } from "./input";
import type { ControlSettings } from "./gameStorage";

interface TouchControlsProps {
  input: InputCollector;
  settings: ControlSettings;
  /** Libellés des boutons du gabarit, dans l'ordre (« Bond »). */
  buttons: string[];
  joystickLabel: string;
  enabled: boolean;
  /** Bouton prêt (recharge finie), lu par la boucle : `data-ready` posé directement sur l'élément. */
  buttonRefs?: React.MutableRefObject<(HTMLButtonElement | null)[]>;
}

export default function TouchControls({ input, settings, buttons, joystickLabel, enabled, buttonRefs }: TouchControlsProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const joy = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const size = CONTROL_SIZES[settings.size];
  const zones = controlZones(settings.side);

  const release = () => {
    joy.current = null;
    input.touch = { x: 0, y: 0 };
    if (baseRef.current) baseRef.current.style.display = "none";
  };

  // Commandes désactivées (pause, fin) ou réglages changés : doigt relâché.
  useEffect(() => {
    release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, settings.side, settings.size]);

  const place = (ox: number, oy: number, px: number, py: number) => {
    const base = baseRef.current;
    const knob = knobRef.current;
    if (!base || !knob) return;
    const r = size.joystick;
    base.style.display = "block";
    base.style.left = `${ox - r}px`;
    base.style.top = `${oy - r}px`;
    const v = joystickVector(ox, oy, px, py, r);
    knob.style.transform = `translate(${v.x * r}px, ${-v.y * r}px)`;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || joy.current) return;
    const zone = zoneRef.current;
    if (!zone) return;
    const rect = zone.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!inJoystickZone(x, rect.width, settings.side)) return;
    e.preventDefault();
    joy.current = { id: e.pointerId, ox: x, oy: y };
    try {
      zone.setPointerCapture(e.pointerId);
    } catch {
      /* pointeur déjà relâché */
    }
    place(x, y, x, y);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const j = joy.current;
    const zone = zoneRef.current;
    if (!j || e.pointerId !== j.id || !zone) return;
    const rect = zone.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    input.touch = joystickVector(j.ox, j.oy, x, y, size.joystick);
    place(j.ox, j.oy, x, y);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joy.current && e.pointerId === joy.current.id) release();
  };

  const r = size.joystick;
  return (
    <div
      ref={zoneRef}
      className="absolute inset-0 z-10 select-none"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      data-testid="game-controls"
      data-side={settings.side}
      data-size={settings.size}
    >
      {/* Moitié du joystick (repère visuel, discret). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 top-0 w-1/2"
        style={{ [zones.joystick]: 0 }}
        data-testid="game-joystick-zone"
        data-zone={zones.joystick}
      />
      <div
        ref={baseRef}
        aria-hidden="true"
        title={joystickLabel}
        className="pointer-events-none absolute rounded-full border-2 border-white/50 bg-white/10"
        style={{ display: "none", width: 2 * r, height: 2 * r }}
        data-testid="game-joystick"
      >
        <div
          ref={knobRef}
          className="absolute rounded-full bg-white/70"
          style={{ width: r, height: r, left: r / 2, top: r / 2 }}
        />
      </div>
      <div
        className="absolute flex flex-col-reverse items-center gap-3"
        style={{
          bottom: "calc(var(--safe-bottom) + 1.5rem)",
          [zones.buttons]: `calc(var(--safe-${zones.buttons}) + 1.5rem)`,
        }}
        data-testid="game-buttons"
        data-zone={zones.buttons}
      >
        {buttons.map((label, i) => (
          <button
            key={label}
            ref={(el) => {
              if (buttonRefs) buttonRefs.current[i] = el;
            }}
            type="button"
            tabIndex={-1}
            aria-label={label}
            className="glbi-game-button"
            style={{ width: size.button, height: size.button }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (enabled) input.press(i);
            }}
            data-testid={`game-button-${i}`}
            data-ready="true"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
