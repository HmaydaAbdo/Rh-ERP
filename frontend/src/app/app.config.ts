import { APP_INITIALIZER, ApplicationConfig, inject } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { MessageService, ConfirmationService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { authInterceptor } from './core/auth/interceptors/auth.interceptor';
import { AuthService } from './core/auth/services/auth.service';

/**
 * Tente une restauration de session au démarrage (le Refresh Token, en cookie httpOnly, survit au
 * rechargement de page contrairement à l'Access Token en mémoire) avant que les routes/guards ne
 * s'exécutent — sans ça, un F5 sur une page protégée renverrait systématiquement vers /login.
 */
function initializeAuth() {
  const authService = inject(AuthService);
  return () => firstValueFrom(authService.restoreSession());
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    { provide: APP_INITIALIZER, useFactory: initializeAuth, multi: true },
    MessageService,
    ConfirmationService
  ]
};
