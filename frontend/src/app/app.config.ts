import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { APP_INITIALIZER, ApplicationConfig, LOCALE_ID, inject } from '@angular/core';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { TitleStrategy, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { authInterceptor } from './core/auth/interceptors/auth.interceptor';
import { AuthService } from './core/auth/services/auth.service';
import { PageTitleStrategy } from './core/navigation/page-title.strategy';

registerLocaleData(localeFr);

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
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    provideRouter(routes),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    provideHttpClient(withXhr(), withInterceptors([authInterceptor, errorInterceptor])),
    { provide: APP_INITIALIZER, useFactory: initializeAuth, multi: true }
  ]
};
