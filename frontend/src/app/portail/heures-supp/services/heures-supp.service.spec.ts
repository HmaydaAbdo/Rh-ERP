import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { HeuresSuppService } from './heures-supp.service';

describe('HeuresSuppService', () => {
  let service: HeuresSuppService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(HeuresSuppService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('recherche avec pagination et critères du domaine', () => {
    service.search({ periode: '2026-10', chantierIds: [4], equipeIds: [0], fonctionIds: [8] }, 1, 15).subscribe();
    const request = http.expectOne((req) => req.url === 'heures-supp/search');
    expect(request.request.method).toBe('POST');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('size')).toBe('15');
    expect(request.request.body).toEqual({ periode: '2026-10', chantierIds: [4], equipeIds: [0], fonctionIds: [8] });
    request.flush({ content: [], page: { totalElements: 0 } });
  });

  it('charge les périodes et les agrégats analytiques', () => {
    service.periodes().subscribe();
    http.expectOne('heures-supp/periodes').flush(['2026-10']);
    service.analyser({ periode: '2026-10', chantierIds: [4] }).subscribe();
    const request = http.expectOne('heures-supp/analytique');
    expect(request.request.body).toEqual({ periode: '2026-10', chantierIds: [4] });
    request.flush({ periode: '2026-10' });
  });

  it('transmet le fichier, le périmètre et les forfaits au wizard', () => {
    const file = new File(['xlsx'], 'heures.xlsx');
    const forfaits = [{ cin: 'AB123', montantDh: 500 }];
    service.verifierPrerequis('2026-10', 4).subscribe();
    const prerequis = http.expectOne((req) => req.url.endsWith('/import/prerequis'));
    expect(prerequis.request.params.get('chantierId')).toBe('4');
    prerequis.flush({ pret: true });

    service.analyserImport(file, '2026-10', 4, forfaits).subscribe();
    const analyse = http.expectOne((req) => req.url.endsWith('/import/analyse'));
    expect(analyse.request.method).toBe('POST');
    expect(analyse.request.params.get('periode')).toBe('2026-10');
    expect(analyse.request.body.get('file')).toBe(file);
    expect(analyse.request.body.get('forfaits')).toBeInstanceOf(Blob);
    analyse.flush({ pret: true });
  });

  it('télécharge le modèle Excel attendu par le wizard', () => {
    service.telechargerModele().subscribe();
    const request = http.expectOne('heures-supp/import/modele');
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['modele']));
  });

  it('envoie les corrections explicites et distingue import et remplacement', () => {
    const file = new File(['xlsx'], 'heures.xlsx');
    service.corrigerImport(file, '2026-10', 4, { aligner: [{ employeId: 7 }], creer: [] }).subscribe();
    const corrections = http.expectOne((req) => req.url.endsWith('/import/corrections'));
    expect(corrections.request.body.get('corrections')).toBeInstanceOf(Blob);
    corrections.flush({ pret: true });

    service.importer(file, '2026-10', 4).subscribe();
    http.expectOne((req) => req.url === 'heures-supp/import').flush({ lignesHeures: 1 });
    service.remplacer(file, '2026-10', 4).subscribe();
    http.expectOne((req) => req.url.endsWith('/import/remplacement')).flush({ remplacements: 1 });
  });
});
