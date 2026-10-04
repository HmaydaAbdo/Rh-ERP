import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../components/lazy-select/lazy-select.model';
import { Page } from '../models/page.model';
import { ChantierReference } from './chantier-reference.model';

/** Source de données du sélecteur générique (voir `shared/components/lazy-select`) pour les
 * chantiers actifs — recherche sur `recherche` (OU entre code et désignation côté backend, voir
 * `ChantierSpecification` : un chantier n'est affiché dans ce sélecteur que par son `code`, jamais sa
 * désignation, la recherche doit donc matcher ce que l'utilisateur voit réellement à l'écran — pas
 * seulement `designation`, corrigé le 2026-09-28 après constat que taper un code ne trouvait jamais
 * le chantier correspondant). Remplace l'ancien `listActive()` qui chargeait toute la liste d'un coup
 * (`size=200`). */
@Injectable({ providedIn: 'root' })
export class ChantierReferenceService implements LazySelectSource<ChantierReference> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'chantiers';

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<ChantierReference>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'code,asc');
    const criteria = { actif: true, recherche: search || undefined };

    return this.http
      .post<Page<ChantierReference>>(`${this.baseUrl}/search`, criteria, { params })
      .pipe(map((result) => ({ items: result.content, totalRecords: result.page.totalElements })));
  }

  fetchById(id: number | string): Observable<ChantierReference> {
    return this.http.get<ChantierReference>(`${this.baseUrl}/${id}`);
  }
}
