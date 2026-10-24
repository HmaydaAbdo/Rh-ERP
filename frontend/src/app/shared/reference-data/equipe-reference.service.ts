import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../components/lazy-select/lazy-select.model';
import { Page } from '../models/page.model';
import { EQUIPE_ORPHELINE, EquipeReference, rechercheEquipeOrpheline } from './equipe-reference.model';

/** Source du sélecteur générique des équipes. La recherche accepte le code ou le libellé,
 * et les options sont présentées par libellé pour privilégier le nom sémantique. */
@Injectable({ providedIn: 'root' })
export class EquipeReferenceService implements LazySelectSource<EquipeReference> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'equipes';

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<EquipeReference>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'libelle,asc');
    const criteria = { recherche: search || undefined };

    return this.http
      .post<Page<EquipeReference>>(`${this.baseUrl}/search`, criteria, { params })
      .pipe(map((result) => ({
        items: this.ajouterOrphelins(result.content, page, search),
        totalRecords: result.page.totalElements + (this.inclureOrphelins(page, search, result.content) ? 1 : 0)
      })));
  }

  fetchById(id: number | string): Observable<EquipeReference> {
    if (Number(id) === EQUIPE_ORPHELINE.id) return of(EQUIPE_ORPHELINE);
    return this.http.get<EquipeReference>(`${this.baseUrl}/${id}`);
  }

  private ajouterOrphelins(items: EquipeReference[], page: number, search: string): EquipeReference[] {
    return this.inclureOrphelins(page, search, items) ? [...items, EQUIPE_ORPHELINE] : items;
  }

  private inclureOrphelins(page: number, search: string, items: EquipeReference[]): boolean {
    return page === 0 && !items.some((item) => item.id === EQUIPE_ORPHELINE.id) &&
      (!search.trim() || rechercheEquipeOrpheline(search));
  }
}
