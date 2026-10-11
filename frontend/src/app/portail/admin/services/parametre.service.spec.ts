import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { ParametreService } from './parametre.service';

describe('ParametreService', () => {
  let http: HttpTestingController;
  let service: ParametreService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(ParametreService);
  });

  afterEach(() => http.verify());

  it('liste les paramètres et modifie une valeur', () => {
    let parametres: unknown;
    service.findAll().subscribe((resultat) => (parametres = resultat));
    const lecture = requete(http, 'GET', 'parametres');
    lecture.flush([{ id: 1, cle: 'securite.jeton-acces.minutes', valeur: '15' }]);
    expect(parametres).toEqual([{ id: 1, cle: 'securite.jeton-acces.minutes', valeur: '15' }]);

    const valeur = { valeur: '20' };
    service.update(1, valeur).subscribe();
    const modification = requete(http, 'PUT', 'parametres/1');
    expect(modification.request.body).toEqual(valeur);
    modification.flush({ id: 1, cle: 'securite.jeton-acces.minutes', valeur: '20' });
  });
});
