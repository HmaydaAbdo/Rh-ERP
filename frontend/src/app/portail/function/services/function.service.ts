import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import {
  Function,
  FunctionCreateRequest,
  FunctionImportResult,
  FunctionSearchCriteria,
  FunctionUpdateRequest
} from '../models/function.model';

export interface FunctionPageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class FunctionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/functions';

  search(criteria: FunctionSearchCriteria, pageRequest: FunctionPageRequest): Observable<Page<Function>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }

    return this.http.post<Page<Function>>(`${this.baseUrl}/search`, criteria, { params });
  }

  getById(id: number): Observable<Function> {
    return this.http.get<Function>(`${this.baseUrl}/${id}`);
  }

  create(dto: FunctionCreateRequest): Observable<Function> {
    return this.http.post<Function>(this.baseUrl, dto);
  }

  update(id: number, dto: FunctionUpdateRequest): Observable<Function> {
    return this.http.put<Function>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  importer(file: File): Observable<FunctionImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<FunctionImportResult>(`${this.baseUrl}/import`, formData);
  }

  telechargerModele(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/import/modele`, { responseType: 'blob' });
  }
}
