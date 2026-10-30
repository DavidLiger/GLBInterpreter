// scripts/studio/essai.ts — essais sur téléphone (ST3, spec-app-bureau.md §7, §9) : publication d'essai sur Cloudflare Pages
// (wrangler par npx, version épinglée), QR d'essai, adresse Wi-Fi du PC pour le serveur de test, QR d'impression du build.
//
// - Règles pures (testées par scripts/studio/test-studio.ts) : nom du projet Pages, lecture de la sortie de `wrangler whoami`
//   et de `wrangler pages deploy`, adresses du réseau local, adresses des QR.
// - Fichiers : QR d'essai écrits dans dist/qr-essai/<bookId>/<id>.svg (→ https://<projet>.pages.dev/s/<id>) ; le build n'est
//   pas modifié (out/book.json garde l'`origin` du livre) ; QR d'impression lus dans dist/qr/<bookId>/ (écrits par le build).
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { SCENE_ID_PATTERN } from '../../src/schema/glbi';

/** Version de wrangler (méthode d'Î16), lancée par `npx` : aucune dépendance npm. */
export const WRANGLER_VERSION = '4.151.1';
export const WRANGLER_PACKAGE = `wrangler@${WRANGLER_VERSION}`;
/** Projet Cloudflare Pages des essais (envoi direct, Î16). */
export const DEFAULT_PROJECT = 'glbi-essai';
/** Branche de production du projet d'essai : l'adresse stable https://<projet>.pages.dev la sert. */
export const DEPLOY_BRANCH = 'main';
export const TRIAL_QR_DIR = path.join('dist', 'qr-essai');
export const PRINT_QR_DIR = path.join('dist', 'qr');

const QR_OPTIONS = { type: 'svg', errorCorrectionLevel: 'M', margin: 4 } as const;

// ---------------------------------------------------------------------------------------------------------
// Règles pures
// ---------------------------------------------------------------------------------------------------------

/** Nom d'un projet Pages : minuscules, chiffres et tirets, 1 à 58 caractères, sans tiret au début ni à la fin. */
export function projectNameError(name: string): string | null {
  if (!name) return 'nom du projet Cloudflare Pages vide';
  if (name.length > 58) return `nom du projet trop long (${name.length} caractères, 58 au plus)`;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) {
    return `nom du projet « ${name} » refusé : minuscules, chiffres et tirets, sans tiret au début ni à la fin`;
  }
  return null;
}

/** Adresse stable d'un projet Pages (branche de production). */
export const projectUrl = (projet: string) => `https://${projet}.pages.dev`;

/** Adresse codée dans un QR d'essai : même forme que les QR imprimés (`<origin>/s/<id>`), sur l'adresse d'essai. */
export const trialSceneUrl = (projet: string, id: string) => `${projectUrl(projet)}/s/${id}`;
/** QR d'essai du mini-jeu (MJ3) : même forme que le QR imprimé `jeu.svg` (`<origin>/jeu`), sur l'adresse d'essai. */
export const trialGameUrl = (projet: string) => `${projectUrl(projet)}/jeu`;
/**
 * Fichier du QR d'essai du jeu dans `dist/qr-essai/<bookId>/` : `_jeu.svg`, nom qu'aucune scène ne peut porter (un
 * identifiant de scène commence par une lettre ou un chiffre) ; une scène « jeu » garde son `jeu.svg`.
 */
export const TRIAL_GAME_FILE = '_jeu.svg';
/** QR imprimé du jeu écrit par build-book (`dist/qr/<bookId>/jeu.svg`, MJ1). */
export const PRINT_GAME_FILE = 'jeu.svg';

/** Adresse du serveur de test par le réseau local (`/s/<id>/`, comme les liens du serveur de test) ; sans scène : le menu. */
export const lanSceneUrl = (ip: string, port: number, id: string | null) => `http://${ip}:${port}/${id ? `s/${id}/` : ''}`;

export interface WhoAmI {
  /** `true` connecté, `false` non connecté, `null` sortie non reconnue. */
  connecte: boolean | null;
  /** Compte ou e-mail annoncé par wrangler. */
  compte: string | null;
}

/** Sortie de `wrangler whoami` (code 0 dans les deux cas : seule la sortie dit si wrangler est connecté). */
export function parseWhoami(lines: string[]): WhoAmI {
  if (lines.some((l) => /You are not authenticated/i.test(l))) return { connecte: false, compte: null };
  const l = lines.find((x) => /You are logged in with an? /i.test(x));
  if (!l) return { connecte: null, compte: null };
  const m = /associated with the (?:email|account) (.+?)\.?\s*$/i.exec(l);
  return { connecte: true, compte: m ? m[1].trim() : null };
}

export interface DeployResult {
  /** « Deployment complete! » trouvé. */
  termine: boolean;
  /** Adresse propre à ce déploiement (`https://<hash>.<projet>.pages.dev`). */
  deploiement: string | null;
  /** Alias annoncé (branche autre que la production). */
  alias: string | null;
}

/** Sortie de `wrangler pages deploy`. */
export function parseDeploy(lines: string[]): DeployResult {
  const r: DeployResult = { termine: false, deploiement: null, alias: null };
  const url = (s: string) => /https:\/\/[^\s'"`<>]+/.exec(s)?.[0].replace(/[.,;)]+$/, '') ?? null;
  for (const l of lines) {
    if (/Deployment complete!/i.test(l)) {
      r.termine = true;
      r.deploiement = url(l) ?? r.deploiement;
    } else if (/Deployment alias URL:/i.test(l)) r.alias = url(l);
  }
  return r;
}

export interface NetIface {
  address: string;
  family: string | number;
  internal: boolean;
}

export interface LanAddress {
  /** Nom de l'interface (Windows : « Wi-Fi », « Ethernet », « vEthernet (WSL) »…). */
  nom: string;
  ip: string;
  /** Interface probablement virtuelle (WSL, Hyper-V, VirtualBox, VPN…) : le téléphone ne la joint pas. */
  virtuelle: boolean;
}

const VIRTUAL = /vEthernet|virtual|vbox|vmware|hyper-?v|docker|wsl|loopback|tailscale|zerotier|vpn|bluetooth|^br-|^veth|^virbr/i;
const WIFI = /wi-?fi|wlan|wireless|sans fil|^wl/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Adresses IPv4 du PC joignables depuis le réseau local, dans l'ordre de préférence : interfaces réelles d'abord, Wi-Fi en
 * tête, adresses privées avant les autres. Exclues : boucle locale, IPv6, adresses automatiques 169.254.x.x.
 */
export function lanAddresses(ifaces: Record<string, NetIface[] | undefined>): LanAddress[] {
  const out: (LanAddress & { rank: number })[] = [];
  for (const [nom, list] of Object.entries(ifaces)) {
    for (const i of list ?? []) {
      const v4 = i.family === 'IPv4' || i.family === 4;
      if (!v4 || i.internal || i.address.startsWith('169.254.')) continue;
      const virtuelle = VIRTUAL.test(nom);
      const rank = (virtuelle ? 100 : 0) + (WIFI.test(nom) ? 0 : 10) + (PRIVATE.test(i.address) ? 0 : 1);
      out.push({ nom, ip: i.address, virtuelle, rank });
    }
  }
  return out.sort((a, b) => a.rank - b.rank || a.nom.localeCompare(b.nom)).map(({ nom, ip, virtuelle }) => ({ nom, ip, virtuelle }));
}

/** Identifiant sans danger dans un chemin de fichier (motif des scènes et du `bookId` du contrat). */
export const safeId = (id: unknown): id is string => typeof id === 'string' && SCENE_ID_PATTERN.test(id);

// ---------------------------------------------------------------------------------------------------------
// QR d'essai (dist/qr-essai/<bookId>/<id>.svg)
// ---------------------------------------------------------------------------------------------------------

export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, QR_OPTIONS);
}

/** Scènes et `bookId` du livre exporté (`out/book.json`) : ce qui vient d'être publié. */
export function readOutBook(outBookJson: string): { bookId: string; scenes: string[]; game: boolean } | { error: string } {
  try {
    const b = JSON.parse(fs.readFileSync(outBookJson, 'utf8'));
    if (!safeId(b?.bookId) || !Array.isArray(b?.scenes)) return { error: 'out/book.json : bookId ou scenes illisible' };
    return { bookId: b.bookId, scenes: b.scenes.filter(safeId), game: !!b.game && typeof b.game === 'object' };
  } catch (e) {
    return { error: `out/book.json illisible (${(e as Error).message})` };
  }
}

/** Écrit un QR d'essai par scène, et celui du jeu si le livre publié en a un (dossier du livre vidé d'abord). Adresses codées. */
export async function writeTrialQrs(root: string, bookId: string, projet: string, scenes: string[], game = false): Promise<string[]> {
  if (!safeId(bookId)) throw new Error(`bookId « ${bookId} » refusé pour un nom de dossier`);
  const dir = path.join(root, TRIAL_QR_DIR, bookId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const urls: string[] = [];
  for (const id of scenes.filter(safeId)) {
    const url = trialSceneUrl(projet, id);
    fs.writeFileSync(path.join(dir, `${id}.svg`), await qrSvg(url));
    urls.push(url);
  }
  if (game) {
    const url = trialGameUrl(projet);
    fs.writeFileSync(path.join(dir, TRIAL_GAME_FILE), await qrSvg(url));
    urls.push(url);
  }
  return urls;
}

/** QR d'essai du jeu (`null` s'il n'a pas été écrit : livre publié sans jeu, ou publié avant MJ3). */
export function trialGameQrFile(root: string, bookId: string): string | null {
  if (!safeId(bookId)) return null;
  const f = path.join(root, TRIAL_QR_DIR, bookId, TRIAL_GAME_FILE);
  return fs.existsSync(f) ? f : null;
}

/** Fichier d'un QR d'essai (`null` s'il n'existe pas ou si l'identifiant est refusé). */
export function trialQrFile(root: string, bookId: string, id: string): string | null {
  if (!safeId(bookId) || !safeId(id)) return null;
  const f = path.join(root, TRIAL_QR_DIR, bookId, `${id}.svg`);
  return fs.existsSync(f) ? f : null;
}

/** Scènes qui ont un QR d'essai, dans l'ordre donné. */
export function trialQrScenes(root: string, bookId: string, order: string[]): string[] {
  if (!safeId(bookId)) return [];
  let files: string[];
  try {
    files = fs.readdirSync(path.join(root, TRIAL_QR_DIR, bookId));
  } catch {
    return [];
  }
  const have = new Set(files.filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)));
  return order.filter((id) => have.has(id));
}

// ---------------------------------------------------------------------------------------------------------
// QR d'impression (dist/qr/<bookId>/NN-<id>.svg et urls.txt, écrits par build-book)
// ---------------------------------------------------------------------------------------------------------

export interface PrintQr {
  /** Scène du QR ; `null` pour le QR du mini-jeu (`jeu.svg`, MJ3). */
  scene: string | null;
  /** QR du mini-jeu (`<origin>/jeu`). */
  jeu?: true;
  fichier: string;
  url: string | null;
}

/** Nom d'un QR d'impression écrit par build-book : `NN-<id>.svg`. */
export function printQrScene(file: string): string | null {
  const m = /^\d+-(.+)\.svg$/.exec(file);
  return m && safeId(m[1]) ? m[1] : null;
}

/** QR d'impression du livre (ordre des fichiers, donc du livre au moment du build) ; adresse lue dans `urls.txt`. */
export function printQrs(root: string, bookId: string): { items: PrintQr[]; date: number | null } {
  if (!safeId(bookId)) return { items: [], date: null };
  const dir = path.join(root, PRINT_QR_DIR, bookId);
  let files: string[];
  try {
    files = fs.readdirSync(dir).sort();
  } catch {
    return { items: [], date: null };
  }
  const urls = new Map<string, string>();
  let date: number | null = null;
  try {
    const f = path.join(dir, 'urls.txt');
    date = fs.statSync(f).mtimeMs;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const [file, url] = line.split('\t');
      if (file && url) urls.set(file, url.trim());
    }
  } catch {
    // urls.txt absent : adresses inconnues
  }
  const items: PrintQr[] = [];
  for (const f of files) {
    const scene = printQrScene(f);
    if (scene) items.push({ scene, fichier: f, url: urls.get(f) ?? null });
  }
  // QR du mini-jeu (MJ1 : écrit par build-book quand le livre a un jeu), après les scènes, comme dans urls.txt.
  if (files.includes(PRINT_GAME_FILE)) items.push({ scene: null, jeu: true, fichier: PRINT_GAME_FILE, url: urls.get(PRINT_GAME_FILE) ?? null });
  return { items, date };
}

/** Fichier du QR imprimé du jeu (`dist/qr/<bookId>/jeu.svg`), `null` s'il est absent. */
export function printGameQrFile(root: string, bookId: string): string | null {
  if (!safeId(bookId)) return null;
  const f = path.join(root, PRINT_QR_DIR, bookId, PRINT_GAME_FILE);
  return fs.existsSync(f) ? f : null;
}

export function printQrFile(root: string, bookId: string, id: string): string | null {
  if (!safeId(id)) return null;
  const it = printQrs(root, bookId).items.find((x) => x.scene === id);
  return it ? path.join(root, PRINT_QR_DIR, bookId, it.fichier) : null;
}
