import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { LazySelectPage, LazySelectSource } from '../components/lazy-select/lazy-select.model';
import { Page } from '../models/page.model';
import { FunctionReference } from './function-reference.model';

/** Source de données du sélecteur générique (voir `shared/components/lazy-select`) pour les
 * fonctions — remplace l'ancien `list()` qui chargeait toute la liste d'un coup (`size=200`). */
@Injectable({ providedIn: 'root' })
export class FunctionReferenceService implements LazySelectSource<FunctionReference> {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'functions';

  fetchPage(page: number, size: number, search: string): Observable<LazySelectPage<FunctionReference>> {
    const params = new HttpParams().set('page', page).set('size', size).set('sort', 'libelle,asc');
    const criteria = { libelle: search || undefined };

    return this.http
      .post<Page<FunctionReference>>(`${this.baseUrl}/search`, criteria, { params })
      .pipe(map((result) => ({ items: result.content, totalRecords: result.totalElements })));
  }

  fetchById(id: number | string): Observable<FunctionReference> {
    return this.http.get<FunctionReference>(`${this.baseUrl}/${id}`);
  }
}
