import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { AuditChangement, AuditCriteres, AuditEntree, AuditLigne, AuditVersion } from '../models/audit.model';

export interface AuditPageRequest {
  page: number;
  size: number;
  sort?: string;
}

/** Consultation du journal d'audit — lecture seule (permission `AUDIT_READ`). */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'logs';

  search(criteres: AuditCriteres, pageRequest: AuditPageRequest): Observable<Page<AuditLigne>> {
    return this.http.post<Page<AuditLigne>>(`${this.baseUrl}/search`, criteres, { params: this.params(pageRequest) });
  }

  getById(id: number): Observable<AuditEntree> {
    return this.http.get<AuditEntree>(`${this.baseUrl}/${id}`);
  }

  details(id: number, pageRequest: AuditPageRequest): Observable<Page<AuditChangement>> {
    return this.http.get<Page<AuditChangement>>(`${this.baseUrl}/${id}/details`, { params: this.params(pageRequest) });
  }

  historique(entite: string, id: number, pageRequest: AuditPageRequest): Observable<Page<AuditVersion>> {
    return this.http.get<Page<AuditVersion>>(`${this.baseUrl}/historique/${encodeURIComponent(entite)}/${id}`, {
      params: this.params(pageRequest)
    });
  }

  private params(pageRequest: AuditPageRequest): HttpParams {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }
    return params;
  }
}
