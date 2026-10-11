import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, expand, last, Observable, scan } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { PermissionSummary, Role, RoleCreateRequest, RoleSearchCriteria, RoleUpdateRequest } from '../models/admin.model';

export interface RolePageRequest {
  page: number;
  size: number;
  sort?: string;
}

/** Taille maximale d'une page acceptée par le serveur. */
const PAGE_MAX = 200;

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

  /** Tous les rôles (sélecteur des comptes), page après page : jamais plus d'une page à la fois côté serveur. */
  findEvery(): Observable<Role[]> {
    return this.search({}, { page: 0, size: PAGE_MAX, sort: 'nom,asc' }).pipe(
      expand((page) => (page.page.number + 1 < page.page.totalPages ? this.search({}, { page: page.page.number + 1, size: PAGE_MAX, sort: 'nom,asc' }) : EMPTY)),
      scan((tous: Role[], page) => [...tous, ...page.content], []),
      last()
    );
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
