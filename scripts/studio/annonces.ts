// scripts/studio/annonces.ts — section « Annonces » du studio (AN2, spec-annonces.md §3, §6, §13) : clés de signature,
// brouillon des annonces, contrôle, signature et sortie à publier, relecture du flux publié.
//
// - Clés (décisions de David du 30/10, questions 1 et 2 d'AN2) : ECDSA P-256 générées par WebCrypto de Node ; privées en
//   PKCS#8 (PEM, sans mot de passe) dans le dossier du profil Windows (`%USERPROFILE%\.editions-liger\annonces-cles\`),
//   jamais dans le repo ni dans .studio/ ; publiques en SPKI base64 `{ keyId, spki }` (`cles-publiques.json` du même dossier),
//   écrites dans `src/annonces/keys.ts` par le studio (seul fichier source qu'il écrit). Essais : dossier de clés et keys.ts
//   d'essai donnés par les variables GLBI_ANNONCES_CLES et GLBI_ANNONCES_KEYS_TS ; sans la seconde, keys.ts n'est pas écrit.
// - Brouillon et sortie (question 3) : `.studio/annonces/brouillon.json`, images dans `.studio/annonces/images/`, sortie
//   signée dans `.studio/annonces/sortie/` (`_headers`, `v1/annonces.json`, `v1/images/…`), déployée telle quelle.
// - Contrôle : les règles de l'app (src/annonces/feed.ts : dates civiles, motif des identifiants, longueurs, liens, chemins et
//   formats d'image) sont importées, jamais recopiées ; le studio est plus strict que l'app (point 5 du 30/10) : il refuse de
//   signer tout le flux dès qu'une annonce sort des règles (l'app l'ignorerait), et refuse aussi un `issued` futur (§13).
// - Signature au contrat du §13 : enveloppe `{ payload, signature, keyId }`, base64 standard, ECDSA P-256 / SHA-256 de
//   WebCrypto (r ‖ s, 64 octets) sur les octets UTF-8 exacts du payload, flux ≤ 32 768 octets ; puis vérifiée par feed.ts
//   avec la clé publique du dossier de clés avant d'être écrite.
// La clé privée n'est jamais renvoyée, affichée, journalisée ni copiée : elle n'est lue que pour signer.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AnnonceKey } from '../../src/annonces/keys';
import { ANNONCES_LIMITS, FEED_URL } from '../../src/annonces/config';
import {
  allowedLink,
  dayNumber,
  parsePayload,
  sniffImage,
  todayOf,
  validImagePath,
  verifyEnvelope,
  type SubtleLike,
} from '../../src/annonces/feed';
import { realCase } from './book';

export const subtle = crypto.webcrypto.subtle as unknown as SubtleCrypto & SubtleLike;

export const LANGS = ['fr', 'en', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export const KEY_IDS = ['k1', 'k2'] as const;
export type KeyId = (typeof KEY_IDS)[number];
export const KEY_ROLES: Record<KeyId, string> = { k1: 'courante', k2: 'secours' };
export const PRIVATE_FILES: Record<KeyId, string> = { k1: 'k1-courante.pkcs8.pem', k2: 'k2-secours.pkcs8.pem' };
export const PUBLIC_FILE = 'cles-publiques.json';
export const ENV_KEYS_DIR = 'GLBI_ANNONCES_CLES';
export const ENV_KEYS_TS = 'GLBI_ANNONCES_KEYS_TS';
/** keys.ts du repo, relatif à sa racine. */
export const KEYS_TS_REL = path.join('src', 'annonces', 'keys.ts');
/** Fichiers du studio pour les annonces, relatifs à .studio/. */
export const ANNONCES_DIR = 'annonces';
export const IMAGES_DIR = 'images';
export const OUT_DIR = 'sortie';
export const FEED_REL = 'v1/annonces.json';
/** Image importée : au-delà, refusée à l'import (garde-fou ; la règle de 200 Ko est celle du contrôle, avec son message). */
export const IMPORT_MAX = 5 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const IMAGE_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.(webp|png|jpe?g)$/i;
const DAY_MS = 86_400_000;
/** Environnement lu (process.env par défaut ; un objet simple dans les tests). */
type Env = Record<string, string | undefined>;

// ---------------------------------------------------------------------------------------------------------
// Dates (jours civils locaux, comme l'app)
// ---------------------------------------------------------------------------------------------------------

const p2 = (n: number) => String(n).padStart(2, '0');
/** Jour civil d'un numéro de jour (`dayNumber`), « AAAA-MM-JJ ». */
export function dayText(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
export const todayText = (now = new Date()) => dayText(todayOf(now));

// ---------------------------------------------------------------------------------------------------------
// Dossier des clés, keys.ts
// ---------------------------------------------------------------------------------------------------------

/** Chemin à sa casse réelle, en remontant jusqu'au premier dossier existant (le reste ajouté tel quel). */
function realOrResolved(p: string): string {
  let cur = path.resolve(p);
  const rest: string[] = [];
  for (;;) {
    const r = realCase(cur);
    if (r) return path.join(r, ...rest);
    const up = path.dirname(cur);
    if (up === cur) return path.resolve(p);
    rest.unshift(path.basename(cur));
    cur = up;
  }
}

/** `child` est `parent` ou un de ses sous-dossiers (casse réelle ; casse ignorée sous Windows). */
export function isInside(child: string, parent: string, win = process.platform === 'win32'): boolean {
  const n = (p: string) => {
    const s = realOrResolved(p).replace(/\\/g, '/').replace(/\/+$/, '');
    return win ? s.toLowerCase() : s;
  };
  const c = n(child);
  const pr = n(parent);
  return c === pr || c.startsWith(`${pr}/`);
}

/** Dossier réel des clés : dossier du profil (Windows : %USERPROFILE%), `.editions-liger/annonces-cles`. */
export function defaultKeysDir(env: Env = process.env): string {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  return path.join(home, '.editions-liger', 'annonces-cles');
}

export interface KeysConfig {
  /** Dossier des clés (réel, ou d'essai par GLBI_ANNONCES_CLES). */
  dir: string;
  /** Dossier d'essai (variable posée). */
  essai: boolean;
  /** Refus du dossier (dans le repo) ; `null` : accepté. */
  dirError: string | null;
  /** keys.ts que le studio écrit : celui du repo, ou celui d'essai (GLBI_ANNONCES_KEYS_TS) ; `null` : jamais écrit. */
  keysTs: string | null;
  /** Raison pour laquelle keys.ts n'est pas écrit. */
  keysTsError: string | null;
}

/**
 * Dossier des clés et keys.ts : réels par défaut ; d'essai seulement par variable d'environnement (posée par les tests et la
 * batterie, jamais par le studio). Dossier de clés d'essai sans keys.ts d'essai : keys.ts n'est pas écrit (le vrai keys.ts
 * n'est jamais touché pendant un essai). Tout dossier de clés situé dans le repo est refusé.
 */
export function keysConfig(root: string, env: Env = process.env): KeysConfig {
  const essai = !!env[ENV_KEYS_DIR]?.trim();
  const dir = essai ? path.resolve(env[ENV_KEYS_DIR]!.trim()) : defaultKeysDir(env);
  const dirError = isInside(dir, root)
    ? `dossier des clés refusé : ${dir} est dans le repo (une clé privée ne doit jamais pouvoir être commitée) ; choisir un dossier hors du repo`
    : null;
  const real = path.join(root, KEYS_TS_REL);
  const asked = env[ENV_KEYS_TS]?.trim();
  let keysTs: string | null = real;
  let keysTsError: string | null = null;
  if (asked) {
    keysTs = path.resolve(asked);
    if (isInside(keysTs, real)) {
      keysTs = null;
      keysTsError = `${ENV_KEYS_TS} désigne le vrai keys.ts du repo : refusé (un keys.ts d'essai est attendu)`;
    }
  } else if (essai) {
    keysTs = null;
    keysTsError = `dossier de clés d'essai sans keys.ts d'essai (${ENV_KEYS_TS}) : keys.ts n'est pas écrit`;
  }
  return { dir, essai, dirError, keysTs, keysTsError };
}

/** Clés publiques du dossier des clés (`cles-publiques.json`) ; `[]` absent ; `null` illisible. */
export function readPublics(dir: string): AnnonceKey[] | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, PUBLIC_FILE), 'utf8'));
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? [] : null;
  }
  if (!Array.isArray(raw)) return null;
  const out: AnnonceKey[] = [];
  for (const k of raw) {
    if (!k || typeof k.keyId !== 'string' || typeof k.spki !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(k.spki)) return null;
    out.push({ keyId: k.keyId, spki: k.spki });
  }
  return out;
}

const toPem = (der: ArrayBuffer) =>
  `-----BEGIN PRIVATE KEY-----\n${(Buffer.from(der).toString('base64').match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;

/**
 * Génération des clés courante (k1) et de secours (k2) : refusée si le dossier est dans le repo ou si un des fichiers existe
 * déjà (jamais d'écrasement : une clé remplacée rendrait muettes les apps publiées). Fichiers privés écrits en exclusif, mode
 * 600 ; `cles-publiques.json` en dernier. Rend les clés publiques seulement.
 */
export async function generateKeys(cfg: KeysConfig): Promise<{ ok: true; publics: AnnonceKey[] } | { error: string }> {
  if (cfg.dirError) return { error: cfg.dirError };
  const files = [...KEY_IDS.map((k) => PRIVATE_FILES[k]), PUBLIC_FILE];
  const there = files.filter((f) => fs.existsSync(path.join(cfg.dir, f)));
  if (there.length) return { error: `clés déjà présentes dans ${cfg.dir} (${there.join(', ')}) : génération refusée, rien n'est remplacé` };
  fs.mkdirSync(cfg.dir, { recursive: true });
  const publics: AnnonceKey[] = [];
  for (const keyId of KEY_IDS) {
    const pair = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pkcs8 = await subtle.exportKey('pkcs8', pair.privateKey);
    const spki = await subtle.exportKey('spki', pair.publicKey);
    fs.writeFileSync(path.join(cfg.dir, PRIVATE_FILES[keyId]), toPem(pkcs8), { flag: 'wx', mode: 0o600 });
    publics.push({ keyId, spki: Buffer.from(spki).toString('base64') });
  }
  fs.writeFileSync(path.join(cfg.dir, PUBLIC_FILE), `${JSON.stringify(publics, null, 2)}\n`, { flag: 'wx' });
  return { ok: true, publics };
}

/** Clé privée d'un `keyId`, importée pour signer seulement (non extractible). Message d'échec sans rien du contenu. */
async function privateKey(dir: string, keyId: KeyId): Promise<CryptoKey | { error: string }> {
  const file = path.join(dir, PRIVATE_FILES[keyId]);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { error: `clé privée ${keyId} (${KEY_ROLES[keyId]}) absente : ${file}` };
  }
  const m = /-----BEGIN PRIVATE KEY-----([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----/.exec(text);
  try {
    if (!m) throw new Error('pem');
    return await subtle.importKey('pkcs8', Buffer.from(m[1].replace(/\s+/g, ''), 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch {
    return { error: `clé privée ${keyId} (${KEY_ROLES[keyId]}) illisible : ${file} (PKCS#8 PEM ECDSA P-256 attendu)` };
  }
}

/** Texte de keys.ts écrit par le studio (même interface et même nom d'export que le fichier d'AN1). */
export function keysTsText(publics: readonly AnnonceKey[], date: string): string {
  return `// Clés publiques du flux d'annonces (AN1, spec-annonces.md §3, §6, DP-17). ECDSA P-256, clé au format SPKI en base64
// (\`crypto.subtle.exportKey("spki", …)\`). Deux clés : la courante, puis la clé de secours ; le flux désigne la sienne par
// \`keyId\`. Fichier écrit par le studio (section Annonces, AN2) le ${date} : les clés privées sont hors du repo, dans le
// dossier du profil de l'éditeur. Après une écriture : commiter ce fichier, puis reconstruire et republier les livres.
// Les clés de test ne sont jamais ici : elles ne sont compilées que dans le build du livre de test (GLBI_ANNONCES_TEST=1).

export interface AnnonceKey {
  keyId: string;
  /** Clé publique ECDSA P-256, SPKI en base64. */
  spki: string;
}

export const ANNONCES_KEYS: readonly AnnonceKey[] = [
${publics.map((k) => `  { keyId: ${JSON.stringify(k.keyId)}, spki: ${JSON.stringify(k.spki)} },`).join('\n')}
];
`;
}

/** Clés déclarées dans un keys.ts (`[]` : liste vide) ; `null` : forme non reconnue. */
export function parseKeysTs(text: string): AnnonceKey[] | null {
  const m = /export const ANNONCES_KEYS: readonly AnnonceKey\[\] = \[([\s\S]*?)\];/.exec(text);
  if (!m) return null;
  const body = m[1].trim();
  const out: AnnonceKey[] = [];
  const re = /\{\s*keyId:\s*"([^"\\]*)",\s*spki:\s*"([A-Za-z0-9+/=]*)",?\s*\},?/g;
  let rest = body;
  for (let e = re.exec(body); e; e = re.exec(body)) {
    out.push({ keyId: e[1], spki: e[2] });
    rest = rest.replace(e[0], '');
  }
  return rest.trim() ? null : out;
}

export type KeysTsState = 'vide' | 'à jour' | 'différent' | 'illisible' | 'absent';

/** keys.ts comparé aux clés publiques du dossier (même ordre : courante, puis secours). */
export function keysTsState(file: string | null, publics: readonly AnnonceKey[] | null): KeysTsState {
  if (!file) return 'absent';
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return 'absent';
  }
  const keys = parseKeysTs(text);
  if (!keys) return 'illisible';
  if (!keys.length) return 'vide';
  return publics && JSON.stringify(keys) === JSON.stringify(publics) ? 'à jour' : 'différent';
}

export interface KeysView {
  dir: string;
  essai: boolean;
  dirError: string | null;
  presentes: Record<KeyId, boolean>;
  /** Clés publiques lisibles (`null` : `cles-publiques.json` illisible). */
  publiques: AnnonceKey[] | null;
  keysTs: { chemin: string | null; etat: KeysTsState; erreur: string | null };
}

export function keysView(cfg: KeysConfig): KeysView {
  const publiques = cfg.dirError ? [] : readPublics(cfg.dir);
  const presentes = Object.fromEntries(KEY_IDS.map((k) => [k, !cfg.dirError && fs.existsSync(path.join(cfg.dir, PRIVATE_FILES[k]))])) as Record<KeyId, boolean>;
  return {
    dir: cfg.dir,
    essai: cfg.essai,
    dirError: cfg.dirError,
    presentes,
    publiques,
    keysTs: { chemin: cfg.keysTs, etat: keysTsState(cfg.keysTs, publiques), erreur: cfg.keysTsError },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Brouillon
// ---------------------------------------------------------------------------------------------------------

export type Texts = Record<Lang, string>;
export interface DraftItem {
  id: string;
  bookId: string;
  start: string;
  end: string;
  title: Texts;
  text: Texts;
  /** Vide : sans lien. */
  url: string;
  /** Nom du fichier dans .studio/annonces/images/ ; `null` : sans image. */
  image: string | null;
}
export interface Draft {
  issued: string;
  expires: string;
  keyId: KeyId;
  items: DraftItem[];
}

export function emptyDraft(now = new Date()): Draft {
  const t = todayOf(now);
  return { issued: dayText(t), expires: dayText(t + ANNONCES_LIMITS.feedDays), keyId: 'k1', items: [] };
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const texts = (v: unknown): Texts => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return { fr: str(o.fr), en: str(o.en), es: str(o.es) };
};

/** Brouillon reçu de la page ou lu sur le disque, lecture tolérante (valeurs gardées telles quelles, contrôlées ensuite). */
export function draftFrom(v: unknown, now = new Date()): Draft {
  const d = emptyDraft(now);
  if (!v || typeof v !== 'object') return d;
  const o = v as Record<string, unknown>;
  if (typeof o.issued === 'string') d.issued = o.issued;
  if (typeof o.expires === 'string') d.expires = o.expires;
  if (o.keyId === 'k2') d.keyId = 'k2';
  if (Array.isArray(o.items)) {
    d.items = o.items.slice(0, 50).map((it) => {
      const i = it && typeof it === 'object' ? (it as Record<string, unknown>) : {};
      return {
        id: str(i.id), bookId: str(i.bookId), start: str(i.start), end: str(i.end), title: texts(i.title), text: texts(i.text),
        url: str(i.url), image: typeof i.image === 'string' && i.image ? i.image : null,
      };
    });
  }
  return d;
}

export function readDraft(file: string, now = new Date()): Draft {
  try {
    return draftFrom(JSON.parse(fs.readFileSync(file, 'utf8')), now);
  } catch {
    return emptyDraft(now);
  }
}

export const draftText = (d: Draft) => `${JSON.stringify(d, null, 2)}\n`;
export const sha256Hex = (b: Uint8Array | string) => crypto.createHash('sha256').update(b).digest('hex');

// ---------------------------------------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------------------------------------

const EXT_TYPE: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
const TYPE_NAME: Record<string, string> = { 'image/webp': 'WebP', 'image/png': 'PNG', 'image/jpeg': 'JPEG' };

/** Nom d'image sûr (segment du chemin du flux) tiré du nom du fichier choisi. */
export function imageNameOf(file: string): string | null {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!EXT_TYPE[ext]) return null;
  let stem = path.basename(file, path.extname(file)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[.]+/, '');
  stem = stem.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'image';
  const name = `${stem}.${ext}`;
  return IMAGE_NAME.test(name) ? name : `img-${name}`;
}

/**
 * Image choisie par David copiée dans .studio/annonces/images/ (nom sûr ; même nom et autre contenu : suffixe -2, -3…).
 * Seuls l'extension et un garde-fou de taille sont contrôlés ici ; poids (200 Ko) et format réel le sont avant la signature.
 */
export function importImage(src: string, imagesDir: string): { ok: true; nom: string } | { error: string } {
  let st: fs.Stats;
  try {
    st = fs.statSync(src);
  } catch {
    return { error: `image introuvable : ${src}` };
  }
  if (!st.isFile()) return { error: `pas un fichier : ${src}` };
  const name = imageNameOf(src);
  if (!name) return { error: `image refusée : ${path.basename(src)} (extension webp, png, jpg ou jpeg attendue)` };
  if (st.size > IMPORT_MAX) return { error: `image refusée : ${path.basename(src)} fait ${st.size} octets (200 Ko au plus pour une annonce)` };
  const data = fs.readFileSync(src);
  fs.mkdirSync(imagesDir, { recursive: true });
  const ext = path.extname(name);
  const stem = name.slice(0, -ext.length);
  for (let i = 1; i < 100; i++) {
    const nom = i === 1 ? name : `${stem}-${i}${ext}`;
    const target = path.join(imagesDir, nom);
    if (fs.existsSync(target)) {
      if (fs.readFileSync(target).equals(data)) return { ok: true, nom };
      continue;
    }
    fs.writeFileSync(target, data);
    return { ok: true, nom };
  }
  return { error: 'trop d’images de même nom' };
}

export interface ImageInfo {
  taille: number;
  /** Format reconnu aux premiers octets ; `null` : ni WebP, ni PNG, ni JPEG. */
  format: string | null;
  sha256: string;
}

export function imageInfo(imagesDir: string, nom: string): ImageInfo | null {
  if (!IMAGE_NAME.test(nom) || nom.includes('/') || nom.includes('\\')) return null;
  try {
    const b = fs.readFileSync(path.join(imagesDir, nom));
    const t = sniffImage(b);
    return { taille: b.length, format: t ? TYPE_NAME[t] : null, sha256: sha256Hex(b) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Contrôle du brouillon (refus de signer) et construction du payload
// ---------------------------------------------------------------------------------------------------------

export interface Issue {
  /** « flux », ou « annonce n (id) ». */
  ou: string;
  message: string;
}
export interface DraftCheck {
  refus: Issue[];
  avertissements: Issue[];
  /** Taille du flux signé (octets), si le payload a pu être construit. */
  taille: number | null;
  images: Record<string, ImageInfo | null>;
}

interface Built {
  payload: Record<string, unknown>;
  bytes: Uint8Array;
  images: { nom: string; data: Buffer }[];
}

const LANG_NAMES: Record<Lang, string> = { fr: 'français', en: 'anglais', es: 'espagnol' };
const chars = (s: string) => [...s].length;
/** Taille du flux signé : la signature r ‖ s fait toujours 64 octets, soit 88 caractères en base64. */
export const envelopeSize = (payloadB64: string, keyId: string) =>
  Buffer.byteLength(JSON.stringify({ payload: payloadB64, signature: 'A'.repeat(88), keyId }), 'utf8');

/**
 * Contrôle du brouillon (§3, §13) : tout refus empêche la signature, chacun dit pourquoi. `today` : jour civil local (comme
 * l'app). Avertissements : annonce jamais montrée par ce flux, annonce sans lien, flux sans annonce.
 */
export function checkDraft(d: Draft, imagesDir: string, today: number): DraftCheck & { built: Built | null } {
  const refus: Issue[] = [];
  const avertissements: Issue[] = [];
  const images: Record<string, ImageInfo | null> = {};
  const L = ANNONCES_LIMITS;
  const no = (message: string) => refus.push({ ou: 'flux', message });

  const issued = dayNumber(d.issued.trim());
  const expires = dayNumber(d.expires.trim());
  if (issued === null) no(`date d’émission (issued) « ${d.issued} » : jour civil inexistant ou mal écrit (AAAA-MM-JJ attendu)`);
  else if (issued > today) no(`date d’émission (issued) ${d.issued} dans le futur (aujourd’hui : ${dayText(today)}) : un flux signé à l’avance servirait avant sa date`);
  if (expires === null) no(`date d’expiration (expires) « ${d.expires} » : jour civil inexistant ou mal écrit (AAAA-MM-JJ attendu)`);
  if (issued !== null && expires !== null) {
    if (expires < issued) no(`expiration (${d.expires}) avant l’émission (${d.issued})`);
    else if (expires - issued > L.feedDays) no(`expiration (${d.expires}) au-delà de l’émission + ${L.feedDays} jours (${dayText(issued + L.feedDays)} au plus)`);
    else if (expires < today) no(`flux déjà expiré (expires ${d.expires}, aujourd’hui ${dayText(today)}) : les apps l’ignoreraient`);
  }
  if (!KEY_IDS.includes(d.keyId)) no(`clé de signature « ${d.keyId} » inconnue (k1 ou k2)`);
  if (d.items.length > L.items) no(`${d.items.length} annonces (${L.items} au plus)`);
  if (!d.items.length) avertissements.push({ ou: 'flux', message: 'flux sans annonce : publié, il retire les annonces en cours' });

  const items: Record<string, unknown>[] = [];
  const used: { nom: string; data: Buffer }[] = [];
  const ids = new Set<string>();
  d.items.forEach((it, i) => {
    const id = it.id.trim();
    const ou = `annonce ${i + 1}${id ? ` (${id})` : ''}`;
    const before = refus.length;
    const bad = (message: string) => refus.push({ ou, message });
    if (!ID.test(id)) bad(`identifiant « ${it.id} » refusé (1 à 64 caractères : lettres sans accent, chiffres, - et _)`);
    else if (ids.has(id)) bad(`identifiant « ${id} » en double`);
    ids.add(id);
    const bookId = it.bookId.trim();
    if (!ID.test(bookId)) bad(`livre concerné (bookId) « ${it.bookId} » refusé (1 à 64 caractères : lettres sans accent, chiffres, - et _)`);
    const start = dayNumber(it.start.trim());
    const end = dayNumber(it.end.trim());
    if (start === null) bad(`début (start) « ${it.start} » : jour civil inexistant ou mal écrit (AAAA-MM-JJ attendu)`);
    if (end === null) bad(`fin (end) « ${it.end} » : jour civil inexistant ou mal écrit (AAAA-MM-JJ attendu)`);
    if (start !== null && end !== null) {
      if (end < start) bad(`fin (${it.end}) avant le début (${it.start})`);
      else if (end - start > L.itemDays) bad(`fin (${it.end}) au-delà du début + ${L.itemDays} jours (${dayText(start + L.itemDays)} au plus)`);
      else {
        if (end < today) avertissements.push({ ou, message: `annonce terminée (fin ${it.end}) : jamais montrée` });
        if (expires !== null && start > expires) avertissements.push({ ou, message: `commence (${it.start}) après l’expiration du flux (${d.expires}) : jamais montrée par ce flux` });
      }
    }
    const title = {} as Texts;
    const text = {} as Texts;
    for (const l of LANGS) {
      const t = it.title[l].trim();
      const x = it.text[l].trim();
      if (!t) bad(`titre en ${LANG_NAMES[l]} absent`);
      else if (chars(t) > L.title) bad(`titre en ${LANG_NAMES[l]} trop long : ${chars(t)} caractères (${L.title} au plus)`);
      if (!x) bad(`texte en ${LANG_NAMES[l]} absent`);
      else if (chars(x) > L.text) bad(`texte en ${LANG_NAMES[l]} trop long : ${chars(x)} caractères (${L.text} au plus)`);
      title[l] = t;
      text[l] = x;
    }
    const rawUrl = it.url.trim();
    const url = rawUrl ? allowedLink(rawUrl) : null;
    if (rawUrl && !url) {
      bad(`lien « ${rawUrl} » hors de la liste : https seulement, sans port ni identifiants, vers editions-liger.com (et ses sous-domaines) ou amazon.fr, amazon.com, amazon.es, amazon.co.uk (avec ou sans www.)`);
    }
    if (!rawUrl) avertissements.push({ ou, message: 'sans lien : montrée sans « Voir le livre »' });
    let image: { path: string; sha256: string } | undefined;
    if (it.image) {
      const nom = it.image;
      const info = imageInfo(imagesDir, nom);
      images[nom] = info;
      const rel = `images/${nom}`;
      if (!validImagePath(rel)) bad(`image « ${nom} » : nom refusé`);
      else if (!info) bad(`image « ${nom} » introuvable dans .studio/annonces/images/ : la choisir à nouveau`);
      else {
        const ext = path.extname(nom).slice(1).toLowerCase();
        if (info.taille > L.imageBytes) bad(`image « ${nom} » trop lourde : ${info.taille} octets (${L.imageBytes} au plus, soit 200 Ko)`);
        if (!info.format) bad(`image « ${nom} » : format non reconnu à ses premiers octets (WebP, PNG ou JPEG attendu)`);
        else if (TYPE_NAME[EXT_TYPE[ext]] !== info.format) bad(`image « ${nom} » : contenu ${info.format}, extension .${ext} (renommer le fichier ou le convertir)`);
        image = { path: rel, sha256: info.sha256 };
        used.push({ nom, data: fs.readFileSync(path.join(imagesDir, nom)) });
      }
    }
    if (refus.length === before) {
      items.push({ id, bookId, start: it.start.trim(), end: it.end.trim(), title, text, ...(url ? { url } : {}), ...(image ? { image } : {}) });
    }
  });

  if (refus.length) return { refus, avertissements, taille: null, images, built: null };
  const payload = { version: 1, issued: d.issued.trim(), expires: d.expires.trim(), items };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const taille = envelopeSize(Buffer.from(bytes).toString('base64'), d.keyId);
  if (taille > L.feedBytes) {
    no(`flux trop gros : ${taille} octets une fois signé (${L.feedBytes} au plus) : raccourcir les textes ou les liens, ou retirer une annonce`);
    return { refus, avertissements, taille, images, built: null };
  }
  return { refus, avertissements, taille, images, built: { payload, bytes, images: used } };
}

// ---------------------------------------------------------------------------------------------------------
// Signature et sortie
// ---------------------------------------------------------------------------------------------------------

export const HEADERS_TEXT = `# Flux d'annonces des Éditions Liger (écrit par le studio, AN2) : lu par toutes les apps de livres (CORS).
/v1/*
  Access-Control-Allow-Origin: *
  X-Content-Type-Options: nosniff
/v1/annonces.json
  Cache-Control: no-cache
`;

/** Enveloppe au contrat du §13 : exactement trois clés, base64 standard. */
export const envelopeText = (payload: Uint8Array, signature: Uint8Array, keyId: string) =>
  JSON.stringify({ payload: Buffer.from(payload).toString('base64'), signature: Buffer.from(signature).toString('base64'), keyId });

export interface Signed {
  ok: true;
  keyId: KeyId;
  /** Octets du flux signé (`v1/annonces.json`). */
  envelope: Buffer;
  sha256: string;
  taille: number;
  annonces: number;
  images: string[];
  avertissements: Issue[];
}

/**
 * Signature : contrôle (refus), clé privée du `keyId` choisi, signature WebCrypto (r ‖ s, 64 octets), puis vérification de
 * l'enveloppe par feed.ts avec la clé publique du dossier des clés (une clé privée qui ne correspond pas à sa clé publique
 * est refusée ici) ; enfin sortie réécrite (`_headers`, `v1/annonces.json`, `v1/images/`). Rien n'est écrit sur un refus.
 */
export async function signDraft(
  d: Draft,
  opts: { cfg: KeysConfig; imagesDir: string; outDir: string; now?: Date },
): Promise<Signed | { ok: false; refus: Issue[]; avertissements: Issue[] }> {
  const now = opts.now ?? new Date();
  const today = todayOf(now);
  const c = checkDraft(d, opts.imagesDir, today);
  const refuse = (message: string) => ({ ok: false as const, refus: [{ ou: 'signature', message }], avertissements: c.avertissements });
  if (!c.built) return { ok: false, refus: c.refus, avertissements: c.avertissements };
  if (opts.cfg.dirError) return refuse(opts.cfg.dirError);
  const publics = readPublics(opts.cfg.dir);
  if (!publics) return refuse(`${PUBLIC_FILE} illisible dans ${opts.cfg.dir}`);
  if (!publics.some((k) => k.keyId === d.keyId)) return refuse(`clé publique ${d.keyId} absente de ${path.join(opts.cfg.dir, PUBLIC_FILE)} : générer les clés d’abord`);
  const key = await privateKey(opts.cfg.dir, d.keyId);
  if ('error' in key) return refuse(key.error);
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, c.built.bytes as BufferSource));
  if (sig.length !== 64) return refuse(`signature de ${sig.length} octets (64 attendus, format r ‖ s de WebCrypto) : refusée`);
  const envelope = Buffer.from(envelopeText(c.built.bytes, sig, d.keyId), 'utf8');
  if (envelope.length > ANNONCES_LIMITS.feedBytes) return refuse(`flux trop gros : ${envelope.length} octets (${ANNONCES_LIMITS.feedBytes} au plus)`);
  // Vérification par le vérificateur de l'app, avec la clé publique du dossier.
  const v = await verifyEnvelope(new Uint8Array(envelope), publics, subtle);
  if (!v.ok) return refuse(`flux signé refusé par le vérificateur de l’app : ${v.reason} (clé privée et clé publique ${d.keyId} ne correspondent pas ?)`);
  const p = parsePayload(v.value, today);
  if (!p.ok) return refuse(`flux signé refusé par le vérificateur de l’app : ${p.reason}`);
  if (p.value.items.length !== d.items.length || p.value.notes.length) {
    return refuse(`le vérificateur de l’app garde ${p.value.items.length} annonce(s) sur ${d.items.length}${p.value.notes.length ? ` (${p.value.notes.join(' ; ')})` : ''}`);
  }
  // Sortie : refaite entière (une image retirée du brouillon n'est plus publiée).
  fs.rmSync(opts.outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(opts.outDir, 'v1', 'images'), { recursive: true });
  fs.writeFileSync(path.join(opts.outDir, '_headers'), HEADERS_TEXT);
  for (const im of c.built.images) fs.writeFileSync(path.join(opts.outDir, 'v1', 'images', im.nom), im.data);
  fs.writeFileSync(path.join(opts.outDir, ...FEED_REL.split('/')), envelope);
  return {
    ok: true, keyId: d.keyId, envelope, sha256: sha256Hex(envelope), taille: envelope.length, annonces: d.items.length,
    images: [...new Set(c.built.images.map((i) => i.nom))], avertissements: c.avertissements,
  };
}

/** Flux signé présent dans la sortie (octets), `null` sinon. */
export function readSignedFeed(outDir: string): Buffer | null {
  try {
    return fs.readFileSync(path.join(outDir, ...FEED_REL.split('/')));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Relecture du flux publié
// ---------------------------------------------------------------------------------------------------------

/** Adresse du flux publié sur un projet Pages (`https://<projet>.pages.dev/v1/annonces.json`). */
export const publishedFeedUrl = (projet: string) => `https://${projet}.pages.dev/${FEED_REL}`;
/** Adresse de production compilée dans l'app (le domaine pointe sur le projet de production). */
export const PRODUCTION_FEED_URL = FEED_URL;

export type Fetcher = (url: string) => Promise<{ status: number; headers: { get(name: string): string | null }; bytes: Uint8Array }>;

export const nodeFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'cache-control': 'no-cache' } });
  return { status: res.status, headers: res.headers, bytes: new Uint8Array(await res.arrayBuffer()) };
};

export interface ReadBack {
  /** Flux publié identique, octet pour octet, à celui signé par le studio. */
  identique: boolean;
  /** Flux publié vérifié par feed.ts (signature, payload, images) et identique. */
  verifie: boolean;
  ecarts: string[];
}

/**
 * Relecture du flux publié à son adresse : octets comparés au flux signé, en-tête CORS, vérification par le vérificateur de
 * l'app (signature avec les clés publiques du dossier, payload, aucune annonce ignorée), puis chaque image (poids, format reconnu
 * aux premiers octets, empreinte signée).
 */
export async function readBack(feedUrl: string, expected: Uint8Array, publics: readonly AnnonceKey[], fetcher: Fetcher, now = new Date()): Promise<ReadBack> {
  const ecarts: string[] = [];
  let r: Awaited<ReturnType<Fetcher>>;
  try {
    r = await fetcher(feedUrl);
  } catch (e) {
    return { identique: false, verifie: false, ecarts: [`flux injoignable : ${(e as Error).message}`] };
  }
  if (r.status !== 200) return { identique: false, verifie: false, ecarts: [`flux : réponse ${r.status} (200 attendue)`] };
  const identique = Buffer.from(r.bytes).equals(Buffer.from(expected));
  if (!identique) ecarts.push(`flux publié différent de celui signé (${r.bytes.length} octets reçus, ${expected.length} signés) : ancienne version encore servie ?`);
  if (r.headers.get('access-control-allow-origin') !== '*') ecarts.push(`en-tête Access-Control-Allow-Origin « ${r.headers.get('access-control-allow-origin') ?? 'absent'} » (« * » attendu : _headers non appliqué ?)`);
  const v = await verifyEnvelope(r.bytes, publics, subtle);
  if (!v.ok) return { identique, verifie: false, ecarts: [...ecarts, `vérificateur de l’app : ${v.reason}`] };
  const p = parsePayload(v.value, todayOf(now));
  if (!p.ok) return { identique, verifie: false, ecarts: [...ecarts, `vérificateur de l’app : ${p.reason}`] };
  ecarts.push(...p.value.notes.map((n) => `vérificateur de l’app : ${n}`));
  for (const a of p.value.items) {
    if (!a.image) continue;
    const url = new URL(a.image.path, feedUrl).href;
    let im: Awaited<ReturnType<Fetcher>>;
    try {
      im = await fetcher(url);
    } catch (e) {
      ecarts.push(`image ${a.image.path} injoignable : ${(e as Error).message}`);
      continue;
    }
    if (im.status !== 200) ecarts.push(`image ${a.image.path} : réponse ${im.status}`);
    else if (im.bytes.length > ANNONCES_LIMITS.imageBytes) ecarts.push(`image ${a.image.path} : ${im.bytes.length} octets (${ANNONCES_LIMITS.imageBytes} au plus)`);
    else if (!sniffImage(im.bytes)) ecarts.push(`image ${a.image.path} : format non reconnu`);
    else if (sha256Hex(im.bytes) !== a.image.sha256) ecarts.push(`image ${a.image.path} : empreinte différente de celle signée`);
    else if (im.headers.get('access-control-allow-origin') !== '*') ecarts.push(`image ${a.image.path} : en-tête Access-Control-Allow-Origin absent`);
  }
  return { identique, verifie: identique && !ecarts.length, ecarts };
}
