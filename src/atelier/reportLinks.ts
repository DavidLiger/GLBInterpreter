// Rapport → champ (A3, spec-atelier-glbi.md §10.7) : chaque ligne du rapport qui concerne la couche éditoriale de la scène
// affichée mène au champ du formulaire concerné. Reconnaissance par les textes de `book:check` (scripts/book-check.ts,
// src/schema/merge.ts), qui sont le contrat d'affichage ; une ligne non reconnue reste sans lien. AC3 : événements (sans
// son, orphelin, instant hors du clip, chemins `…actions.<id>.events.<événement>…`) et position de caméra (DP-19). CC2 : carte
// de collection (intitulé absent de book.json, caractéristique sans valeur, carte sans paragraphe, chemins `modules.card…` ;
// CC3 : type absent de book.json, intitulé absent du type).
import { CAMERA_NUM_KEYS } from "./cameraForm";
import type { EditForm, FieldRef } from "./editModel";

/** Événements de chaque action, dans l'ordre du GLB. */
type GlbEvents = Readonly<Record<string, readonly string[]>>;

/** Champ d'un événement : celui du GLB, sinon l'entrée orpheline. */
const eventField = (action: string, event: string, glbEvents: GlbEvents): FieldRef => ({
  tab: "actions",
  field: (glbEvents[action] ?? []).includes(event) ? `event.${action}.${event}` : `eventOrphan.${action}.${event}`,
});

/** Champ désigné par un chemin de `edit.json` (`scene.name.en`, `modules.animations.actions.walk.label`, …). */
function fieldOfEditPath(p: string[], form: EditForm, glbEvents: GlbEvents = {}): FieldRef | null {
  if (p[0] === "scene") return p[1] === "loaderImage" ? { tab: "scene", field: "scene.loaderImage" } : { tab: "scene", field: "scene.name" };
  if (p[0] !== "modules") return null;
  switch (p[1]) {
    case "animations": {
      const id = p[3];
      if (!id) return { tab: "actions", field: "actions" };
      if (p[4] === "events") return p[5] ? eventField(id, p[5], glbEvents) : { tab: "actions", field: `action.${id}.events` };
      const what = p[4] === "icon" || p[4] === "sound" ? p[4] : "label";
      return { tab: "actions", field: `action.${id}.${what}` };
    }
    case "audio":
      return { tab: "ambiance", field: "audio.ambientSound" };
    case "quiz":
      if (p[2] === "choices") return { tab: "quiz", field: p[3] !== undefined ? `quiz.choice.${p[3]}` : "quiz.correct" };
      return { tab: "quiz", field: p[2] === "explanation" ? "quiz.explanation" : "quiz.question" };
    case "card": {
      // Carte de collection (CC2) : `modules.card.<subtitle|image|text>…`, `modules.card.fields.<id>.<langue>`.
      if (p[2] === "fields") return { tab: "card", field: p[3] ? `card.field.${p[3]}` : "card.fields" };
      if (p[2] === "type") return { tab: "card", field: "card.type" };
      if (p[2] === "subtitle" || p[2] === "image" || p[2] === "text") return { tab: "card", field: `card.${p[2]}` };
      return { tab: "card", field: "card.text" };
    }
    case "credits": {
      const c = p[3] !== undefined ? form.credits[Number(p[3])] : undefined;
      return { tab: "credits", field: c ? `credit.${c.asset}` : "credits" };
    }
    case "camera": {
      // Onglet Caméra (A4) : champ du cadrage, sinon l'onglet (cible : couche 3D, affichée dans l'onglet).
      const k = p[2];
      if (k === "target") return { tab: "camera", field: "camera.target" };
      if (k === "lookAxis" || k === "enableZoom" || (CAMERA_NUM_KEYS as readonly string[]).includes(k)) return { tab: "camera", field: `camera.${k}` };
      return { tab: "camera", field: "camera" };
    }
    default:
      return null;
  }
}

/** Champ qui utilise un asset (image de chargement, icône, son d'action, ambiance, illustration de la carte), sinon son crédit. */
function fieldOfAsset(asset: string, form: EditForm): FieldRef {
  if (form.loaderImage === asset) return { tab: "scene", field: "scene.loaderImage" };
  for (const [id, a] of form.actions) {
    if (a.icon === asset) return { tab: "actions", field: `action.${id}.icon` };
    if (a.sound === asset) return { tab: "actions", field: `action.${id}.sound` };
    const ev = a.events.find(([, e]) => e.sound === asset);
    if (ev) return { tab: "actions", field: `event.${id}.${ev[0]}` };
  }
  if (form.ambientSound === asset) return { tab: "ambiance", field: "audio.ambientSound" };
  if (form.card.image === asset) return { tab: "card", field: "card.image" };
  return { tab: "credits", field: `credit.${asset}` };
}

/**
 * Champ du formulaire visé par une ligne du rapport de la scène `sceneId`, ou `null`. `glbIds` : actions du GLB dans leur
 * ordre (chemins de l'objet fusionné, indexés par position) ; `glbEvents` : événements de chaque action dans l'ordre du GLB.
 */
export function fieldOfMessage(message: string, sceneId: string, form: EditForm, glbIds: readonly string[], glbEvents: GlbEvents = {}): FieldRef | null {
  const editFile = `scenes/${sceneId}.edit.json`;
  let m: RegExpExecArray | null;
  // Actions combinées (AC1, AC2, AC3) : avant les autres motifs (« action « … » : événement « … » absent du GLB » commence
  // par le nom de edit.json).
  if ((m = /événement « (.+?) » de l'action « (.+?) » sans son/.exec(message))) return eventField(m[2], m[1], glbEvents);
  if ((m = /action « (.+?) » : événement « (.+?) » (?:absent du GLB|à [\d,.]+ s, clip de)/.exec(message))) return eventField(m[1], m[2], glbEvents);
  if ((m = /action « (.+?) » : (?:position de caméra|cameraPosition) « /.exec(message))) return { tab: "actions", field: `action.${m[1]}.cameraPosition` };
  // Carte de collection (CC1, CC2) : avant le motif des chemins de edit.json (l'intitulé absent y figure après le chemin).
  if ((m = /modules\.card\.fields : intitulé « (.+?) » absent de book\.json/.exec(message))) return { tab: "card", field: `card.field.${m[1]}` };
  // Types de cartes (CC3) : type inconnu → menu Type ; valeur d'un intitulé absent du type → valeur orpheline.
  if (/modules\.card\.type : type « .+? » absent de book\.json/.test(message)) return { tab: "card", field: "card.type" };
  if ((m = /modules\.card\.fields : intitulé « (.+?) » absent du type « /.exec(message))) return { tab: "card", field: `card.field.${m[1]}` };
  if ((m = /carte : caractéristique « (.+?) » sans valeur/.exec(message))) return { tab: "card", field: `card.field.${m[1]}` };
  if (/carte sans paragraphe \(modules\.card\.text\)/.test(message)) return { tab: "card", field: "card.text" };
  if ((m = /action « (.+?) » sans libellé/.exec(message))) return { tab: "actions", field: `action.${m[1]}.label` };
  if (/nom de la scène \(scene\.name\) absent/.test(message)) return { tab: "scene", field: "scene.name" };
  if ((m = /son « (.+?) » sans entrée dans modules\.credits\.assets/.exec(message))) return { tab: "credits", field: `credit.${m[1]}` };
  if ((m = /crédit pour « (.+?) », asset non utilisé/.exec(message))) return { tab: "credits", field: `credit.${m[1]}` };
  if ((m = /action « (.+?) » absente du GLB/.exec(message))) return { tab: "actions", field: `orphan.${m[1]}` };
  if ((m = /^asset « (.+?) » introuvable/.exec(message))) return fieldOfAsset(m[1], form);
  // Caméra (A4)
  if (/cadrage non réglé, valeurs par défaut du lecteur/.test(message)) return { tab: "camera", field: "camera" };
  if (/modules\.camera réglé mais pas de cible dans le GLB/.test(message)) return { tab: "camera", field: "camera" };
  if (/camera\.target « .+? » /.test(message)) return { tab: "camera", field: "camera.target" };
  if (message.startsWith(`${editFile} : `)) {
    const rest = message.slice(editFile.length + 3);
    const path = rest.slice(0, rest.indexOf(" : ") < 0 ? undefined : rest.indexOf(" : "));
    return path === "(racine)" ? null : fieldOfEditPath(path.split("."), form, glbEvents);
  }
  if ((m = /\(objet fusionné\) : (\S+) : /.exec(message))) {
    const p = m[1].split(".");
    // Objet fusionné : les actions sont un tableau dans l'ordre du GLB.
    if (p[0] === "modules" && p[1] === "animations" && p[2] === "actions" && p[3] !== undefined) {
      const id = glbIds[Number(p[3])];
      // Événements de l'objet fusionné : tableau dans l'ordre du GLB.
      if (id && p[4] === "events" && p[5] !== undefined) {
        const ev = (glbEvents[id] ?? [])[Number(p[5])];
        if (ev) return eventField(id, ev, glbEvents);
      }
      if (id) return fieldOfEditPath(["modules", "animations", "actions", id, ...p.slice(4)], form, glbEvents);
    }
    return fieldOfEditPath(p, form, glbEvents);
  }
  return null;
}
