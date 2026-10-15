import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../testing/http';
import { PolitiqueMotDePasseService } from './politique-mot-de-passe.service';

describe('PolitiqueMotDePasseService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    http = preparerHttp();
  });

  afterEach(() => http.verify());

  it('charge la règle de mot de passe publique depuis le serveur', () => {
    const service = TestBed.inject(PolitiqueMotDePasseService);

    expect(service.longueurMinimale()).toBeNull();
    expect(service.regle()).toBe('La longueur minimale dépend du paramètre administrateur ; le mot de passe doit différer de l’identifiant.');

    requete(http, 'GET', 'auth/password-policy').flush({ longueurMinimale: 14 });

    expect(service.longueurMinimale()).toBe(14);
    expect(service.regle()).toBe('14 caractères minimum, différent de l’identifiant.');
  });
});
