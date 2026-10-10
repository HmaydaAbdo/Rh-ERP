import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { NotificationService } from '@shared/feedback/feedback.service';

interface ApiErrorResponse {
  message?: string;
}

/** La restauration de session au démarrage est silencieuse : un visiteur sans session n'a pas à voir « Erreur ». */
const APPELS_SILENCIEUX = ['auth/refresh'];

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);
  const silencieux = APPELS_SILENCIEUX.some((url) => req.url.startsWith(url));

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (silencieux) {
        return throwError(() => error);
      }

      const apiError = error.error as ApiErrorResponse | null;
      const detail = apiError?.message ?? "Une erreur est survenue lors de la communication avec le serveur.";

      notifications.add({
        severity: 'error',
        summary: 'Erreur',
        detail,
        life: 6000
      });

      return throwError(() => error);
    })
  );
};
