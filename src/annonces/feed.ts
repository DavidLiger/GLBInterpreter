// Lecture et vérification du flux d'annonces (AN1, spec-annonces.md §3) : fonctions pures, sans DOM (testées sous Node
// par `test:engine`). Le flux est une donnée : aucun champ n'est interprété comme HTML ni script.
//
// Enveloppe : `{ "payload": "<JSON en base64>", "signature": "<base64>", "keyId": "<id>" }`, sans autre clé.
// Signature ECDSA P-256 / SHA-256 sur les octets du `payload` décodé, au format de WebCrypto : r ‖ s, 64 octets
// (une signature DER est refusée). Le JSON du `payload` n'est lu qu'après la signature vérifiée.
import type { AnnonceKey } from "./keys";
import { ANNONCES_LIMITS, LINK_DOMAINS, LINK_HOSTS } from "./config";

export type AnnonceLang = "fr" | "en" | "es";
const LANGS: readonly AnnonceLang[] = ["fr", "en", "es"];

export interface Annonce {
  id: string;
  bookId: string;
  start: string;
  end: string;
  title: Record<AnnonceLang, string>;
  text: Record<AnnonceLang, string>;
  /** Lien permis seulement (sinon absent : annonce sans lien). */
  url?: string;
  image?: { path: string; sha256: string };
}

/** Partie de `SubtleCrypto` utilisée (navigateur ou Node). */
export interface SubtleLike {
  importKey(format: "spki", keyData: BufferSource, algorithm: EcKeyImportParams, extractable: boolean, usages: KeyUsage[]): Promise<CryptoKey>;
  verify(algorithm: EcdsaParams, key: CryptoKey, signature: BufferSource, data: BufferSource): Promise<boolean>;
  digest(algorithm: "SHA-256", data: BufferSource): Promise<ArrayBuffer>;
}

export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Base64 standard, strict (alphabet, longueur, remplissage) ; `null` sinon. */
export function decodeBase64(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Vérifie l'enveloppe signée et rend les octets du `payload`. `keyId` inconnu, signature fausse ou illisible, octets
 * modifiés : refus.
 */
export async function verifyEnvelope(bytes: Uint8Array, keys: readonly AnnonceKey[], subtle: SubtleLike): Promise<Result<Uint8Array>> {
  if (bytes.length > ANNONCES_LIMITS.feedBytes) return fail(`flux de ${bytes.length} octets (${ANNONCES_LIMITS.feedBytes} au plus)`);
  let env: unknown;
  try {
    env = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("enveloppe illisible (JSON)");
  }
  if (!isObject(env)) return fail("enveloppe illisible");
  const extra = Object.keys(env).filter((k) => !["payload", "signature", "keyId"].includes(k));
  if (extra.length) return fail(`enveloppe : clé inconnue (${extra.join(", ")})`);
  const { payload, signature, keyId } = env;
  if (typeof payload !== "string" || typeof signature !== "string" || typeof keyId !== "string") return fail("enveloppe incomplète");
  const key = keys.find((k) => k.keyId === keyId);
  if (!key) return fail(`keyId « ${keyId.slice(0, 40)} » inconnu`);
  const data = decodeBase64(payload);
  const sig = decodeBase64(signature);
  const spki = decodeBase64(key.spki);
  if (!data) return fail("payload : base64 illisible");
  if (!sig || sig.length !== 64) return fail("signature illisible (64 octets r ‖ s attendus)");
  if (!spki) return fail(`clé « ${key.keyId} » illisible`);
  let ok = false;
  try {
    const pub = await subtle.importKey("spki", spki as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    ok = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig as BufferSource, data as BufferSource);
  } catch {
    return fail(`clé « ${key.keyId} » ou signature refusée par WebCrypto`);
  }
  return ok ? { ok: true, value: data } : fail("signature fausse");
}

// ── Dates (jours civils, « AAAA-MM-JJ ») ──

const DAY_MS = 86_400_000;

/** Jour civil d'une date « AAAA-MM-JJ » réelle (2026-02-30 refusée) ; `null` sinon. */
export function dayNumber(s: unknown): number | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return t / DAY_MS;
}

/** Jour civil local de l'appareil. */
export const todayOf = (now: Date): number => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;

// ── Liens et images ──

/** Lien permis (§3) : `https`, sans identifiants ni port, hôte de la liste. */
export function allowedLink(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  const ok = LINK_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`)) || LINK_HOSTS.some((h) => host === h || host === `www.${h}`);
  return ok ? u.href : null;
}

/** Segments commençant par une lettre, un chiffre, `_` ou `-` : ni chemin absolu, ni `.` ou `..`, ni schéma (`x:`). */
const IMAGE_PATH = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\.(webp|png|jpe?g)$/i;

/** Chemin d'image relatif au flux (§3). */
export function validImagePath(p: unknown): p is string {
  return typeof p === "string" && p.length <= 200 && IMAGE_PATH.test(p);
}

/** Type d'une image d'après ses premiers octets : WebP, PNG ou JPEG ; `null` sinon. */
export function sniffImage(b: Uint8Array): "image/webp" | "image/png" | "image/jpeg" | null {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 12 && at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (b.length >= 8 && b[0] === 0x89 && at(1, "PNG\r\n\x1a\n")) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

export async function sha256Hex(subtle: SubtleLike, data: Uint8Array): Promise<string> {
  const h = new Uint8Array(await subtle.digest("SHA-256", data as BufferSource));
  return [...h].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ── Payload ──

/** Texte traduit en FR, EN, ES, chaque langue non vide et de `max` caractères au plus. */
function translated(v: unknown, max: number): Record<AnnonceLang, string> | null {
  if (!isObject(v)) return null;
  const out = {} as Record<AnnonceLang, string>;
  for (const l of LANGS) {
    const s = v[l];
    if (typeof s !== "string") return null;
    const t = s.trim();
    if (!t || [...t].length > max) return null;
    out[l] = t;
  }
  return out;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Annonce lue, ou raison du refus (annonce ignorée, le reste du flux est gardé). */
export function parseItem(v: unknown): Result<Annonce> {
  if (!isObject(v)) return fail("annonce illisible");
  const id = typeof v.id === "string" && ID.test(v.id) ? v.id : null;
  if (!id) return fail("annonce sans id valide");
  const where = `annonce « ${id} »`;
  if (typeof v.bookId !== "string" || !ID.test(v.bookId)) return fail(`${where} : bookId invalide`);
  const start = dayNumber(v.start);
  const end = dayNumber(v.end);
  if (start === null || end === null) return fail(`${where} : start ou end invalide`);
  if (end < start) return fail(`${where} : end avant start`);
  if (end - start > ANNONCES_LIMITS.itemDays) return fail(`${where} : end au-delà de start + ${ANNONCES_LIMITS.itemDays} jours`);
  const title = translated(v.title, ANNONCES_LIMITS.title);
  const text = translated(v.text, ANNONCES_LIMITS.text);
  if (!title) return fail(`${where} : titre absent ou trop long (FR, EN, ES, ${ANNONCES_LIMITS.title} caractères au plus)`);
  if (!text) return fail(`${where} : texte absent ou trop long (FR, EN, ES, ${ANNONCES_LIMITS.text} caractères au plus)`);
  let image: Annonce["image"];
  if (v.image !== undefined) {
    const img = v.image;
    if (!isObject(img) || !validImagePath(img.path) || typeof img.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(img.sha256)) {
      return fail(`${where} : image invalide`);
    }
    image = { path: img.path, sha256: img.sha256 };
  }
  const url = v.url === undefined ? undefined : (allowedLink(v.url) ?? undefined);
  return { ok: true, value: { id, bookId: v.bookId, start: v.start as string, end: v.end as string, title, text, ...(url ? { url } : {}), ...(image ? { image } : {}) } };
}

export interface ParsedFeed {
  /** Annonces valides, dans l'ordre du flux. */
  items: Annonce[];
  /** Annonces ignorées (raisons) et liens retirés. */
  notes: string[];
}

/**
 * Payload vérifié → annonces valides (§3). Version différente de 1, dates du flux invalides, flux expiré ou dont
 * `expires` dépasse `issued` + 90 jours, plus de 5 annonces : flux refusé en entier. Annonce invalide : ignorée.
 */
export function parsePayload(bytes: Uint8Array, today: number): Result<ParsedFeed> {
  let p: unknown;
  try {
    p = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("payload illisible (JSON)");
  }
  if (!isObject(p)) return fail("payload illisible");
  if (p.version !== 1) return fail(`version ${JSON.stringify(p.version)} (1 attendue)`);
  const issued = dayNumber(p.issued);
  const expires = dayNumber(p.expires);
  if (issued === null || expires === null) return fail("issued ou expires invalide");
  if (expires < issued) return fail("expires avant issued");
  if (expires - issued > ANNONCES_LIMITS.feedDays) return fail(`expires au-delà de issued + ${ANNONCES_LIMITS.feedDays} jours`);
  if (today > expires) return fail(`flux périmé (expires ${p.expires})`);
  if (!Array.isArray(p.items)) return fail("items absent");
  if (p.items.length > ANNONCES_LIMITS.items) return fail(`${p.items.length} annonces (${ANNONCES_LIMITS.items} au plus)`);
  const items: Annonce[] = [];
  const notes: string[] = [];
  for (const raw of p.items) {
    const r = parseItem(raw);
    if (!r.ok) {
      notes.push(r.reason);
      continue;
    }
    if (items.some((a) => a.id === r.value.id)) {
      notes.push(`annonce « ${r.value.id} » en double`);
      continue;
    }
    if (isObject(raw) && raw.url !== undefined && !r.value.url) notes.push(`annonce « ${r.value.id} » : lien hors de la liste, retiré`);
    items.push(r.value);
  }
  return { ok: true, value: { items, notes } };
}

/**
 * Annonce à montrer (§3, §5) : en cours aujourd'hui (start ≤ aujourd'hui ≤ end), pas celle du livre ouvert, pas déjà vue ;
 * la plus récente (start le plus tardif ; à égalité, la première du flux). `null` : aucune.
 */
export function pickAnnonce(items: readonly Annonce[], today: number, bookId: string, seen: readonly string[]): Annonce | null {
  const candidates = items.filter((a) => {
    const s = dayNumber(a.start)!;
    const e = dayNumber(a.end)!;
    return s <= today && today <= e && a.bookId !== bookId && !seen.includes(a.id);
  });
  let best: Annonce | null = null;
  for (const a of candidates) if (!best || dayNumber(a.start)! > dayNumber(best.start)!) best = a;
  return best;
}
