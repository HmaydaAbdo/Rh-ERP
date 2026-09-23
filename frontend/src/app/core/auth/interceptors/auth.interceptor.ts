import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

const PUBLIC_AUTH_ENDPOINTS = ['auth/login', 'auth/refresh', 'auth/forgot-password', 'auth/reset-password'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isPublicAuthEndpoint = PUBLIC_AUTH_ENDPOINTS.some((url) => req.url.startsWith(url));
  const authReq = withAuthHeader(req, authService.getAccessToken(), isPublicAuthEndpoint);

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isPublicAuthEndpoint) {
        return throwError(() => error);
      }

      return authService.refreshOnce().pipe(
        switchMap(() => next(withAuthHeader(req, authService.getAccessToken(), false))),
        catchError((refreshError) => {
          authService.clearSession();
          router.navigate(['/login']);
          return throwError(() => refreshError);
        })
      );
    })
  );
};

function withAuthHeader<T>(req: HttpRequest<T>, token: string | null, isPublicAuthEndpoint: boolean) {
  const withCredentials = req.url.startsWith('auth/') ? true : req.withCredentials;
  if (isPublicAuthEndpoint || !token) {
    return req.clone({ withCredentials });
  }
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` }, withCredentials });
}
