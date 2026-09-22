import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PermissionSummary, Role, RoleCreateRequest, RoleUpdateRequest } from '../models/admin.model';

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/roles';

  findAll(): Observable<Role[]> {
    return this.http.get<Role[]>(this.baseUrl);
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
    return this.http.get<PermissionSummary[]>('/permissions');
  }
}
