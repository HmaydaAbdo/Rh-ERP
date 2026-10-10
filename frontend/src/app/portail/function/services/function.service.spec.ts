import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { FunctionService } from './function.service';

describe('FunctionService', () => {
  let http: HttpTestingController;
  let service: FunctionService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(FunctionService);
  });

  afterEach(() => http.verify());

  it('recherche par POST avec les critères dans le corps, la page et la taille dans l’URL', () => {
    const page = { content: [{ id: 1, libelle: 'MACON' }], page: { size: 10, number: 0, totalElements: 1, totalPages: 1 } };
    let recu: unknown;

    service.search({ libelle: 'mac' }, { page: 2, size: 20 }).subscribe((r) => (recu = r));
    const r = requete(http, 'POST', 'functions/search');
    r.flush(page);

    expect(r.request.body).toEqual({ libelle: 'mac' });
    expect(r.request.params.get('page')).toBe('2');
    expect(r.request.params.get('size')).toBe('20');
    expect(r.request.params.has('sort')).toBe(false);
    expect(recu).toEqual(page);
  });

  it('transmet le tri quand il est demandé', () => {
    service.search({}, { page: 0, size: 10, sort: 'libelle,desc' }).subscribe();

    const r = requete(http, 'POST', 'functions/search');
    r.flush({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } });

    expect(r.request.params.get('sort')).toBe('libelle,desc');
  });

  it('lit, crée, modifie et supprime une fonction', () => {
    service.getById(4).subscribe();
    requete(http, 'GET', 'functions/4').flush({ id: 4, libelle: 'MACON' });

    service.create({ libelle: 'PLOMBIER' }).subscribe();
    const creation = requete(http, 'POST', 'functions');
    creation.flush({ id: 5, libelle: 'PLOMBIER' });
    expect(creation.request.body).toEqual({ libelle: 'PLOMBIER' });

    service.update(5, { libelle: 'PLOMBIER SENIOR' }).subscribe();
    const modification = requete(http, 'PUT', 'functions/5');
    modification.flush({ id: 5, libelle: 'PLOMBIER SENIOR' });
    expect(modification.request.body).toEqual({ libelle: 'PLOMBIER SENIOR' });

    service.delete(5).subscribe();
    requete(http, 'DELETE', 'functions/5').flush(null);
  });

  it('importe un fichier Excel en multipart, sous le nom de champ « file »', () => {
    const fichier = new File(['x'], 'fonctions.xlsx');

    service.importer(fichier).subscribe();

    const r = requete(http, 'POST', 'functions/import');
    r.flush({ totalLignes: 1, crees: 1, lignesIgnorees: [] });
    expect(r.request.body).toBeInstanceOf(FormData);
    expect((r.request.body as FormData).get('file')).toBe(fichier);
  });

  it('télécharge le modèle d’import en binaire', () => {
    let blob: Blob | undefined;

    service.telechargerModele().subscribe((b) => (blob = b));

    const r = requete(http, 'GET', 'functions/import/modele');
    expect(r.request.responseType).toBe('blob');
    r.flush(new Blob(['xlsx']));
    expect(blob).toBeInstanceOf(Blob);
  });
});
