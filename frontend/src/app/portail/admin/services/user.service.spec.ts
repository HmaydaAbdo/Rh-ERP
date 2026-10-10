import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { UserService } from './user.service';

describe('UserService', () => {
  let http: HttpTestingController;
  let service: UserService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(UserService);
  });

  afterEach(() => http.verify());

  it('liste tous les utilisateurs et lit un utilisateur', () => {
    let tous: unknown;
    service.findAll().subscribe((u) => (tous = u));
    requete(http, 'GET', 'users').flush([{ id: 1 }, { id: 2 }]);
    expect(tous).toEqual([{ id: 1 }, { id: 2 }]);

    service.findById(2).subscribe();
    requete(http, 'GET', 'users/2').flush({ id: 2 });
  });

  it('crée un utilisateur avec son mot de passe initial et ses rôles', () => {
    const dto = { username: 'rh', email: 'rh@staport.ma', motDePasse: 'Motdepasse12', employeeId: null, roleIds: [1] };

    service.create(dto).subscribe();

    const r = requete(http, 'POST', 'users');
    r.flush({ id: 3 });
    expect(r.request.body).toEqual(dto);
  });

  it('modifie un utilisateur sans pouvoir changer son identifiant', () => {
    service.update(3, { email: 'rh@staport.ma', actif: false, employeeId: 4, roleIds: [1, 2] }).subscribe();

    const r = requete(http, 'PUT', 'users/3');
    r.flush({ id: 3 });
    expect(Object.keys(r.request.body as object).sort()).toEqual(['actif', 'email', 'employeeId', 'roleIds']);
  });

  it('enregistre les permissions refusées d’un utilisateur', () => {
    service.updateDeniedPermissions(3, { permissionIds: [7, 8] }).subscribe();

    const r = requete(http, 'PUT', 'users/3/permissions-refusees');
    r.flush({ id: 3 });
    expect(r.request.body).toEqual({ permissionIds: [7, 8] });
  });

  it('réinitialise un mot de passe en tant qu’administrateur', () => {
    service.resetPassword(3, { nouveauMotDePasse: 'Autrechose1234' }).subscribe();

    const r = requete(http, 'POST', 'users/3/reset-password');
    r.flush(null);
    expect(r.request.body).toEqual({ nouveauMotDePasse: 'Autrechose1234' });
  });
});
