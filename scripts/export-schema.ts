// scripts/export-schema.ts — JSON Schema de la couche 3D pour l'addon GLBGenerator (D-8.9, spec-atelier-glbi.md §6).
//
//   npm run schema:export                                   écrit schema/glbi-layer3d.schema.json (fichier commité)
//   npm run schema:export -- --addon <dossier glb_generator> écrit aussi <dossier>/schema/glbi-layer3d.schema.json
//
// Source unique du contrat : `layer3dSchema` (src/schema/glbi.ts), exporté par `z.toJSONSchema(…, { io: 'input' })`.
// L'export couvre la forme (types, motifs, bornes, clés interdites, valeurs par défaut) ; les `superRefine` (identifiants
// d'action ou d'événement en double) n'y figurent pas : l'addon les contrôle lui-même et le build reste l'autorité finale.
// Actions combinées (AC1) : `transition` et `events` ajoutés, facultatifs ; position de caméra (AC2, DP-19) : `cameraPosition`
// ajouté, facultatif (chaîne au motif des noms Blender) ; `$id` inchangé (couche 3D, version 2).
// Mini-jeu (MJ1, spec-mini-jeu.md §7) : `schema/glbi-game3d.schema.json`, couche 3D des GLB de `game/` (addon v0.4) : un seul
// fichier, deux schémas sous `$defs` (`entity` pour `game/<entité>.glb`, `arena` pour `game/arena.glb`), l'addon valide
// chaque GLB contre le sien ; mots-clés du sous-ensemble de `schema_check.py` (contrôlé par test:schema).
// `npm run book:check` échoue si un fichier commité diffère de ce que produirait ce script (`checkSchemaFresh`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { GAME3D_VERSION, game3dArenaSchema, game3dEntitySchema, LAYER3D_VERSION, layer3dSchema } from '../src/schema/glbi';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_REL = 'schema/glbi-layer3d.schema.json';
export const GAME_SCHEMA_REL = 'schema/glbi-game3d.schema.json';

/** Texte exact du fichier (JSON indenté de 2 espaces, retour à la ligne final). */
export function layer3dSchemaText(): string {
  const { $schema, ...rest } = z.toJSONSchema(layer3dSchema, { io: 'input' }) as Record<string, unknown>;
  const doc = {
    $schema,
    $id: `urn:glbinterpreter:schema:layer3d/${LAYER3D_VERSION}`,
    $comment: 'généré par npm run schema:export (src/schema/glbi.ts, layer3dSchema), ne pas éditer',
    ...rest,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Texte exact de `schema/glbi-game3d.schema.json` (MJ1) : schémas de l'entité et de l'arène sous `$defs`. */
export function game3dSchemaText(): string {
  const one = (schema: z.ZodType) => {
    const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>;
    void _ignored;
    return rest;
  };
  const doc = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `urn:glbinterpreter:schema:game3d/${GAME3D_VERSION}`,
    $comment:
      'généré par npm run schema:export (src/schema/glbi.ts, game3dEntitySchema et game3dArenaSchema), ne pas éditer ; ' +
      'valider glbi_game_config d\'une entité (game/<id>.glb) contre $defs.entity, celui de l\'arène (game/arena.glb) contre $defs.arena',
    $defs: { entity: one(game3dEntitySchema), arena: one(game3dArenaSchema) },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Fichiers exportés et leur texte attendu. */
const EXPORTS = (): { rel: string; text: () => string; what: string }[] => [
  { rel: SCHEMA_REL, text: layer3dSchemaText, what: 'layer3dSchema' },
  { rel: GAME_SCHEMA_REL, text: game3dSchemaText, what: 'game3dEntitySchema, game3dArenaSchema' },
];

/** Message d'erreur si un fichier commité est absent ou périmé, `null` s'ils sont à jour. */
export function checkSchemaFresh(): string | null {
  for (const e of EXPORTS()) {
    const file = path.join(ROOT, e.rel);
    if (!fs.existsSync(file)) return `${e.rel} absent : lancer npm run schema:export et commiter le fichier`;
    if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== e.text()) {
      return `${e.rel} périmé (différent de ${e.what}) : lancer npm run schema:export, commiter, et recopier dans l'addon (--addon)`;
    }
  }
  return null;
}

function main(argv: string[]): void {
  let addon: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--addon' && argv[i + 1]) addon = argv[++i];
    else {
      console.error(`schema:export : option inconnue « ${argv[i]} » (option : --addon <dossier glb_generator>)`);
      process.exit(2);
    }
  }
  const dir = addon ? path.resolve(process.cwd(), addon) : null;
  if (dir && !fs.existsSync(path.join(dir, '__init__.py'))) {
    console.error(`schema:export : ${dir} n'est pas le dossier de l'addon (pas de __init__.py)`);
    process.exit(1);
  }
  for (const e of EXPORTS()) {
    const text = e.text();
    const out = path.join(ROOT, e.rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, text);
    console.log(`schema:export : ${e.rel} (${e.rel === SCHEMA_REL ? `couche 3D, version ${LAYER3D_VERSION}` : `couche 3D du jeu, version ${GAME3D_VERSION}`})`);
    if (dir) {
      const target = path.join(dir, 'schema', path.basename(e.rel));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
      console.log(`schema:export : copie dans ${target} (à commiter dans blender-addons)`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
