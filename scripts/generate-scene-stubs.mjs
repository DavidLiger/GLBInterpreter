// scripts/generate-scene-stubs.mjs — exécuté après `next build` (D-8.4).
// Pour chaque scène de src/content/book.json, écrit out/s/<scène>/index.html : une redirection vers
// `<racine du dossier>#/s/<scène>`. Les QR imprimés gardent l'adresse `https://<hôte>/s/<scène>` ; la racine est
// calculée depuis location.pathname, donc juste sous `/` comme sous `/<dépôt>/`, avec ou sans `/` final.
// Provisoire : repris par `build-book` en Î6 (avec la liste de fichiers du livre).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
const book = JSON.parse(fs.readFileSync(path.join(root, 'src/content/book.json'), 'utf8'));
const SCENE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

if (!fs.existsSync(path.join(outDir, 'index.html'))) {
  console.error('generate-scene-stubs : out/index.html absent, lancer `next build` avant.');
  process.exit(1);
}

for (const id of book.scenes) {
  if (!SCENE_ID.test(id)) {
    console.error(`generate-scene-stubs : identifiant de scène invalide « ${id} »`);
    process.exit(1);
  }
  const dir = path.join(outDir, 's', id);
  fs.mkdirSync(dir, { recursive: true });
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>…</title>
<script>location.replace(location.pathname.replace(/s\\/[^/]+\\/?(index\\.html)?$/, '') + '#/s/${id}');</script>
<noscript><meta http-equiv="refresh" content="0;url=../../#/s/${id}"></noscript>
</head><body style="background:#000"></body></html>
`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}
console.log(`generate-scene-stubs : ${book.scenes.length} stub(s) dans out/s/`);
