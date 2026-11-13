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

  it('lit les sorties du mois par POST avec la période aaaa-MM et les filtres dans le corps', () => {
    service.sortiesDuMois({ periode: '2026-10', chantierIds: [3], motifs: ['STC'] }).subscribe();

    const r = requete(http, 'POST', 'employees/sorties-mois');
    r.flush({ periode: '2026-10', nombre: 0, parMotif: {}, sorties: [] });

    expect(r.request.body).toEqual({ periode: '2026-10', chantierIds: [3], motifs: ['STC'] });
  });

  it('télécharge le PDF avec le même corps que la liste', () => {
    let recu: Blob | null = null;
    service.exporterPdf({ periode: '2026-10', nomPrenom: 'ali' }).subscribe((blob) => (recu = blob));

    const r = requete(http, 'POST', 'employees/sorties-mois/pdf');
    r.flush(new Blob(['%PDF']));

    expect(r.request.body).toEqual({ periode: '2026-10', nomPrenom: 'ali' });
    expect(r.request.responseType).toBe('blob');
    expect(recu).toBeInstanceOf(Blob);
  });
});
