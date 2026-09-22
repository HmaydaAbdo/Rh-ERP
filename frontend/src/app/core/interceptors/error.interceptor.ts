import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

interface ApiErrorResponse {
  message?: string;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const apiError = error.error as ApiErrorResponse | null;
      const detail = apiError?.message ?? "Une erreur est survenue lors de la communication avec le serveur.";

      messageService.add({
        severity: 'error',
        summary: 'Erreur',
        detail,
        life: 6000
      });

      return throwError(() => error);
    })
  );
};
