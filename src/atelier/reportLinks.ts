// Rapport → champ (A3, spec-atelier-glbi.md §10.7) : chaque ligne du rapport qui concerne la couche éditoriale de la scène
// affichée mène au champ du formulaire concerné. Reconnaissance par les textes de `book:check` (scripts/book-check.ts,
// src/schema/merge.ts), qui sont le contrat d'affichage ; une ligne non reconnue reste sans lien.
import type { EditForm, FieldRef } from "./editModel";

/** Champ désigné par un chemin de `edit.json` (`scene.name.en`, `modules.animations.actions.walk.label`, …). */
function fieldOfEditPath(p: string[], form: EditForm): FieldRef | null {
  if (p[0] === "scene") return p[1] === "loaderImage" ? { tab: "scene", field: "scene.loaderImage" } : { tab: "scene", field: "scene.name" };
  if (p[0] !== "modules") return null;
  switch (p[1]) {
    case "animations": {
      const id = p[3];
      if (!id) return { tab: "actions", field: "actions" };
      const what = p[4] === "icon" || p[4] === "sound" ? p[4] : "label";
      return { tab: "actions", field: `action.${id}.${what}` };
    }
    case "audio":
      return { tab: "ambiance", field: "audio.ambientSound" };
    case "quiz":
      if (p[2] === "choices") return { tab: "quiz", field: p[3] !== undefined ? `quiz.choice.${p[3]}` : "quiz.correct" };
      return { tab: "quiz", field: p[2] === "explanation" ? "quiz.explanation" : "quiz.question" };
    case "credits": {
      const c = p[3] !== undefined ? form.credits[Number(p[3])] : undefined;
      return { tab: "credits", field: c ? `credit.${c.asset}` : "credits" };
    }
    default:
      return null; // camera : onglet Caméra (A4)
  }
}

/** Champ qui utilise un asset (image de chargement, icône, son d'action, ambiance), sinon son crédit. */
function fieldOfAsset(asset: string, form: EditForm): FieldRef {
  if (form.loaderImage === asset) return { tab: "scene", field: "scene.loaderImage" };
  for (const [id, a] of form.actions) {
    if (a.icon === asset) return { tab: "actions", field: `action.${id}.icon` };
    if (a.sound === asset) return { tab: "actions", field: `action.${id}.sound` };
  }
  if (form.ambientSound === asset) return { tab: "ambiance", field: "audio.ambientSound" };
  return { tab: "credits", field: `credit.${asset}` };
}

/**
 * Champ du formulaire visé par une ligne du rapport de la scène `sceneId`, ou `null`. `glbIds` : actions du GLB dans leur
 * ordre (chemins de l'objet fusionné, indexés par position).
 */
export function fieldOfMessage(message: string, sceneId: string, form: EditForm, glbIds: readonly string[]): FieldRef | null {
  const editFile = `scenes/${sceneId}.edit.json`;
  let m: RegExpExecArray | null;
  if ((m = /action « (.+?) » sans libellé/.exec(message))) return { tab: "actions", field: `action.${m[1]}.label` };
  if (/nom de la scène \(scene\.name\) absent/.test(message)) return { tab: "scene", field: "scene.name" };
  if ((m = /son « (.+?) » sans entrée dans modules\.credits\.assets/.exec(message))) return { tab: "credits", field: `credit.${m[1]}` };
  if ((m = /crédit pour « (.+?) », asset non utilisé/.exec(message))) return { tab: "credits", field: `credit.${m[1]}` };
  if ((m = /action « (.+?) » absente du GLB/.exec(message))) return { tab: "actions", field: `orphan.${m[1]}` };
  if ((m = /^asset « (.+?) » introuvable/.exec(message))) return fieldOfAsset(m[1], form);
  if (message.startsWith(`${editFile} : `)) {
    const rest = message.slice(editFile.length + 3);
    const path = rest.slice(0, rest.indexOf(" : ") < 0 ? undefined : rest.indexOf(" : "));
    return path === "(racine)" ? null : fieldOfEditPath(path.split("."), form);
  }
  if ((m = /\(objet fusionné\) : (\S+) : /.exec(message))) {
    const p = m[1].split(".");
    // Objet fusionné : les actions sont un tableau dans l'ordre du GLB.
    if (p[0] === "modules" && p[1] === "animations" && p[2] === "actions" && p[3] !== undefined) {
      const id = glbIds[Number(p[3])];
      if (id) return fieldOfEditPath(["modules", "animations", "actions", id, ...p.slice(4)], form);
    }
    return fieldOfEditPath(p, form);
  }
  return null;
}
