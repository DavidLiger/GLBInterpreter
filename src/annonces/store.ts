// État des annonces dans le stockage (AN1, spec-annonces.md §5) : clé `glbinterpreter:annonces` (propre à chaque site de
// livre), valeur `{ enabled?, lastCheck?, seen[] }`, lue champ par champ. Clé et valeur de progression inchangées ;
// « Effacer ma collection » ne touche pas cette clé (réglage du parent, comme le score du jeu et les commandes).
import type { StorageLike } from "@/components/book/progress";
import { ANNONCES_PAR_DEFAUT, ANNONCES_STORAGE_KEY, CHECK_EVERY_MS } from "./config";

export interface AnnoncesState {
  enabled?: boolean;
  /** Date ISO de la dernière lecture du flux (réussie ou non). */
  lastCheck?: string;
  /** Identifiants des annonces déjà montrées. */
  seen: string[];
}

/** Annonces vues gardées (les plus récentes) : le flux en compte 5 au plus. */
const SEEN_MAX = 50;

export function parseAnnoncesState(raw: string | null): AnnoncesState {
  let v: unknown = null;
  try {
    v = raw === null ? null : JSON.parse(raw);
  } catch {
    v = null;
  }
  const o = typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const state: AnnoncesState = { seen: [] };
  if (typeof o.enabled === "boolean") state.enabled = o.enabled;
  if (typeof o.lastCheck === "string" && !Number.isNaN(Date.parse(o.lastCheck))) state.lastCheck = o.lastCheck;
  if (Array.isArray(o.seen)) state.seen = o.seen.filter((s): s is string => typeof s === "string").slice(-SEEN_MAX);
  return state;
}

export const isEnabled = (s: AnnoncesState): boolean => s.enabled ?? ANNONCES_PAR_DEFAUT;

/** Lecture due : jamais faite, faite il y a 7 jours ou plus, ou datée dans le futur (horloge reculée). */
export function isDue(s: AnnoncesState, now: Date): boolean {
  if (!s.lastCheck) return true;
  const last = Date.parse(s.lastCheck);
  return now.getTime() - last >= CHECK_EVERY_MS || last > now.getTime();
}

export const withSeen = (s: AnnoncesState, id: string): AnnoncesState =>
  s.seen.includes(id) ? s : { ...s, seen: [...s.seen, id].slice(-SEEN_MAX) };

/** Accès au stockage ; une lecture ou une écriture impossible le rend indisponible (`ok` faux). */
export class AnnoncesStore {
  constructor(private readonly storage: StorageLike | null) {}

  read(): { ok: boolean; state: AnnoncesState } {
    if (!this.storage) return { ok: false, state: { seen: [] } };
    try {
      return { ok: true, state: parseAnnoncesState(this.storage.getItem(ANNONCES_STORAGE_KEY)) };
    } catch {
      return { ok: false, state: { seen: [] } };
    }
  }

  write(state: AnnoncesState): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(ANNONCES_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  update(fn: (s: AnnoncesState) => AnnoncesState): boolean {
    const r = this.read();
    return r.ok && this.write(fn(r.state));
  }
}
