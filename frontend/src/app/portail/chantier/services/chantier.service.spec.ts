import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { ChantierService } from './chantier.service';

describe('ChantierService', () => {
  let http: HttpTestingController;
  let service: ChantierService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(ChantierService);
  });

  afterEach(() => http.verify());

  it('recherche par POST, le statut actif/inactif faisant partie des critères', () => {
    service.search({ code: 'C1', actif: false }, { page: 0, size: 10, sort: 'code,asc' }).subscribe();

    const r = requete(http, 'POST', 'chantiers/search');
    r.flush({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } });

    expect(r.request.body).toEqual({ code: 'C1', actif: false });
    expect(r.request.params.get('sort')).toBe('code,asc');
  });

  it('clôture ou rouvre un chantier en renvoyant tous ses autres champs', () => {
    const chantier = { id: 3, version: 4, code: 'C196', designation: 'Marrakech', nom: 'Nord', sourceErp: true, actif: true };

    service.changerStatut(chantier, false).subscribe();

    const r = requete(http, 'PUT', 'chantiers/3');
    r.flush({ id: 3 });
    expect(r.request.body).toEqual({ code: 'C196', designation: 'Marrakech', nom: 'Nord', actif: false, version: 4 });
  });

  it('lit, crée, modifie et supprime un chantier', () => {
    service.getById(2).subscribe();
    requete(http, 'GET', 'chantiers/2').flush({ id: 2 });

    service.create({ code: 'C196', designation: 'Marrakech', nom: null }).subscribe();
    const creation = requete(http, 'POST', 'chantiers');
    creation.flush({ id: 3 });
    expect(creation.request.body).toEqual({ code: 'C196', designation: 'Marrakech', nom: null });

    service.update(3, { version: 0, code: 'C196', designation: 'Marrakech', nom: 'Nord', actif: false }).subscribe();
    const modification = requete(http, 'PUT', 'chantiers/3');
    modification.flush({ id: 3 });
    expect(modification.request.body).toMatchObject({ actif: false });

    service.delete(3).subscribe();
    requete(http, 'DELETE', 'chantiers/3').flush(null);
  });

  it('synchronise les chantiers depuis l’ERP externe par un POST sans corps utile', () => {
    let resultat: unknown;

    service.synchroniser().subscribe((r) => (resultat = r));

    const r = requete(http, 'POST', 'chantiers/sync');
    r.flush({ totalRecus: 12, crees: 3, dejaPresents: 9, ignores: 0 });
    expect(r.request.body).toEqual({});
    expect(resultat).toEqual({ totalRecus: 12, crees: 3, dejaPresents: 9, ignores: 0 });
  });
});
