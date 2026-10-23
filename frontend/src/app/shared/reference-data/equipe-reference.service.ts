import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../components/lazy-select/lazy-select.model';
import { Page } from '../models/page.model';
import { EquipeReference } from './equipe-reference.model';

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
      .pipe(map((result) => ({ items: result.content, totalRecords: result.page.totalElements })));
  }

  fetchById(id: number | string): Observable<EquipeReference> {
    return this.http.get<EquipeReference>(`${this.baseUrl}/${id}`);
  }
}
