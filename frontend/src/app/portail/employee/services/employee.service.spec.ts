import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { EmployeeService } from './employee.service';

describe('EmployeeService', () => {
  let http: HttpTestingController;
  let service: EmployeeService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(EmployeeService);
  });

  afterEach(() => http.verify());

  it('recherche par POST avec les critères multiples dans le corps et le tri dans l’URL', () => {
    service.search({ nomPrenom: 'ali', fonctionIds: [1, 2], chantierIds: [3] }, { page: 1, size: 50, sort: 'nomPrenom,asc' }).subscribe();

    const r = requete(http, 'POST', 'employees/search');
    r.flush({ content: [], page: { size: 50, number: 1, totalElements: 0, totalPages: 0 } });

    expect(r.request.body).toEqual({ nomPrenom: 'ali', fonctionIds: [1, 2], chantierIds: [3] });
    expect(r.request.params.toString()).toBe('page=1&size=50&sort=nomPrenom,asc');
  });

  it('lit, crée, modifie et supprime un employé', () => {
    service.getById(9).subscribe();
    requete(http, 'GET', 'employees/9').flush({ id: 9 });

    const dto = { nomPrenom: 'Ali Alaoui', cin: 'AB1', dateNaissance: '1990-01-01', dateEmbauche: '2020-02-02', fonctionId: 1, chantierId: 2 };
    service.create(dto).subscribe();
    const creation = requete(http, 'POST', 'employees');
    creation.flush({ id: 10 });
    expect(creation.request.body).toEqual(dto);

    service.update(10, { ...dto, version: 0, statut: 'INACTIF' }).subscribe();
    const modification = requete(http, 'PUT', 'employees/10');
    modification.flush({ id: 10 });
    expect(modification.request.body).toMatchObject({ statut: 'INACTIF' });

    service.delete(10).subscribe();
    requete(http, 'DELETE', 'employees/10').flush(null);
  });

  it('importe un fichier Excel en multipart', () => {
    const fichier = new File(['x'], 'employes.xlsx');

    service.importer(fichier).subscribe();

    const r = requete(http, 'POST', 'employees/import');
    r.flush({ totalLignes: 1, crees: 1, lignesIgnorees: [] });
    expect((r.request.body as FormData).get('file')).toBe(fichier);
  });

  it('télécharge le modèle d’import en binaire', () => {
    service.telechargerModele().subscribe();

    const r = requete(http, 'GET', 'employees/import/modele');
    expect(r.request.responseType).toBe('blob');
    r.flush(new Blob());
  });
});
