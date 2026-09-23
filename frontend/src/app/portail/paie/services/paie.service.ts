import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import {
  Paie,
  PaieCreateRequest,
  PaieExportRequest,
  PaieImportResult,
  PaieSearchCriteria,
  PaieUpdateRequest,
  PaieRapportPdfRequest
} from '../models/paie.model';

export interface PaiePageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class PaieService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'paie';

  search(criteria: PaieSearchCriteria, pageRequest: PaiePageRequest): Observable<Page<Paie>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }

    return this.http.post<Page<Paie>>(`${this.baseUrl}/search`, criteria, { params });
  }

  getById(id: number): Observable<Paie> {
    return this.http.get<Paie>(`${this.baseUrl}/${id}`);
  }

  create(dto: PaieCreateRequest): Observable<Paie> {
    return this.http.post<Paie>(this.baseUrl, dto);
  }

  update(id: number, dto: PaieUpdateRequest): Observable<Paie> {
    return this.http.put<Paie>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  importer(file: File, periode: string): Observable<PaieImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const params = new HttpParams().set('periode', periode);
    return this.http.post<PaieImportResult>(`${this.baseUrl}/import`, formData, { params });
  }

  telechargerModele(): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/import/modele`, { responseType: 'blob' });
  }

  exporter(requete: PaieExportRequest): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export`, requete, { responseType: 'blob' });
  }

  telechargerRapportPdf(requete: PaieRapportPdfRequest): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/report/pdf`, requete, { responseType: 'blob' });
  }

  listerEquipes(chantierCode: string, periode: string): Observable<string[]> {
    const params = new HttpParams().set('chantierCode', chantierCode).set('periode', periode);
    return this.http.get<string[]>(`${this.baseUrl}/equipes`, { params });
  }
}
