// Annonces des nouveaux livres (AN1, spec-annonces.md, DP-17) : constantes compilées dans l'app.
// L'adresse du flux, les clés publiques et la liste des hôtes de liens ne viennent jamais du livre (book.json), de
// l'adresse de la page ni du stockage : rien ne permet de rediriger le flux d'un livre publié.
import { ANNONCES_KEYS, type AnnonceKey } from "./keys";

/** Valeur du réglage tant que le lecteur ne l'a pas changé : fixée avant publication d'après l'avis du juriste (§8). */
export const ANNONCES_PAR_DEFAUT = false;

/** Flux commun à toutes les apps de livres (§3). */
export const FEED_URL = "https://annonces.editions-liger.com/v1/annonces.json";

/**
 * Liens permis (§3, liste confirmée par David le 30/10) : `https` seulement, vers `editions-liger.com` et ses
 * sous-domaines, ou vers un des hôtes Amazon (nom exact ou précédé de `www.`). Sinon l'annonce est montrée sans lien.
 */
export const LINK_DOMAINS: readonly string[] = ["editions-liger.com"];
export const LINK_HOSTS: readonly string[] = ["amazon.fr", "amazon.com", "amazon.es", "amazon.co.uk"];

/** Page de confidentialité citée par le réglage (§5), s'il en existe une. Aucune pour l'instant. */
export const PRIVACY_URL: string | null = null;

/** Bornes du flux (§3). */
export const ANNONCES_LIMITS = {
  title: 60,
  text: 200,
  items: 5,
  feedBytes: 32 * 1024,
  imageBytes: 200 * 1024,
  feedDays: 90,
  itemDays: 365,
} as const;

/** Au plus une lecture tous les 7 jours (§4). */
export const CHECK_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
/** Délai d'une requête (flux, puis image) (§4). */
export const FETCH_TIMEOUT_MS = 5000;
/** Appui maintenu qui active « Voir le livre » (§5). */
export const HOLD_MS = 3000;

export const ANNONCES_STORAGE_KEY = "glbinterpreter:annonces";

/**
 * Livre de test seulement (décision de David du 30/10, question 2 d'AN1) : `next build` lancé avec
 * GLBI_ANNONCES_TEST=1 compile ici les clés publiques de test (next.config.ts, variable `GLBI_ANNONCES_TEST_KEYS`) ; le
 * flux est alors lu sur le même hôte que la page, port 4175 (serveur de test, `tests/static-server.ts --annonces`).
 * Sans la variable, la valeur compilée est vide et cette branche disparaît du bundle. build-book refuse un livre autre
 * que le livre de test construit ainsi (marqueur `glbi-annonces-test` dans les identifiants des clés de test).
 */
const TEST_KEYS = process.env.GLBI_ANNONCES_TEST_KEYS;
export const TEST_FEED_PORT = 4175;

export interface AnnoncesSetup {
  feedUrl: string;
  keys: readonly AnnonceKey[];
}

/** Adresse et clés du flux ; `null` : aucune clé déclarée, fonction inerte (ni requête ni réglage). */
export function annoncesSetup(): AnnoncesSetup | null {
  if (TEST_KEYS) {
    const keys = JSON.parse(TEST_KEYS) as AnnonceKey[];
    const { protocol, hostname } = window.location;
    return { feedUrl: `${protocol}//${hostname}:${TEST_FEED_PORT}/v1/annonces.json`, keys };
  }
  return ANNONCES_KEYS.length ? { feedUrl: FEED_URL, keys: ANNONCES_KEYS } : null;
}
