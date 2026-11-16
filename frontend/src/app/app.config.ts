import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import {
  APP_INITIALIZER,
  ApplicationConfig,
  DOCUMENT,
  LOCALE_ID,
  inject,
} from '@angular/core';
import {
  COPILOT_KIT_CONFIG,
  OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER,
} from '@copilotkit/angular';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
  withXhr,
} from '@angular/common/http';
import { TitleStrategy, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { authInterceptor } from './core/auth/interceptors/auth.interceptor';
import { AuthService } from './core/auth/services/auth.service';
import { configurationAssistant } from './core/assistant/assistant-config';
import { chargeurVuesLibres } from './core/assistant/vues-libres';
import { PageTitleStrategy } from './core/navigation/page-title.strategy';
import { fournirSignalForms } from './shared/forms/signal-forms.config';

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
    provideHttpClient(
      withXhr(),
      withInterceptors([authInterceptor, errorInterceptor]),
    ),
    { provide: APP_INITIALIZER, useFactory: initializeAuth, multi: true },
    // CopilotKit (KAN-270) : un seul service pour toute l'application, pour que chaque page enregistre ses outils côté navigateur.
    // `provideCopilotKit` ne fait que fournir ce jeton ; la fabrique donne accès à l'authentification (jeton rafraîchi à la demande).
    {
      provide: COPILOT_KIT_CONFIG,
      useFactory: () =>
        configurationAssistant(inject(AuthService), inject(DOCUMENT)),
    },
    // Vues libres (KAN-95) : moteur officiel, sans fonction de l'hôte, sous politique de contenu stricte (vues-libres.ts).
    {
      provide: OPEN_GENERATIVE_UI_WEBSANDBOX_LOADER,
      useFactory: () => {
        const http = inject(HttpClient);
        return chargeurVuesLibres(() =>
          firstValueFrom(http.get<{ dureeMaxSecondes: number }>('parametres/vues-libres')).then((politique) => politique.dureeMaxSecondes)
        );
      },
    },
    fournirSignalForms(),
  ],
};
