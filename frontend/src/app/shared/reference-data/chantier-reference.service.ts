import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../components/lazy-select/lazy-select.model';
import { Page } from '../models/page.model';
import { ChantierReference } from './chantier-reference.model';

/** Source de données du sélecteur générique (voir `shared/components/lazy-select`) pour les
 * chantiers actifs — recherche sur `designation` (pas `code`, trop court pour une recherche
 * approximative utile ; voir `conventions/frontend.md`, section Sélecteurs). Remplace l'ancien
 * `listActive()` qui chargeait toute la liste d'un coup (`size=200`). */
@Injectable({ providedIn: 'root' })
export class ChantierReferenceService implements LazySelectSource<ChantierReference> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'chantiers';

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<ChantierReference>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'code,asc');
    const criteria = { actif: true, designation: search || undefined };

    return this.http
      .post<Page<ChantierReference>>(`${this.baseUrl}/search`, criteria, { params })
      .pipe(map((result) => ({ items: result.content, totalRecords: result.totalElements })));
  }

  fetchById(id: number | string): Observable<ChantierReference> {
    return this.http.get<ChantierReference>(`${this.baseUrl}/${id}`);
  }
}
