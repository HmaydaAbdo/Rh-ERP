import { authGuard, homeGuard, permissionGuard } from './core/auth/guards/auth.guard';
import { routes } from './app.routes';

describe('routes principales', () => {
  const routeByPath = new Map(routes.map((route) => [route.path, route]));

  it('laisse les parcours de connexion et de récupération accessibles sans session', () => {
    for (const path of ['login', 'forgot-password', 'reset-password']) {
      expect(routeByPath.get(path)).toBeDefined();
      expect(routeByPath.get(path)?.canActivate ?? []).not.toContain(authGuard);
    }
  });

  it('protège l’accueil et chaque domaine métier avec le guard authentifié', () => {
    expect(routeByPath.get('')?.canActivate).toContain(homeGuard);

    for (const path of ['acces-refuse', 'employees', 'chantiers', 'functions', 'equipes', 'paie', 'audit', 'admin']) {
      expect(routeByPath.get(path)?.canActivate).toContain(authGuard);
    }
  });

  it('réserve la carte à la permission CARTE_READ, distincte de celle des chantiers', () => {
    const carte = routeByPath.get('carte');

    expect(carte?.canActivate).toContain(permissionGuard);
    expect(carte?.data).toEqual({ permission: 'CARTE_READ' });
    expect(carte?.title).toBe('Carte des chantiers');
    expect(carte?.loadComponent).toBeTypeOf('function');
  });
});
