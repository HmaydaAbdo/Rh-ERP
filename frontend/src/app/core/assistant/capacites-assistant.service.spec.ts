import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CapacitesAssistant, messagePiece, PIECES_JOINTES } from './capacites-assistant.service';

describe('CapacitesAssistant', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('garde les pièces jointes fermées tant que le serveur ne les active pas', async () => {
    const service = TestBed.inject(CapacitesAssistant);
    expect(service.pieces().enabled).toBe(false);

    const chargement = service.charger();
    TestBed.inject(HttpTestingController).expectOne('ia/copilotkit/capacites').flush({ piecesJointes: false });
    await chargement;
    expect(service.pieces().enabled).toBe(false);
  });

  it('ouvre images, PDF, texte et CSV de 10 Mo au plus quand le serveur les active', async () => {
    const service = TestBed.inject(CapacitesAssistant);
    const chargement = service.charger();
    TestBed.inject(HttpTestingController).expectOne('ia/copilotkit/capacites').flush({ piecesJointes: true });
    await chargement;

    expect(service.pieces()).toMatchObject({ enabled: true, accept: PIECES_JOINTES.accept, maxSize: 10 * 1024 * 1024 });
    expect(PIECES_JOINTES.accept).not.toMatch(/svg|zip|audio|video|html/);
  });

  it('une panne du serveur laisse les pièces jointes fermées', async () => {
    const service = TestBed.inject(CapacitesAssistant);
    const chargement = service.charger();
    TestBed.inject(HttpTestingController).expectOne('ia/copilotkit/capacites').flush('x', { status: 500, statusText: 'Erreur' });
    await chargement;
    expect(service.pieces().enabled).toBe(false);
  });

  it('dit en français pourquoi un fichier est refusé', () => {
    expect(messagePiece('file-too-large')).toBe('Ce fichier dépasse 10 Mo.');
    expect(messagePiece('invalid-type')).toContain('n’est pas accepté');
    expect(messagePiece('upload-failed')).toContain('n’a pas pu être ajouté');
  });
});
