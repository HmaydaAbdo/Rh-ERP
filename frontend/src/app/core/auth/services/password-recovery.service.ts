import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PasswordRecoveryService {
  private readonly http = inject(HttpClient);

  requestReset(email: string): Observable<void> {
    return this.http.post<void>('auth/forgot-password', { email });
  }

  resetPassword(token: string, nouveauMotDePasse: string): Observable<void> {
    return this.http.post<void>('auth/reset-password', { token, nouveauMotDePasse });
  }
}
