import { Observable, of } from 'rxjs';

import { LazySelectPage, LazySelectSource } from './lazy-select.model';

/**
 * Source du sélecteur générique (voir `lazy-select.model.ts`) sur une liste déjà connue — ex. les chantiers d'un mois, pour
 * restreindre les choix d'un filtre à ce qui existe vraiment. La recherche et la pagination se font sur la liste, sans appel
 * serveur. Un identifiant absent de la liste (déjà sélectionné ailleurs, par exemple) est résolu par `secours`, sans quoi son
 * libellé ne pourrait plus s'afficher.
 */
export class LazySelectInMemorySource<T extends { id: number }> implements LazySelectSource<T> {
  constructor(
    private readonly items: T[],
    /** Le texte sur lequel porte la recherche (ce que l'utilisateur voit). */
    private readonly texte: (item: T) => string,
    private readonly secours: LazySelectSource<T>
  ) {}

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<T>> {
    const terme = search.trim().toLowerCase();
    const trouves = this.items.filter((item) => !terme || this.texte(item).toLowerCase().includes(terme));
    return of({ items: trouves.slice(page * size, (page + 1) * size), totalRecords: trouves.length });
  }

  fetchById(id: number | string): Observable<T> {
    const trouve = this.items.find((item) => item.id === Number(id));
    return trouve ? of(trouve) : this.secours.fetchById(id);
  }
}
