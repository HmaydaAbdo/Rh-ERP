import { authGuard, homeGuard } from './core/auth/guards/auth.guard';
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
});
