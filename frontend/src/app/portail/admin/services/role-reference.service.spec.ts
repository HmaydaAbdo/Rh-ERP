import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PermissionSummary, Role } from '../models/admin.model';
import { requete } from '../../../shared/testing/http';
import { RoleReferenceService } from './role-reference.service';

const permission: PermissionSummary = { id: 1, version: 0, code: 'PAIE_READ', description: 'Lire la paie' };
const roles: Role[] = [
  { id: 8, version: 0, nom: 'Comptable', description: null, permissions: [permission], protege: false },
  { id: 9, version: 0, nom: 'RH', description: null, permissions: [], protege: false }
];

describe('RoleReferenceService', () => {
  let http: HttpTestingController;
  let service: RoleReferenceService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [RoleReferenceService, provideHttpClient(withXhr()), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(RoleReferenceService);
  });

  afterEach(() => http.verify());

  it('recherche une page côté serveur et conserve uniquement les rôles reçus', () => {
    let page: unknown;
    service.fetchPage(2, 30, 'comp').subscribe((result) => (page = result));

    const recherche = requete(http, 'POST', 'roles/search');
    expect(recherche.request.body).toEqual({ nom: 'comp' });
    expect(recherche.request.params.get('page')).toBe('2');
    expect(recherche.request.params.get('size')).toBe('30');
    expect(recherche.request.params.get('sort')).toBe('nom,asc');
    recherche.flush({ content: [roles[0]], page: { size: 30, number: 2, totalElements: 61, totalPages: 3 } });

    expect(page).toEqual({ items: [roles[0]], totalRecords: 61 });
    expect(service.rolesConnus().get(8)).toEqual(roles[0]);
    expect(service.rolesConnus().has(9)).toBe(false);
  });

  it('résout un rôle sélectionné hors de la page courante et réutilise le cache', () => {
    let resultat: Role | undefined;
    service.fetchById(9).subscribe((role) => (resultat = role));
    requete(http, 'GET', 'roles/9').flush(roles[1]);

    expect(resultat).toEqual(roles[1]);
    expect(service.rolesConnus().get(9)).toEqual(roles[1]);
    service.fetchById('9').subscribe((role) => (resultat = role));
    expect(resultat).toEqual(roles[1]);
    http.expectNone('roles/9');
  });
});
