import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AdminResetPasswordRequest, AdminUser, DenyPermissionsRequest, UserCreateRequest, UserUpdateRequest } from '../models/admin.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/users';

  findAll(): Observable<AdminUser[]> {
    return this.http.get<AdminUser[]>(this.baseUrl);
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
