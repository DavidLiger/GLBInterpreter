// Rapier (MJ2, spec-mini-jeu.md §3 « Monde », DP-15, décisions du 28/10) : `@dimforge/rapier3d-compat` 0.21.0, épinglée
// exactement ; WASM embarqué en base64 dans le paquet (ni fichier `.wasm`, ni SIMD, ni réglage de `next.config.ts`).
//
// Chargement : `import()` à l'entrée dans le jeu (second chunk, après celui du moteur) ; `init()` une fois par page, la
// promesse est gardée pour les entrées suivantes. L'import part d'un module de `src/components/game/` : le plugin
// `GameChunksPlugin` de `next.config.ts` range donc ce chunk parmi ceux du jeu (absent d'un livre sans `book.json.game`).
/** Espace de noms de Rapier (export par défaut du paquet, comme `import RAPIER from …` sous Node). */
export type Rapier = typeof import("@dimforge/rapier3d-compat").default;

let loading: Promise<Rapier> | null = null;

/** Rapier chargé et initialisé (une fois par page). */
export function loadRapier(): Promise<Rapier> {
  if (!loading) {
    loading = import("@dimforge/rapier3d-compat")
      .then(async (mod) => {
        const R = ((mod as unknown as { default?: Rapier }).default ?? mod) as Rapier;
        await R.init();
        return R;
      })
      .catch((e) => {
        loading = null; // nouvel essai à la prochaine entrée
        throw e;
      });
  }
  return loading;
}
