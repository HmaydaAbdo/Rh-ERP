import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { SortieService } from './sortie.service';

describe('SortieService', () => {
  let http: HttpTestingController;
  let service: SortieService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(SortieService);
  });

  afterEach(() => http.verify());

  it('lit les sorties du mois par POST avec la période aaaa-MM dans le corps', () => {
    service.sortiesDuMois('2026-10').subscribe();

    const r = requete(http, 'POST', 'employees/sorties-mois');
    r.flush({ periode: '2026-10', nombre: 0, parMotif: {}, sorties: [] });

    expect(r.request.body).toEqual({ periode: '2026-10' });
  });
});
