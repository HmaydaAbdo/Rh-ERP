import { Observable } from 'rxjs';

/** Une page de résultats — même forme que `Page<T>` (voir `shared/models/page.model.ts`) mais réduite
 * aux deux informations dont un sélecteur a besoin, pour ne pas coupler ce composant partagé au
 * modèle de pagination Spring exposé par chaque domaine. */
export interface LazySelectPage<T> {
  items: T[];
  totalRecords: number;
}

/** Contrat qu'un domaine implémente pour brancher `LazySelectComponent` sur ses propres données —
 * voir `conventions/frontend.md` (section Sélecteurs). Chaque domaine fournit une implémentation fine
 * (ex. `ChantierReferenceService`) plutôt que de dupliquer la pagination/recherche dans chaque
 * composant consommateur. */
export interface LazySelectSource<T> {
  /** Une page de résultats, filtrée par `search` si non vide (recherche serveur, pas un filtre
   * client sur une liste déjà chargée) — trié de façon stable pour que la pagination reste cohérente
   * d'une page à l'autre. */
  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<T>>;

  /** Résout un identifiant déjà sélectionné (ex. mode édition) qui n'est pas forcément dans la page
   * actuellement chargée — sans ça, le libellé de la valeur courante ne pourrait pas s'afficher tant
   * que l'utilisateur n'a pas fait défiler jusqu'à elle. */
  fetchById(id: number | string): Observable<T>;
}
