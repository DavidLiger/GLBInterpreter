// scripts/glb-report.ts — mesure de taille et test de survie du pipeline GLB (Î7), sans build.
//
//   npx tsx scripts/glb-report.ts <fichier.glb> [<fichier.glb>…] [--textures auto|ktx2|webp|keep] [--scenes 15]
//                                 [--keep-leaves] [--protect <nom>[,<nom>…]] [--out <dossier>]
//
// Nœuds protégés de `prune` : par défaut ceux que cite la config de GLBI_ROOT (cible caméra, objets animés) ;
// --protect remplace cette liste.
//
// Pour chaque GLB : taille source → taille optimisée, textures, extensions, extras retirés, et contrôle de survie
// (GLBI_ROOT et ses extras glbi_*, noms des clips, propriétés src_*, nœuds protégés). Projection pour un livre de
// N scènes (exigence 1) : N × taille moyenne d'une scène + application (out/ hors scènes et médias, si un build existe).
// Les GLB optimisés sont écrits dans --out (défaut : dossier temporaire supprimé à la fin).
// Code de sortie 1 si un contrôle de survie échoue.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatMiB, optimizeGlbFile, TEXTURE_MODES, type TextureMode } from './glb-pipeline';

interface Args {
  files: string[];
  textures: TextureMode;
  scenes: number;
  keepLeaves: boolean;
  protect: string[];
  out: string | null;
}

function parse(argv: string[]): Args {
  const a: Args = { files: [], textures: 'auto', scenes: 15, keepLeaves: false, protect: [], out: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const next = () => {
      const n = argv[++i];
      if (!n) throw new Error(`option ${v} : valeur manquante`);
      return n;
    };
    if (v === '--textures') {
      const t = next() as TextureMode;
      if (!TEXTURE_MODES.includes(t)) throw new Error(`--textures : ${TEXTURE_MODES.join(', ')}`);
      a.textures = t;
    } else if (v === '--scenes') a.scenes = Math.max(1, Number.parseInt(next(), 10) || 15);
    else if (v === '--keep-leaves') a.keepLeaves = true;
    else if (v === '--protect') a.protect.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
    else if (v === '--out') a.out = next();
    else if (v.startsWith('--')) throw new Error(`option inconnue « ${v} »`);
    else a.files.push(v);
  }
  if (!a.files.length) throw new Error('aucun fichier GLB');
  return a;
}

/** Taille de l'application dans out/ : tout sauf les scènes, book.json et les médias de la cartouche de test. */
function appBytes(outDir: string): number | null {
  if (!fs.existsSync(path.join(outDir, 'index.html'))) return null;
  const skip = /^(scenes|models|videos|sounds|spritesheets|jsons|images?\/dioramas)\/|^book\.json$|^icons\/dioramas\/(?!UI\/)/;
  let total = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const rel = path.relative(outDir, full).split(path.sep).join('/');
      if (e.isDirectory()) walk(full);
      else if (!skip.test(rel)) total += fs.statSync(full).size;
    }
  };
  walk(outDir);
  return total;
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  const tmp = args.out ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'glbi-report-'));
  const outDir = args.out ?? tmp!;
  let failed = false;
  const sizes: number[] = [];
  try {
    for (const file of args.files) {
      const dst = path.join(outDir, path.basename(file).replace(/\.glb$/i, '') + '.opt.glb');
      const t0 = Date.now();
      const r = await optimizeGlbFile(file, dst, {
        textures: args.textures,
        keepLeaves: args.keepLeaves,
        protect: args.protect.length ? args.protect : undefined,
      });
      sizes.push(r.outBytes);
      const delta = ((r.outBytes / r.inBytes - 1) * 100).toFixed(0);
      console.log(`\n${file}`);
      console.log(`  taille       : ${formatMiB(r.inBytes)} → ${formatMiB(r.outBytes)} (${Number(delta) > 0 ? '+' : ''}${delta} %), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      console.log(`  textures     : ${r.textures}${r.notes.length ? ` (${r.notes.join(' ; ')})` : ''} ; ${r.before.textures.map((t) => `${t.mime} ${formatMiB(t.bytes)}`).join(', ') || 'aucune'} → ${r.after.textures.map((t) => `${t.mime} ${formatMiB(t.bytes)}`).join(', ') || 'aucune'}`);
      console.log(`  extensions   : ${r.after.extensions.join(', ') || 'aucune'}`);
      console.log(`  clips        : ${r.after.clips.length} (${r.after.clips.join(', ')})`);
      const cut = (t: string) => (t.length > 110 ? `${t.slice(0, 110)}…` : t);
      console.log(`  GLBI_ROOT    : ${r.after.glbiRoot.length ? r.after.glbiRoot.map(cut).join(' | ') : 'absent'}`);
      console.log(`  protégés     : ${r.protect.join(', ') || '—'}`);
      console.log(`  crédits src_ : ${r.after.srcCredits.length} nœud(s)`);
      console.log(`  extras retirés : scène [${r.stripped.scene.join(', ') || '—'}] ; nœuds [${r.stripped.node.join(', ') || '—'}]`);
      if (r.survival.length) {
        failed = true;
        for (const s of r.survival) console.error(`  ÉCHEC survie : ${s}`);
      } else console.log('  survie       : OK (GLBI_ROOT, clips, src_*, nœuds protégés ; aucun extra étranger)');
      if (args.out) console.log(`  écrit        : ${dst}`);
    }
    const mean = sizes.reduce((s, v) => s + v, 0) / sizes.length;
    const app = appBytes(path.resolve('out'));
    console.log(`\nProjection, livre de ${args.scenes} scènes (GLB seuls, moyenne ${formatMiB(mean)}) : ${formatMiB(mean * args.scenes)}`);
    if (app !== null) {
      console.log(`  + application (out/ hors scènes et médias) : ${formatMiB(app)} → ${formatMiB(mean * args.scenes + app)}`);
    } else console.log('  application non comptée (pas de out/index.html : lancer un build)');
    console.log('  sons, icônes et images des scènes non comptés (dépendent du contenu du livre)');
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(`glb-report : ${(e as Error).message}`);
  process.exit(1);
});
