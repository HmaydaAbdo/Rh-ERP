import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { EquipeService } from './equipe.service';

describe('EquipeService', () => {
  let http: HttpTestingController;
  let service: EquipeService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(EquipeService);
  });

  afterEach(() => http.verify());

  it('recherche par POST avec les critères dans le corps', () => {
    service.search({ code: 'CH', libelle: 'chauf' }, { page: 0, size: 10 }).subscribe();

    const r = requete(http, 'POST', 'equipes/search');
    r.flush({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } });

    expect(r.request.body).toEqual({ code: 'CH', libelle: 'chauf' });
    expect(r.request.params.get('page')).toBe('0');
  });

  it('lit, crée, modifie et supprime une équipe', () => {
    service.getById(1).subscribe();
    requete(http, 'GET', 'equipes/1').flush({ id: 1 });

    service.create({ code: 'CH', libelle: 'Chauffeurs' }).subscribe();
    const creation = requete(http, 'POST', 'equipes');
    creation.flush({ id: 2 });
    expect(creation.request.body).toEqual({ code: 'CH', libelle: 'Chauffeurs' });

    service.update(2, { version: 0, code: 'CH', libelle: 'Chauffeurs PL' }).subscribe();
    requete(http, 'PUT', 'equipes/2').flush({ id: 2 });

    service.delete(2).subscribe();
    requete(http, 'DELETE', 'equipes/2').flush(null);
  });

  it('envoie le fichier au point d’import et télécharge le modèle', () => {
    const file = new File(['xlsx'], 'equipes.xlsx');
    service.importer(file).subscribe();
    const importRequest = requete(http, 'POST', 'equipes/import');
    expect(importRequest.request.body instanceof FormData).toBe(true);
    expect((importRequest.request.body as FormData).get('file')).toBe(file);
    importRequest.flush({ totalLignes: 1, crees: 1, ignores: 0, lignesIgnorees: [] });

    service.telechargerModele().subscribe();
    const modelRequest = requete(http, 'GET', 'equipes/import/modele');
    expect(modelRequest.request.responseType).toBe('blob');
    modelRequest.flush(new Blob(['modele']));
  });
});
