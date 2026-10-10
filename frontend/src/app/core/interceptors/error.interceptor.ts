import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { NotificationService } from '@shared/feedback/feedback.service';

interface ApiErrorResponse {
  message?: string;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
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
