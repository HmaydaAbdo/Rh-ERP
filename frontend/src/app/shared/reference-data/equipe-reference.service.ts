import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../components/lazy-select/lazy-select.model';
import { Page } from '../models/page.model';
import { EquipeReference } from './equipe-reference.model';

/** Source de données du sélecteur générique (voir `shared/components/lazy-select`) pour les
 * équipes — recherche sur `recherche` (OU entre code et libellé côté backend, voir
 * `EquipeSpecification` : l'utilisateur tape ce qu'il voit, le libellé affiché ou le code des
 * tableaux). */
@Injectable({ providedIn: 'root' })
export class EquipeReferenceService implements LazySelectSource<EquipeReference> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'equipes';

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<EquipeReference>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'code,asc');
    const criteria = { recherche: search || undefined };

    return this.http
      .post<Page<EquipeReference>>(`${this.baseUrl}/search`, criteria, { params })
      .pipe(map((result) => ({ items: result.content, totalRecords: result.page.totalElements })));
  }

  fetchById(id: number | string): Observable<EquipeReference> {
    return this.http.get<EquipeReference>(`${this.baseUrl}/${id}`);
  }
}
