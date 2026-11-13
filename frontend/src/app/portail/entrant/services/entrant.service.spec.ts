import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { EntrantService } from './entrant.service';

describe('EntrantService', () => {
  let http: HttpTestingController;
  let service: EntrantService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(EntrantService);
  });

  afterEach(() => http.verify());

  it('lit les entrants du mois par POST avec la période et les filtres dans le corps', () => {
    service.entrantsDuMois({ periode: '2026-10', fonctionIds: [7], types: ['RETOUR'] }).subscribe();

    const r = requete(http, 'POST', 'employees/entrants-mois');
    r.flush({ periode: '2026-10', comparable: true, nombre: 0, nouvellesEmbauches: 0, retours: 0, entrants: [] });

    expect(r.request.body).toEqual({ periode: '2026-10', fonctionIds: [7], types: ['RETOUR'] });
  });

  it('télécharge le PDF avec le même corps que la liste', () => {
    service.exporterPdf({ periode: '2026-10', cin: 'ab' }).subscribe();

    const r = requete(http, 'POST', 'employees/entrants-mois/pdf');
    r.flush(new Blob(['%PDF']));

    expect(r.request.body).toEqual({ periode: '2026-10', cin: 'ab' });
    expect(r.request.responseType).toBe('blob');
  });
});
