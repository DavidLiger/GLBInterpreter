// Boucle d'animation unique (P-06, Î10b).
//
// Le lecteur n'a qu'un `requestAnimationFrame` : `animate` de `WebDioramaLoader`. Tout travail à faire à chaque image
// (transition de caméra, suivi de la ligne de temps du module réservé `timeline`, poids du mode `buttons`, lecture libre
// d'un clip de l'atelier) s'inscrit ici et est exécuté par `animate`, avant la mise à jour des mixers et le rendu.
// Conséquences : une tâche s'arrête avec la boucle (onglet caché, nettoyage de la scène) et ne survit jamais au lecteur.

/** Tâche exécutée à chaque image. `dt` : secondes écoulées (bornées par `animate`) ; `now` : `performance.now()`.
 *  Retourner `false` retire la tâche. */
export type FrameTask = (dt: number, now: number) => boolean | void;

export class FrameTasks {
  private readonly tasks = new Set<FrameTask>();

  /** Inscrit une tâche ; renvoie la fonction qui la retire. */
  add(task: FrameTask): () => void {
    this.tasks.add(task);
    return () => {
      this.tasks.delete(task);
    };
  }

  /** Exécute les tâches inscrites (copie : une tâche peut en inscrire ou en retirer une autre). */
  run(dt: number, now: number): void {
    for (const task of [...this.tasks]) {
      if (!this.tasks.has(task)) continue;
      if (task(dt, now) === false) this.tasks.delete(task);
    }
  }

  clear(): void {
    this.tasks.clear();
  }

  get size(): number {
    return this.tasks.size;
  }
}
