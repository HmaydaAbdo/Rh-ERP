import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import {
  Chantier,
  ChantierCreateRequest,
  ChantierSearchCriteria,
  ChantierSyncResult,
  ChantierUpdateRequest
} from '../models/chantier.model';

export interface ChantierPageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class ChantierService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'chantiers';

  search(criteria: ChantierSearchCriteria, pageRequest: ChantierPageRequest): Observable<Page<Chantier>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }

    return this.http.post<Page<Chantier>>(`${this.baseUrl}/search`, criteria, { params });
  }

  getById(id: number): Observable<Chantier> {
    return this.http.get<Chantier>(`${this.baseUrl}/${id}`);
  }

  create(dto: ChantierCreateRequest): Observable<Chantier> {
    return this.http.post<Chantier>(this.baseUrl, dto);
  }

  update(id: number, dto: ChantierUpdateRequest): Observable<Chantier> {
    return this.http.put<Chantier>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  synchroniser(): Observable<ChantierSyncResult> {
    return this.http.post<ChantierSyncResult>(`${this.baseUrl}/sync`, {});
  }
}
