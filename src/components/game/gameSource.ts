// Lecture de `game/game.json` (MJ1) : objet fusionné du jeu écrit par le build (`builtGameSchema`), lu à l'exécution par
// chemin relatif, servi hors ligne par le service worker comme le reste du livre. Le lecteur n'embarque pas Zod : vérification
// de forme minimale des champs lus, pour un message lisible. MJ1 n'en lit que les textes (écran d'attente du moteur) ; le
// moteur (MJ2) lira entités, règles, caméra et sons.
import { bookDataBase } from "@/components/book/bookSource";

type Texts = { fr: string; en: string; es: string };

export interface ReaderGame {
  template: string;
  title: Texts;
  instructions: Texts;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isTexts = (v: unknown): v is Texts => isObj(v) && ["fr", "en", "es"].every((l) => typeof v[l] === "string");

export function parseReaderGame(raw: unknown): ReaderGame {
  if (!isObj(raw) || raw.version !== 1 || typeof raw.template !== "string") throw new Error("game/game.json : version 1 et template attendus");
  const texts = raw.texts;
  if (!isObj(texts) || !isTexts(texts.title) || !isTexts(texts.instructions)) throw new Error("game/game.json : texts.title et texts.instructions attendus");
  return { template: raw.template, title: texts.title, instructions: texts.instructions };
}

export async function loadReaderGame(): Promise<ReaderGame> {
  const path = `${bookDataBase()}game/game.json`;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return parseReaderGame(await res.json());
}
