import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, of, shareReplay, tap } from 'rxjs';

import { CurrentUser, LoginResponse } from '../models/auth.model';

/**
 * Access Token en mémoire uniquement (jamais localStorage — immunisé au vol par XSS, mais perdu au
 * rechargement de page). Refresh Token en cookie httpOnly, jamais manipulé ici (le navigateur le
 * gère seul). Voir conventions/security.md.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly accessToken = signal<string | null>(null);
  private readonly currentUser = signal<CurrentUser | null>(null);
  private refreshInFlight$: Observable<LoginResponse> | null = null;

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);

  getAccessToken(): string | null {
    return this.accessToken();
  }

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('auth/login', { username, password }, { withCredentials: true })
      .pipe(tap((res) => this.setSession(res)));
  }

  /**
   * Tentative de restauration de session au démarrage de l'app (le cookie Refresh Token, s'il
   * existe, survit au rechargement de page contrairement à l'Access Token en mémoire) — échec
   * silencieux, un échec signifie simplement "pas connecté".
   */
  restoreSession(): Observable<LoginResponse | null> {
    return this.refreshOnce().pipe(catchError(() => of(null)));
  }

  /** Partage un seul appel /auth/refresh en cas de 401 concurrents (voir authInterceptor) — un
   * Refresh Token étant à usage unique, deux refresh simultanés invalideraient l'un l'autre. */
  refreshOnce(): Observable<LoginResponse> {
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.http.post<LoginResponse>('auth/refresh', {}, { withCredentials: true }).pipe(
        tap((res) => this.setSession(res)),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay(1)
      );
    }
    return this.refreshInFlight$;
  }

  logout(): Observable<void> {
    return this.http.post<void>('auth/logout', {}, { withCredentials: true }).pipe(tap(() => this.clearSession()));
  }

  /** Purge locale sans appel serveur — utilisée quand le refresh échoue (session déjà invalide côté serveur). */
  clearSession(): void {
    this.accessToken.set(null);
    this.currentUser.set(null);
  }

  hasPermission(code: string): boolean {
    return this.currentUser()?.permissionsEffectives.includes(code) ?? false;
  }

  hasAnyPermission(codes: string[]): boolean {
    return codes.some((code) => this.hasPermission(code));
  }

  private setSession(res: LoginResponse): void {
    this.accessToken.set(res.accessToken);
    this.currentUser.set(res.utilisateur);
  }
}
