// Lecture du flux d'annonces (AN1, spec-annonces.md §4) : conditions, requête minimale, vérifications, image. Tout échec
// est silencieux pour l'interface (rien d'affiché, pas de nouvel essai avant 7 jours) et dit en console (`console.warn` :
// les autres niveaux sont retirés du build de production). Dépendances injectées : testé sous Node par `test:engine`.
import type { StorageLike } from "@/components/book/progress";
import { ANNONCES_LIMITS, FETCH_TIMEOUT_MS, type AnnoncesSetup } from "./config";
import { parsePayload, pickAnnonce, sha256Hex, sniffImage, todayOf, verifyEnvelope, type Annonce, type SubtleLike } from "./feed";
import { AnnoncesStore, isDue, isEnabled } from "./store";

export interface CheckDeps {
  /** `null` : aucune clé déclarée, rien n'est fait. */
  setup: AnnoncesSetup | null;
  /** Livre ouvert : son annonce n'y est pas montrée. */
  bookId: string;
  storage: StorageLike | null;
  fetch: typeof fetch;
  subtle: SubtleLike;
  now: () => Date;
  /** `navigator.onLine`. */
  online: boolean;
  /** Menu quitté : lecture abandonnée, sans rien retenir (elle sera refaite au prochain affichage du menu). */
  signal?: AbortSignal;
  timeoutMs?: number;
  warn?: (message: string) => void;
}

export interface FoundAnnonce {
  annonce: Annonce;
  image?: { bytes: Uint8Array; type: string };
}

/** Options de toute requête du flux (§4) : ni cookie, ni référent, ni cache, ni en-tête propre. */
const REQUEST: RequestInit = { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", mode: "cors" };

class Timeout extends Error {}

/** Requête et lecture du corps dans le délai ; au-delà de `max` octets, refus sans tout lire si la taille est annoncée. */
async function fetchBytes(d: CheckDeps, url: string, max: number): Promise<{ status: number; bytes?: Uint8Array; tooBig?: number }> {
  const ctrl = new AbortController();
  const ms = d.timeoutMs ?? FETCH_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  const onAbort = () => ctrl.abort();
  d.signal?.addEventListener("abort", onAbort);
  try {
    const res = await d.fetch(url, { ...REQUEST, signal: ctrl.signal });
    if (res.status !== 200) return { status: res.status };
    const announced = Number(res.headers.get("content-length"));
    if (announced > max) return { status: 200, tooBig: announced };
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length > max ? { status: 200, tooBig: bytes.length } : { status: 200, bytes };
  } catch (e) {
    if (timedOut) throw new Timeout(`délai de ${ms / 1000} s dépassé`);
    throw e;
  } finally {
    clearTimeout(timer);
    d.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Annonce à montrer, ou `null`. Aucune requête si : pas de clé, stockage indisponible, réglage désactivé, appareil hors
 * ligne, lecture faite il y a moins de 7 jours. La date de lecture est retenue dès la réponse (ou l'échec) du flux.
 */
export async function checkAnnonces(d: CheckDeps): Promise<FoundAnnonce | null> {
  const warn = (m: string) => (d.warn ?? ((x: string) => console.warn(x)))(`annonces : ${m}`);
  if (!d.setup) return null;
  const store = new AnnoncesStore(d.storage);
  const { ok, state } = store.read();
  if (!ok) return null;
  if (!isEnabled(state) || !d.online) return null;
  const now = d.now();
  if (!isDue(state, now)) return null;
  // Stockage indisponible en écriture : aucune lecture sans pouvoir retenir sa date (§5).
  if (!store.write(state)) {
    warn("stockage indisponible, aucune lecture du flux");
    return null;
  }
  const remember = () => store.update((s) => ({ ...s, lastCheck: now.toISOString() }));

  let feed: Awaited<ReturnType<typeof fetchBytes>>;
  try {
    feed = await fetchBytes(d, d.setup.feedUrl, ANNONCES_LIMITS.feedBytes);
  } catch (e) {
    if (d.signal?.aborted) return null;
    remember();
    warn(`flux injoignable (${e instanceof Timeout ? e.message : "réseau"})`);
    return null;
  }
  remember();
  if (feed.status !== 200) return warn(`flux : réponse ${feed.status}`), null;
  if (!feed.bytes) return warn(`flux de ${feed.tooBig} octets (${ANNONCES_LIMITS.feedBytes} au plus)`), null;

  const payload = await verifyEnvelope(feed.bytes, d.setup.keys, d.subtle);
  if (!payload.ok) return warn(payload.reason), null;
  const today = todayOf(now);
  const parsed = parsePayload(payload.value, today);
  if (!parsed.ok) return warn(parsed.reason), null;
  for (const n of parsed.value.notes) warn(n);
  const annonce = pickAnnonce(parsed.value.items, today, d.bookId, state.seen);
  if (!annonce || d.signal?.aborted) return null;
  if (!annonce.image) return { annonce };

  // Image (§3) : même hôte que le flux, ≤ 200 Ko, empreinte signée, WebP, PNG ou JPEG ; sinon rien n'est affiché.
  const imageUrl = new URL(annonce.image.path, d.setup.feedUrl);
  if (imageUrl.origin !== new URL(d.setup.feedUrl).origin) return warn("image hors de l'hôte du flux"), null;
  let img: Awaited<ReturnType<typeof fetchBytes>>;
  try {
    img = await fetchBytes(d, imageUrl.href, ANNONCES_LIMITS.imageBytes);
  } catch (e) {
    if (!d.signal?.aborted) warn(`image injoignable (${e instanceof Timeout ? e.message : "réseau"})`);
    return null;
  }
  if (img.status !== 200) return warn(`image : réponse ${img.status}`), null;
  if (!img.bytes) return warn(`image de ${img.tooBig} octets (${ANNONCES_LIMITS.imageBytes} au plus)`), null;
  if ((await sha256Hex(d.subtle, img.bytes)) !== annonce.image.sha256) return warn("image : empreinte fausse"), null;
  const type = sniffImage(img.bytes);
  if (!type) return warn("image : format refusé (WebP, PNG ou JPEG)"), null;
  return d.signal?.aborted ? null : { annonce, image: { bytes: img.bytes, type } };
}
