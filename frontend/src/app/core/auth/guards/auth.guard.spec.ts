import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, provideRouter } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { homeGuard, permissionGuard } from './auth.guard';

function configurer(permissions: string[] | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: () => permissions !== null,
          hasPermission: (code: string) => permissions?.includes(code) ?? false,
          hasAnyPermission: (codes: string[]) => codes.some((code) => permissions?.includes(code) ?? false)
        }
      }
    ]
  });
}

function url(resultat: unknown): string {
  return TestBed.inject(Router).serializeUrl(resultat as UrlTree);
}

function routeAvec(data: Record<string, unknown>): ActivatedRouteSnapshot {
  return { data } as unknown as ActivatedRouteSnapshot;
}

describe('homeGuard', () => {
  it("renvoie vers le premier écran du menu auquel l'utilisateur a accès", () => {
    configurer(['EMPLOYEE_READ', 'CHANTIER_READ']);
    const resultat = TestBed.runInInjectionContext(() => homeGuard(null as never, null as never));
    expect(url(resultat)).toBe('/employees');
  });

  it('renvoie vers « accès refusé » sans aucune permission, jamais vers un écran protégé (pas de boucle)', () => {
    configurer([]);
    const resultat = TestBed.runInInjectionContext(() => homeGuard(null as never, null as never));
    expect(url(resultat)).toBe('/acces-refuse');
  });

  it('renvoie vers la connexion si non authentifié', () => {
    configurer(null);
    const resultat = TestBed.runInInjectionContext(() => homeGuard(null as never, null as never));
    expect(url(resultat)).toBe('/login');
  });
});

describe('permissionGuard', () => {
  it("laisse passer l'utilisateur qui a la permission", () => {
    configurer(['PAIE_READ']);
    const resultat = TestBed.runInInjectionContext(() => permissionGuard(routeAvec({ permission: 'PAIE_READ' }), null as never));
    expect(resultat).toBe(true);
  });

  it("renvoie vers « accès refusé » (et non vers l'accueil) s'il manque la permission", () => {
    configurer(['PAIE_READ']);
    const resultat = TestBed.runInInjectionContext(() => permissionGuard(routeAvec({ permission: 'PAIE_WRITE' }), null as never));
    expect(url(resultat)).toBe('/acces-refuse');
  });
});
