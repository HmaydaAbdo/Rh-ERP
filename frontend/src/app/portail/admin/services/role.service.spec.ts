import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { RoleService } from './role.service';

describe('RoleService', () => {
  let http: HttpTestingController;
  let service: RoleService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(RoleService);
  });

  afterEach(() => http.verify());

  it('recherche les rôles côté serveur avec filtres et pagination, puis lit un rôle', () => {
    let page: unknown;
    service.search({ nom: 'SYSTEM', description: 'admin' }, { page: 1, size: 25, sort: 'nom,desc' }).subscribe((resultat) => (page = resultat));
    const recherche = requete(http, 'POST', 'roles/search');
    expect(recherche.request.body).toEqual({ nom: 'SYSTEM', description: 'admin' });
    expect(recherche.request.params.get('page')).toBe('1');
    expect(recherche.request.params.get('size')).toBe('25');
    expect(recherche.request.params.get('sort')).toBe('nom,desc');
    const resultat = { content: [{ id: 1, nom: 'SYSTEM_ADMIN' }], page: { size: 25, number: 1, totalElements: 26, totalPages: 2 } };
    recherche.flush(resultat);
    expect(page).toEqual(resultat);

    service.findById(1).subscribe();
    requete(http, 'GET', 'roles/1').flush({ id: 1 });
  });

  it('crée, modifie et supprime un rôle avec ses permissions', () => {
    service.create({ nom: 'RH', description: null, permissionIds: [1, 2] }).subscribe();
    const creation = requete(http, 'POST', 'roles');
    creation.flush({ id: 5 });
    expect(creation.request.body).toEqual({ nom: 'RH', description: null, permissionIds: [1, 2] });

    service.update(5, { version: 0, nom: 'RH', description: 'Ressources humaines', permissionIds: [1] }).subscribe();
    const modification = requete(http, 'PUT', 'roles/5');
    modification.flush({ id: 5 });
    expect(modification.request.body).toMatchObject({ permissionIds: [1] });

    service.delete(5).subscribe();
    requete(http, 'DELETE', 'roles/5').flush(null);
  });

  it('liste les permissions de l’application', () => {
    let permissions: unknown;

    service.findAllPermissions().subscribe((p) => (permissions = p));

    requete(http, 'GET', 'permissions').flush([{ id: 1, code: 'PAIE_READ', description: 'Lire la paie' }]);
    expect(permissions).toEqual([{ id: 1, code: 'PAIE_READ', description: 'Lire la paie' }]);
  });
});
