// scripts/copy-decoders.ts — copie le transcodeur Basis de three dans public/decoders/basis/ (Î7, R-33).
// Lancé par `predev` et `prebuild` : les décodeurs suivent la version de three installée, sans copie versionnée.
// Le KTX2Loader les charge en chemin relatif (`decoders/basis/`, src/components/diorama/lib/gltfDecoders.ts).
// MeshoptDecoder n'a pas de fichier à copier : son WebAssembly est embarqué dans le module JS de three.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const threeDir = path.resolve(path.dirname(require.resolve('three', { paths: [ROOT] })), '..'); // build/three.cjs → paquet
const from = path.join(threeDir, 'examples/jsm/libs/basis');
const to = path.join(ROOT, 'public/decoders/basis');

fs.mkdirSync(to, { recursive: true });
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
  const src = path.join(from, f);
  if (!fs.existsSync(src)) {
    console.error(`copy-decoders : ${src} introuvable (three installé ?)`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(to, f));
}
const version = (JSON.parse(fs.readFileSync(path.join(threeDir, 'package.json'), 'utf8')) as { version: string }).version;
console.log(`copy-decoders : transcodeur Basis de three ${version} → public/decoders/basis/`);
