import { APP_INITIALIZER, FactoryProvider, LOCALE_ID, ValueProvider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { appConfig } from './app.config';
import { AuthService } from './core/auth/services/auth.service';

describe('configuration principale', () => {
  const providers = appConfig.providers ?? [];
  const localeProvider = providers.find(
    (provider) => typeof provider === 'object' && provider !== null && 'provide' in provider && provider.provide === LOCALE_ID
  ) as ValueProvider | undefined;
  const authInitializerProvider = providers.find(
    (provider) => typeof provider === 'object' && provider !== null && 'provide' in provider && provider.provide === APP_INITIALIZER
  ) as FactoryProvider | undefined;

  it('configure le locale français', () => {
    expect(localeProvider?.useValue).toBe('fr-FR');
  });

  it('restaure la session avant le démarrage des routes', async () => {
    const restoreSession = vi.fn(() => of(true));
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { restoreSession } }]
    });

    const initializer = TestBed.runInInjectionContext(() => authInitializerProvider?.useFactory?.());

    expect(initializer).toBeTypeOf('function');
    await initializer?.();
    expect(restoreSession).toHaveBeenCalledOnce();
  });
});
