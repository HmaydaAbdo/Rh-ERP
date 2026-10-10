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

  it('liste les rôles et lit un rôle', () => {
    let roles: unknown;
    service.findAll().subscribe((r) => (roles = r));
    requete(http, 'GET', 'roles').flush([{ id: 1, nom: 'SYSTEM_ADMIN' }]);
    expect(roles).toEqual([{ id: 1, nom: 'SYSTEM_ADMIN' }]);

    service.findById(1).subscribe();
    requete(http, 'GET', 'roles/1').flush({ id: 1 });
  });

  it('crée, modifie et supprime un rôle avec ses permissions', () => {
    service.create({ nom: 'RH', description: null, permissionIds: [1, 2] }).subscribe();
    const creation = requete(http, 'POST', 'roles');
    creation.flush({ id: 5 });
    expect(creation.request.body).toEqual({ nom: 'RH', description: null, permissionIds: [1, 2] });

    service.update(5, { nom: 'RH', description: 'Ressources humaines', permissionIds: [1] }).subscribe();
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
