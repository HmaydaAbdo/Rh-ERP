import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { Accueil, AccueilService } from './accueil.service';

const ACCUEIL: Accueil = { version: null, personnalise: false, indicateurs: ['paie.masse'], disponibles: [{ code: 'paie.masse', libelle: 'Masse salariale', description: 'd' }] };

describe('AccueilService', () => {
  let http: HttpTestingController;
  let service: AccueilService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(AccueilService);
  });

  afterEach(() => http.verify());

  it('lit, enregistre et rétablit son propre accueil', () => {
    service.lire().subscribe();
    requete(http, 'GET', 'accueil').flush(ACCUEIL);

    service.enregistrer({ version: null, indicateurs: ['paie.masse'] }).subscribe();
    const ecriture = requete(http, 'PUT', 'accueil');
    expect(ecriture.request.body).toEqual({ version: null, indicateurs: ['paie.masse'] });
    ecriture.flush(ACCUEIL);

    service.reinitialiser().subscribe();
    requete(http, 'DELETE', 'accueil').flush(ACCUEIL);
  });

  it('règle l’accueil d’un autre utilisateur par les routes d’administration', () => {
    service.lireDe(7).subscribe();
    requete(http, 'GET', 'accueil/utilisateurs/7').flush(ACCUEIL);

    service.enregistrerDe(7, { version: 2, indicateurs: [] }).subscribe();
    requete(http, 'PUT', 'accueil/utilisateurs/7').flush(ACCUEIL);

    service.reinitialiserDe(7).subscribe();
    requete(http, 'DELETE', 'accueil/utilisateurs/7').flush(ACCUEIL);
  });
});
