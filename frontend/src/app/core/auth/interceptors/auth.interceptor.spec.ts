import { HttpClient, provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { requete } from '../../../shared/testing/http';
import { LoginResponse } from '../models/auth.model';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

function connexion(jeton: string): LoginResponse {
  return {
    accessToken: jeton,
    utilisateur: { id: 1, version: 0, username: 'rh', email: 'rh@staport.ma', actif: true, employee: null, roles: [], permissionsRefusees: [], permissionsEffectives: [] }
  };
}

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr(), withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: Router, useValue: router }]
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  function ouvrirSession(jeton: string): void {
    auth.login('rh', 'x').subscribe();
    requete(http, 'POST', 'auth/login').flush(connexion(jeton));
  }

  it('n’ajoute aucun en-tête sans session', () => {
    client.get('employees').subscribe();

    const r = requete(http, 'GET', 'employees');
    r.flush([]);
    expect(r.request.headers.has('Authorization')).toBe(false);
  });

  it('présente le jeton en mémoire de la session aux appels de l’API', () => {
    ouvrirSession('jeton-1');

    client.get('employees').subscribe();

    const r = requete(http, 'GET', 'employees');
    r.flush([]);
    expect(r.request.headers.get('Authorization')).toBe('Bearer jeton-1');
  });

  it('n’envoie jamais le jeton aux routes publiques d’authentification, mais joint le cookie de rafraîchissement', () => {
    ouvrirSession('jeton-1');

    client.post('auth/forgot-password', {}).subscribe();

    const r = requete(http, 'POST', 'auth/forgot-password');
    r.flush(null);
    expect(r.request.headers.has('Authorization')).toBe(false);
    expect(r.request.withCredentials).toBe(true);
  });

  it('sur un 401, rafraîchit la session puis rejoue l’appel avec le nouveau jeton', () => {
    ouvrirSession('ancien');
    let reponse: unknown;

    client.get('employees').subscribe((r) => (reponse = r));
    requete(http, 'GET', 'employees').flush({}, { status: 401, statusText: 'Unauthorized' });
    requete(http, 'POST', 'auth/refresh').flush(connexion('nouveau'));

    const rejoue = requete(http, 'GET', 'employees');
    expect(rejoue.request.headers.get('Authorization')).toBe('Bearer nouveau');
    rejoue.flush([{ id: 1 }]);
    expect(reponse).toEqual([{ id: 1 }]);
  });

  it('partage un seul rafraîchissement entre plusieurs appels refusés en même temps', () => {
    ouvrirSession('ancien');

    client.get('employees').subscribe();
    client.get('chantiers').subscribe();
    requete(http, 'GET', 'employees').flush({}, { status: 401, statusText: 'Unauthorized' });
    requete(http, 'GET', 'chantiers').flush({}, { status: 401, statusText: 'Unauthorized' });

    requete(http, 'POST', 'auth/refresh').flush(connexion('nouveau'));
    requete(http, 'GET', 'employees').flush([]);
    requete(http, 'GET', 'chantiers').flush([]);
  });

  it('si le rafraîchissement échoue : efface la session, renvoie vers la connexion et propage l’erreur', () => {
    ouvrirSession('ancien');
    let erreur: unknown;

    client.get('employees').subscribe({ error: (e) => (erreur = e) });
    requete(http, 'GET', 'employees').flush({}, { status: 401, statusText: 'Unauthorized' });
    requete(http, 'POST', 'auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(erreur).toBeDefined();
  });

  it('ne tente pas de rafraîchir sur le 401 d’une route publique (identifiants invalides)', () => {
    let erreur: { status: number } | undefined;

    client.post('auth/login', {}).subscribe({ error: (e) => (erreur = e) });

    requete(http, 'POST', 'auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(erreur?.status).toBe(401);
    http.expectNone('auth/refresh');
  });

  it('laisse passer sans rafraîchir les autres erreurs (403, 500…)', () => {
    ouvrirSession('jeton-1');
    const statuts: number[] = [];

    client.get('employees').subscribe({ error: (e) => statuts.push(e.status) });
    requete(http, 'GET', 'employees').flush({}, { status: 403, statusText: 'Forbidden' });
    client.get('chantiers').subscribe({ error: (e) => statuts.push(e.status) });
    requete(http, 'GET', 'chantiers').flush({}, { status: 500, statusText: 'Server Error' });

    expect(statuts).toEqual([403, 500]);
    http.expectNone('auth/refresh');
  });
});
