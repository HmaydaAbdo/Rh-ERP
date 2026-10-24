import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../testing/http';
import { ChantierReferenceService } from './chantier-reference.service';
import { EmployeeReferenceService } from './employee-reference.service';
import { EquipeReferenceService } from './equipe-reference.service';
import { FunctionReferenceService } from './function-reference.service';

const page = <T>(content: T[], total = content.length) => ({ content, page: { size: 30, number: 0, totalElements: total, totalPages: 1 } });

describe('sources des sélecteurs (référentiels)', () => {
  let http: HttpTestingController;

  beforeEach(() => (http = preparerHttp()));

  afterEach(() => http.verify());

  describe('FunctionReferenceService', () => {
    it('cherche les fonctions par libellé, triées par libellé, et rend page et total pour le sélecteur', () => {
      let rendu: unknown;

      TestBed.inject(FunctionReferenceService)
        .fetchPage(1, 30, 'mac')
        .subscribe((r) => (rendu = r));

      const r = requete(http, 'POST', 'functions/search');
      r.flush(page([{ id: 1, libelle: 'MACON' }], 61));
      expect(r.request.body).toEqual({ libelle: 'mac' });
      expect(r.request.params.toString()).toBe('page=1&size=30&sort=libelle,asc');
      expect(rendu).toEqual({ items: [{ id: 1, libelle: 'MACON' }], totalRecords: 61 });
    });

    it('n’envoie pas de critère de libellé pour une recherche vide, et résout un identifiant', () => {
      const service = TestBed.inject(FunctionReferenceService);

      service.fetchPage(0, 30, '').subscribe();
      const recherche = requete(http, 'POST', 'functions/search');
      recherche.flush(page([]));
      expect(JSON.stringify(recherche.request.body)).toBe('{}');

      service.fetchById('4').subscribe();
      requete(http, 'GET', 'functions/4').flush({ id: 4, libelle: 'MACON' });
    });
  });

  describe('ChantierReferenceService', () => {
    it('ne propose que les chantiers actifs, cherchés par code ou désignation, triés par code', () => {
      TestBed.inject(ChantierReferenceService).fetchPage(0, 30, 'C19').subscribe();

      const r = requete(http, 'POST', 'chantiers/search');
      r.flush(page([]));
      expect(r.request.body).toEqual({ actif: true, recherche: 'C19' });
      expect(r.request.params.get('sort')).toBe('code,asc');
    });

    it('résout un identifiant', () => {
      TestBed.inject(ChantierReferenceService).fetchById(3).subscribe();

      requete(http, 'GET', 'chantiers/3').flush({ id: 3, code: 'C196' });
    });
  });

  describe('EquipeReferenceService', () => {
    it('cherche une équipe par code ou libellé, triée et présentée par libellé', () => {
      TestBed.inject(EquipeReferenceService).fetchPage(2, 30, 'chauf').subscribe();

      const r = requete(http, 'POST', 'equipes/search');
      r.flush(page([]));
      expect(r.request.body).toEqual({ recherche: 'chauf' });
      expect(r.request.params.toString()).toBe('page=2&size=30&sort=libelle,asc');
    });

    it('résout un identifiant', () => {
      TestBed.inject(EquipeReferenceService).fetchById(2).subscribe();

      requete(http, 'GET', 'equipes/2').flush({ id: 2, code: 'CH', libelle: 'Chauffeurs' });
    });

    it('ajoute l’option Orphelins au premier chargement et permet de la rechercher sans créer de requête par identifiant', () => {
      let options: { id: number; libelle: string }[] = [];
      let total = 0;
      TestBed.inject(EquipeReferenceService).fetchPage(0, 30, '').subscribe((pageResult) => {
        options = pageResult.items;
        total = pageResult.totalRecords;
      });
      requete(http, 'POST', 'equipes/search').flush(page([{ id: 5, code: 'OP', libelle: 'Opérateurs' }], 1));
      expect(options).toEqual([
        { id: 5, code: 'OP', libelle: 'Opérateurs' },
        { id: 0, code: '', libelle: 'Orphelins (sans équipe)' }
      ]);
      expect(total).toBe(2);

      TestBed.inject(EquipeReferenceService).fetchPage(0, 30, 'sans equipe').subscribe((result) => {
        expect(result.items.at(-1)).toEqual({ id: 0, code: '', libelle: 'Orphelins (sans équipe)' });
      });
      requete(http, 'POST', 'equipes/search').flush(page([]));
      TestBed.inject(EquipeReferenceService).fetchById(0).subscribe((equipe) => {
        expect(equipe).toEqual({ id: 0, code: '', libelle: 'Orphelins (sans équipe)' });
      });
    });
  });

  describe('EmployeeReferenceService', () => {
    it('cherche par nom, trié par nom, et ajoute le nom et le CIN au libellé pour distinguer les homonymes', () => {
      let rendu: { items: { displayLabel: string }[]; totalRecords: number } | undefined;

      TestBed.inject(EmployeeReferenceService)
        .fetchPage(0, 30, 'ali')
        .subscribe((r) => (rendu = r));

      const r = requete(http, 'POST', 'employees/search');
      r.flush(page([{ id: 1, nomPrenom: 'Ali Alaoui', cin: 'AB123' }], 1));
      expect(r.request.body).toEqual({ nomPrenom: 'ali' });
      expect(r.request.params.get('sort')).toBe('nomPrenom,asc');
      expect(rendu!.items[0].displayLabel).toBe('Ali Alaoui — AB123');
      expect(rendu!.totalRecords).toBe(1);
    });

    it('résout un identifiant avec son libellé', () => {
      let rendu: { displayLabel: string } | undefined;

      TestBed.inject(EmployeeReferenceService)
        .fetchById(1)
        .subscribe((e) => (rendu = e));

      requete(http, 'GET', 'employees/1').flush({ id: 1, nomPrenom: 'Ali Alaoui', cin: 'AB123' });
      expect(rendu!.displayLabel).toBe('Ali Alaoui — AB123');
    });
  });
});
