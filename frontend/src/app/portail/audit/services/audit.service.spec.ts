import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { AuditService } from './audit.service';

const PAGE_VIDE = { content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } };

describe('AuditService', () => {
  let http: HttpTestingController;
  let service: AuditService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(AuditService);
  });

  afterEach(() => http.verify());

  it('recherche dans le journal par POST, critères dans le corps, page et tri dans l’URL', () => {
    service.search({ utilisateur: 'ali', categories: ['SECURITE', 'ACCES'], actions: ['ACCES_REFUSE'], entiteTypes: ['Paie', 'Employee'] },
      { page: 1, size: 20, sort: 'horodatage,desc' }).subscribe();

    const r = requete(http, 'POST', 'logs/search');
    r.flush(PAGE_VIDE);

    expect(r.request.body).toEqual({ utilisateur: 'ali', categories: ['SECURITE', 'ACCES'], actions: ['ACCES_REFUSE'], entiteTypes: ['Paie', 'Employee'] });
    expect(r.request.params.toString()).toBe('page=1&size=20&sort=horodatage,desc');
  });

  it('lit une entrée du journal et ses modifications, par pages', () => {
    service.getById(12).subscribe();
    requete(http, 'GET', 'logs/12').flush({ id: 12 });

    service.details(12, { page: 2, size: 10 }).subscribe();
    const details = requete(http, 'GET', 'logs/12/details');
    details.flush(PAGE_VIDE);
    expect(details.request.params.toString()).toBe('page=2&size=10');
  });

  it('lit l’historique d’un enregistrement en protégeant le nom de l’entité dans l’URL', () => {
    service.historique('Paie', 7, { page: 0, size: 5 }).subscribe();

    const r = http.expectOne((req) => req.url === 'logs/historique/Paie/7');
    r.flush(PAGE_VIDE);
    expect(r.request.method).toBe('GET');

    service.historique('Entité/étrange', 1, { page: 0, size: 5 }).subscribe();
    http.expectOne((req) => req.url === 'logs/historique/Entit%C3%A9%2F%C3%A9trange/1').flush(PAGE_VIDE);
  });
});
