import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { Equipe, EquipeCreateRequest, EquipeSearchCriteria, EquipeUpdateRequest } from '../models/equipe.model';

export interface EquipePageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class EquipeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'equipes';

  search(criteria: EquipeSearchCriteria, pageRequest: EquipePageRequest): Observable<Page<Equipe>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }

    return this.http.post<Page<Equipe>>(`${this.baseUrl}/search`, criteria, { params });
  }

  getById(id: number): Observable<Equipe> {
    return this.http.get<Equipe>(`${this.baseUrl}/${id}`);
  }

  create(dto: EquipeCreateRequest): Observable<Equipe> {
    return this.http.post<Equipe>(this.baseUrl, dto);
  }

  update(id: number, dto: EquipeUpdateRequest): Observable<Equipe> {
    return this.http.put<Equipe>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
