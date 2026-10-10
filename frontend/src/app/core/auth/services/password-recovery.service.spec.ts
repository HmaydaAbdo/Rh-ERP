import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { preparerHttp, requete } from '../../../shared/testing/http';
import { PasswordRecoveryService } from './password-recovery.service';

describe('PasswordRecoveryService', () => {
  let http: HttpTestingController;
  let service: PasswordRecoveryService;

  beforeEach(() => {
    http = preparerHttp();
    service = TestBed.inject(PasswordRecoveryService);
  });

  afterEach(() => http.verify());

  it('demande un lien de réinitialisation pour une adresse', () => {
    service.requestReset('employe@example.com').subscribe();

    const r = requete(http, 'POST', 'auth/forgot-password');
    r.flush(null);
    expect(r.request.body).toEqual({ email: 'employe@example.com' });
  });

  it('applique un nouveau mot de passe avec le jeton du lien', () => {
    service.resetPassword('jeton-lien', 'NouveauMdp2026').subscribe();

    const r = requete(http, 'POST', 'auth/reset-password');
    r.flush(null);
    expect(r.request.body).toEqual({ token: 'jeton-lien', nouveauMotDePasse: 'NouveauMdp2026' });
  });
});
