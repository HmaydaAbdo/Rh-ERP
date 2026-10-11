import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { AdminResetPasswordRequest, AdminUser, DenyPermissionsRequest, UserCreateRequest, UserSearchCriteria, UserUpdateRequest } from '../models/admin.model';

export interface UserPageRequest {
  page: number;
  size: number;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'users';

  /** Une page de comptes, filtrée et triée par le serveur. */
  search(criteria: UserSearchCriteria, pageRequest: UserPageRequest): Observable<Page<AdminUser>> {
    let params = new HttpParams().set('page', pageRequest.page).set('size', pageRequest.size);
    if (pageRequest.sort) {
      params = params.set('sort', pageRequest.sort);
    }
    return this.http.post<Page<AdminUser>>(`${this.baseUrl}/search`, criteria, { params });
  }

  findById(id: number): Observable<AdminUser> {
    return this.http.get<AdminUser>(`${this.baseUrl}/${id}`);
  }

  create(dto: UserCreateRequest): Observable<AdminUser> {
    return this.http.post<AdminUser>(this.baseUrl, dto);
  }

  update(id: number, dto: UserUpdateRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${this.baseUrl}/${id}`, dto);
  }

  updateDeniedPermissions(id: number, dto: DenyPermissionsRequest): Observable<AdminUser> {
    return this.http.put<AdminUser>(`${this.baseUrl}/${id}/permissions-refusees`, dto);
  }

  resetPassword(id: number, dto: AdminResetPasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/reset-password`, dto);
  }
}
