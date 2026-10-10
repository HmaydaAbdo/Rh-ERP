import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { LoginResponse } from '../models/auth.model';
import { AuthService } from './auth.service';

function connexion(permissions: string[], jeton = 'jeton-1'): LoginResponse {
  return {
    accessToken: jeton,
    utilisateur: { id: 1, username: 'rh', email: 'rh@staport.ma', actif: true, employee: null, roles: [], permissionsRefusees: [], permissionsEffectives: permissions }
  };
}

describe('AuthService', () => {
  let http: HttpTestingController;
  let service: AuthService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('n’est pas authentifié au départ et n’a aucune permission', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
    expect(service.getAccessToken()).toBeNull();
    expect(service.hasPermission('PAIE_READ')).toBe(false);
    expect(service.hasAnyPermission(['PAIE_READ', 'USER_MANAGE'])).toBe(false);
  });

  describe('connexion', () => {
    it('envoie les identifiants avec le cookie de rafraîchissement, puis garde le jeton et l’utilisateur en mémoire', () => {
      service.login('rh', 'secret').subscribe();

      const r = requete(http, 'POST', 'auth/login');
      expect(r.request.body).toEqual({ username: 'rh', password: 'secret' });
      expect(r.request.withCredentials).toBe(true);
      r.flush(connexion(['PAIE_READ']));

      expect(service.isAuthenticated()).toBe(true);
      expect(service.getAccessToken()).toBe('jeton-1');
      expect(service.user()?.username).toBe('rh');
    });

    it('ne retient rien quand la connexion est refusée', () => {
      service.login('rh', 'faux').subscribe({ error: () => undefined });

      requete(http, 'POST', 'auth/login').flush({ message: 'Identifiants invalides' }, { status: 401, statusText: 'Unauthorized' });

      expect(service.isAuthenticated()).toBe(false);
      expect(service.getAccessToken()).toBeNull();
    });

    it('ne laisse jamais le jeton dans le stockage du navigateur', () => {
      service.login('rh', 'secret').subscribe();
      requete(http, 'POST', 'auth/login').flush(connexion([], 'jeton-secret'));

      expect(JSON.stringify({ ...localStorage })).not.toContain('jeton-secret');
      expect(JSON.stringify({ ...sessionStorage })).not.toContain('jeton-secret');
    });
  });

  describe('permissions', () => {
    beforeEach(() => {
      service.login('rh', 'secret').subscribe();
      requete(http, 'POST', 'auth/login').flush(connexion(['PAIE_READ', 'EMPLOYEE_READ']));
    });

    it('reconnaît une permission effective', () => {
      expect(service.hasPermission('PAIE_READ')).toBe(true);
      expect(service.hasPermission('USER_MANAGE')).toBe(false);
    });

    it('accepte « au moins une » permission d’une liste', () => {
      expect(service.hasAnyPermission(['USER_MANAGE', 'EMPLOYEE_READ'])).toBe(true);
      expect(service.hasAnyPermission(['USER_MANAGE', 'ROLE_MANAGE'])).toBe(false);
      expect(service.hasAnyPermission([])).toBe(false);
    });
  });

  describe('restauration de session', () => {
    it('rétablit la session depuis le cookie de rafraîchissement', () => {
      let reponse: LoginResponse | null | undefined;

      service.restoreSession().subscribe((r) => (reponse = r));

      const r = requete(http, 'POST', 'auth/refresh');
      expect(r.request.withCredentials).toBe(true);
      r.flush(connexion(['PAIE_READ']));
      expect(reponse?.accessToken).toBe('jeton-1');
      expect(service.isAuthenticated()).toBe(true);
    });

    it('échoue en silence : pas de session veut simplement dire « pas connecté »', () => {
      let reponse: LoginResponse | null | undefined;

      service.restoreSession().subscribe((r) => (reponse = r));

      requete(http, 'POST', 'auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
      expect(reponse).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('rafraîchissement', () => {
    it('partage un seul appel entre plusieurs demandes simultanées (le jeton est à usage unique)', () => {
      const reponses: string[] = [];

      service.refreshOnce().subscribe((r) => reponses.push(r.accessToken));
      service.refreshOnce().subscribe((r) => reponses.push(r.accessToken));

      requete(http, 'POST', 'auth/refresh').flush(connexion([], 'nouveau'));
      expect(reponses).toEqual(['nouveau', 'nouveau']);
    });

    it('permet un nouvel appel une fois le premier terminé', () => {
      service.refreshOnce().subscribe();
      requete(http, 'POST', 'auth/refresh').flush(connexion([], 'a'));

      service.refreshOnce().subscribe();
      requete(http, 'POST', 'auth/refresh').flush(connexion([], 'b'));

      expect(service.getAccessToken()).toBe('b');
    });
  });

  describe('déconnexion', () => {
    beforeEach(() => {
      service.login('rh', 'secret').subscribe();
      requete(http, 'POST', 'auth/login').flush(connexion(['PAIE_READ']));
    });

    it('prévient le serveur puis efface la session locale', () => {
      service.logout().subscribe();

      const r = requete(http, 'POST', 'auth/logout');
      expect(r.request.withCredentials).toBe(true);
      expect(service.isAuthenticated()).toBe(true);
      r.flush(null);

      expect(service.isAuthenticated()).toBe(false);
      expect(service.getAccessToken()).toBeNull();
    });

    it('purge la session sans appel serveur quand elle est déjà invalide', () => {
      service.clearSession();

      expect(service.isAuthenticated()).toBe(false);
      expect(service.hasPermission('PAIE_READ')).toBe(false);
    });
  });
});
