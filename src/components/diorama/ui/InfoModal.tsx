"use client";

// Fenêtre « Informations » (Î12, U-02, U-17 à U-19) : primitive `<dialog>` modale (`ui/Dialog.tsx`) : focus dans la
// fenêtre, Échap, clic sur le fond ou bouton « Fermer » (traduit, 44 px) la ferment, focus rendu au bouton qui l'a
// ouverte. Aide limitée aux gestes que la scène propose (scène v1 : tourner, zoomer si permis, boutons d'animation,
// son). Crédits : modèles 3D, sons, images (et musiques de la fixture), chacun avec auteur et licence ; titre, mention
// légale et année du livre (l'année n'est plus « 2025 » par défaut). Contrastes relevés (texte secondaire ≥ 4,5:1 sur
// le fond du panneau).
import React, { useId } from "react";
import { Info, X } from "lucide-react";
import type { CreditEntry, DioramaCredits } from "@/types/diorama";
import { useTranslation } from "@/contexts/TranslationContext";
import Dialog from "@/components/ui/Dialog";
import LanguageSelector from "./LanguageSelector";

/** Gestes et contrôles présents dans la scène (aide de la fenêtre). */
export interface InfoHelp {
  zoom: boolean;
  buttons: boolean;
  sound: boolean;
  poi: boolean;
  subtitles: boolean;
}

interface InfoModalProps {
  show: boolean;
  onClose: () => void;
  credits?: DioramaCredits;
  isMobile: boolean;
  poiIcon?: string;
  help: InfoHelp;
  /** Contenu ajouté en fin de fenêtre par la page du livre (AN1 : réglage des annonces) ; absent dans l'atelier. */
  extra?: React.ReactNode;
}

export default function InfoModal({ show, onClose, credits, isMobile, poiIcon, help, extra }: InfoModalProps) {
  const rotateIcon = isMobile ? "icons/dioramas/UI/one-finger.png" : "icons/dioramas/UI/mouse-left-click.png";
  const zoomIcon = isMobile ? "icons/dioramas/UI/two-fingers.png" : "icons/dioramas/UI/mouse-scroll.png";
  const { t, lang } = useTranslation();
  const titleId = useId();

  const project = typeof credits?.project === "string" ? credits.project : credits?.project?.[lang];
  const sections: [string, CreditEntry[] | undefined][] = [
    [t.info.models, credits?.models],
    [t.info.sounds, credits?.sounds],
    [t.info.music, credits?.music],
    [t.info.images, credits?.images],
    [t.info.credits, credits?.other],
  ];
  const hasCredits = sections.some(([, list]) => list?.length) || !!credits?.licenses?.length;

  return (
    <Dialog open={show} onClose={onClose} labelledBy={titleId} className="glbi-dialog" testId="info-modal">
      <div className="glbi-panel flex max-h-[inherit] flex-col p-5" style={{ maxHeight: "calc(100dvh - var(--safe-top) - var(--safe-bottom))" }}>
        <div className="mb-3 flex items-start gap-2">
          <h2 id={titleId} className="flex flex-1 flex-row items-center gap-2 pt-2 text-xl font-semibold">
            <Info size={24} aria-hidden="true" /> {t.info.title}
          </h2>
          <button type="button" onClick={onClose} className="glbi-icon-btn bg-white/10 hover:bg-white/20" aria-label={t.common.close} data-testid="info-close">
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="mb-4">
          <LanguageSelector />
        </div>

        <div className="overflow-y-auto pr-1">
          {credits?.description && <p className="mb-4 text-sm text-white/90">{credits.description[lang]}</p>}

          <ul className="space-y-3 text-sm leading-relaxed">
            <HelpLine icon={rotateIcon}>
              {t.info.rotate} {isMobile ? t.info.rotateMobile : t.info.rotateDesktop}
            </HelpLine>
            {help.zoom && (
              <HelpLine icon={zoomIcon}>
                {t.info.zoom} {isMobile ? t.info.zoomMobile : t.info.zoomDesktop}
              </HelpLine>
            )}
            {help.buttons && <HelpLine glyph="▶">{t.info.actions}</HelpLine>}
            {help.poi && (
              <HelpLine icon={poiIcon} glyph="📍">
                {t.info.poi}
              </HelpLine>
            )}
            {help.sound && <HelpLine icon="icons/dioramas/UI/sound.png">{t.info.sound}</HelpLine>}
            {help.subtitles && <HelpLine icon="icons/dioramas/UI/chat_on.png">{t.info.subtitles}</HelpLine>}
          </ul>

          <p className="mt-4 text-xs text-zinc-300">{t.info.recommendedBrowsers}</p>

          {(hasCredits || project || credits?.legal) && (
            <section aria-label={t.info.credits} className="mt-4 border-t border-white/25 pt-4 text-sm" data-testid="info-credits">
              <h3 className="mb-2 font-semibold">{t.info.credits}</h3>
              <div className="space-y-3">
                {sections.map(([label, list]) =>
                  list?.length ? (
                    <div key={label}>
                      <h4 className="font-semibold text-white/95">{label}</h4>
                      <ul className="ml-4 list-disc space-y-1 text-zinc-200">
                        {list.map((c, i) => (
                          <li key={i}>
                            <CreditLine entry={c} licenseWord={t.info.license} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
                {credits?.licenses?.length ? (
                  <p className="text-xs text-zinc-300">
                    {t.info.licenses} {credits.licenses.join(", ")}
                  </p>
                ) : null}
              </div>
              {(project || credits?.legal || credits?.year) && (
                <p className="mt-4 text-center text-xs text-zinc-300" data-testid="info-legal">
                  {[project, [credits?.legal?.[lang], credits?.year].filter(Boolean).join(" ")].filter(Boolean).join(" — ")}
                </p>
              )}
            </section>
          )}
          {extra}
        </div>
      </div>
    </Dialog>
  );
}

function HelpLine({ icon, glyph, children }: { icon?: string; glyph?: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">
        {icon ? (
          // eslint-disable-next-line @next/next/no-img-element -- export statique (D-7.5)
          <img src={icon} alt="" className="max-h-8 max-w-8 object-contain" draggable={false} />
        ) : (
          <span className="text-lg">{glyph}</span>
        )}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** « Titre — Auteur (licence CC0) · source » ; la source est affichée en texte (pas de lien qui ferait quitter l'application). */
function CreditLine({ entry, licenseWord }: { entry: CreditEntry; licenseWord: string }) {
  return (
    <>
      <span className="text-white">{entry.title}</span>
      {entry.author && ` — ${entry.author}`}
      {entry.license && <span className="text-zinc-300"> ({licenseWord} {entry.license})</span>}
      {entry.source && <span className="block break-all text-xs text-zinc-300">{entry.source}</span>}
    </>
  );
}
