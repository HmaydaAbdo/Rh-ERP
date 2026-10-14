import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { PermissionSummary, Role, RoleCreateRequest, RoleSearchCriteria, RoleUpdateRequest } from '../models/admin.model';

export interface RolePageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'roles';

  /** Une page de rôles, filtrée et triée par le serveur. */
  search(criteria: RoleSearchCriteria, pageRequest: RolePageRequest): Observable<Page<Role>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }
    return this.http.post<Page<Role>>(`${this.baseUrl}/search`, criteria, { params });
  }

  findById(id: number): Observable<Role> {
    return this.http.get<Role>(`${this.baseUrl}/${id}`);
  }

  create(dto: RoleCreateRequest): Observable<Role> {
    return this.http.post<Role>(this.baseUrl, dto);
  }

  update(id: number, dto: RoleUpdateRequest): Observable<Role> {
    return this.http.put<Role>(`${this.baseUrl}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  findAllPermissions(): Observable<PermissionSummary[]> {
    return this.http.get<PermissionSummary[]>('permissions');
  }
}
