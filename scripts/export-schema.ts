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
// `npm run book:check` échoue si le fichier commité diffère de ce que produirait ce script (`checkSchemaFresh`).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { LAYER3D_VERSION, layer3dSchema } from '../src/schema/glbi';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SCHEMA_REL = 'schema/glbi-layer3d.schema.json';

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

/** Message d'erreur si le fichier commité est absent ou périmé, `null` s'il est à jour. */
export function checkSchemaFresh(): string | null {
  const file = path.join(ROOT, SCHEMA_REL);
  if (!fs.existsSync(file)) return `${SCHEMA_REL} absent : lancer npm run schema:export et commiter le fichier`;
  if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== layer3dSchemaText()) {
    return `${SCHEMA_REL} périmé (différent de layer3dSchema) : lancer npm run schema:export, commiter, et recopier dans l'addon (--addon)`;
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
  const text = layer3dSchemaText();
  const out = path.join(ROOT, SCHEMA_REL);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, text);
  console.log(`schema:export : ${SCHEMA_REL} (couche 3D, version ${LAYER3D_VERSION})`);
  if (addon) {
    const dir = path.resolve(process.cwd(), addon);
    if (!fs.existsSync(path.join(dir, '__init__.py'))) {
      console.error(`schema:export : ${dir} n'est pas le dossier de l'addon (pas de __init__.py)`);
      process.exit(1);
    }
    const target = path.join(dir, 'schema', path.basename(SCHEMA_REL));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    console.log(`schema:export : copie dans ${target} (à commiter dans blender-addons)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2));
