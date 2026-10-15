// scripts/atelier/diagnose.ts — onglet Diagnostic de l'atelier (A2, spec-atelier-glbi.md §10.8, repris de test-glb.html) :
// lecture du GLB source par gltf-transform, avec ou sans GLBI_ROOT. Aucune écriture.
import fs from 'node:fs';
import type { Document } from '@gltf-transform/core';
import { readGlbFile } from '../glb-pipeline';
import { GLBI_ROOT_NAME, type ModelCredit } from '../../src/schema/glbi';
import type { ClipInfo, GlbDiagnostic, SkinInfo } from '../../src/atelier/api';

const SRC_KEYS = { src_name: 'name', src_author: 'author', src_license: 'license', src_url: 'url' } as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Usages déclarés de chaque clip dans une couche 3D brute (lue sans validation : diagnostic d'un GLB même invalide). */
function declaredClips(raw3d: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (clip: unknown, as: string) => {
    if (typeof clip === 'string') out.set(clip, [...(out.get(clip) ?? []), as]);
  };
  const anims = isObj(raw3d) && isObj(raw3d.modules) ? raw3d.modules.animations : undefined;
  if (isObj(anims)) {
    if (isObj(anims.idle)) add(anims.idle.clip, 'idle');
    if (Array.isArray(anims.actions)) for (const a of anims.actions) if (isObj(a)) add(a.clip, typeof a.id === 'string' ? a.id : '?');
  }
  return out;
}

function parseConfig(raw: unknown): unknown {
  if (typeof raw !== 'string') return undefined;
  try {
    const v = JSON.parse(raw);
    return isObj(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export interface DiagnoseResult {
  diagnostic: GlbDiagnostic;
  /** Couche 3D brute (`glbi_config` parsé) si GLBI_ROOT est unique et lisible. */
  raw3d: unknown;
}

export async function diagnoseGlb(file: string): Promise<DiagnoseResult> {
  const bytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
  const empty: GlbDiagnostic = {
    bytes,
    rootNode: null,
    generator: null,
    extensions: [],
    counts: { nodes: 0, meshes: 0, materials: 0, textures: 0, lights: 0 },
    glbiRoots: 0,
    glbiVersion: undefined,
    glbiConfigOk: false,
    clips: [],
    skins: [],
    extras: [],
    srcCredits: [],
    error: null,
  };
  let doc: Document;
  try {
    doc = await readGlbFile(file);
  } catch (e) {
    return { diagnostic: { ...empty, error: (e as Error).message }, raw3d: undefined };
  }
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const glbiRoots = nodes.filter((n) => n.getName() === GLBI_ROOT_NAME);
  const rootExtras = glbiRoots.length === 1 ? glbiRoots[0].getExtras() ?? {} : {};
  const raw3d = glbiRoots.length === 1 ? parseConfig(rootExtras.glbi_config) : undefined;
  const declared = declaredClips(raw3d);

  const clips: ClipInfo[] = root.listAnimations().map((a) => {
    let duration = 0;
    for (const s of a.listSamplers()) {
      const input = s.getInput();
      if (input) duration = Math.max(duration, input.getMax([0])[0] ?? 0);
    }
    const channels = a.listChannels();
    const targets = new Set(channels.map((c) => c.getTargetNode()).filter((n) => n !== null));
    return { name: a.getName(), duration, tracks: channels.length, targets: targets.size, declaredAs: declared.get(a.getName()) ?? [] };
  });

  const skins: SkinInfo[] = root.listSkins().map((s) => ({
    name: s.getName() || '(sans nom)',
    joints: s.listJoints().length,
    meshes: nodes.filter((n) => n.getSkin() === s && n.getMesh()).map((n) => n.getName() || '(sans nom)'),
  }));

  const extras: GlbDiagnostic['extras'] = [];
  for (const sc of root.listScenes()) {
    const keys = Object.keys(sc.getExtras() ?? {});
    if (keys.length) extras.push({ node: `(scène${sc.getName() ? ` ${sc.getName()}` : ''})`, keys });
  }
  const srcCredits: GlbDiagnostic['srcCredits'] = [];
  for (const n of nodes) {
    const ex = n.getExtras() ?? {};
    const keys = Object.keys(ex);
    if (keys.length) extras.push({ node: n.getName() || '(sans nom)', keys });
    const c: ModelCredit = {};
    for (const [k, field] of Object.entries(SRC_KEYS)) {
      const v = ex[k];
      if (typeof v === 'string' && v.trim()) c[field] = v.trim();
    }
    if (Object.keys(c).length) srcCredits.push({ node: n.getName() || '(sans nom)', credit: c });
  }

  return {
    raw3d,
    diagnostic: {
      ...empty,
      rootNode: root.listScenes()[0]?.listChildren()[0]?.getName() || null,
      generator: root.getAsset().generator ?? null,
      extensions: root.listExtensionsUsed().map((e) => e.extensionName),
      counts: {
        nodes: nodes.length,
        meshes: root.listMeshes().length,
        materials: root.listMaterials().length,
        textures: root.listTextures().length,
        lights: nodes.filter((n) => n.getExtension('KHR_lights_punctual')).length,
      },
      glbiRoots: glbiRoots.length,
      glbiVersion: rootExtras.glbi_version,
      glbiConfigOk: raw3d !== undefined,
      clips,
      skins,
      extras,
      srcCredits,
    },
  };
}
