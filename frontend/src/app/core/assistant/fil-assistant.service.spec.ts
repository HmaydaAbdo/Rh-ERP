import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../auth/services/auth.service';
import { FilAssistant } from './fil-assistant.service';

describe('FilAssistant', () => {
  const utilisateur = signal<{ id: number } | null>({ id: 7 });

  function service(): FilAssistant {
    TestBed.configureTestingModule({ providers: [FilAssistant, provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { user: utilisateur } }] });
    return TestBed.inject(FilAssistant);
  }

  beforeEach(() => {
    localStorage.clear();
    utilisateur.set({ id: 7 });
  });

  it('donne un fil propre à l’utilisateur et le reprend après un rechargement', () => {
    const premier = service().fil();
    expect(premier).toMatch(/^u7-/);

    TestBed.resetTestingModule();
    expect(service().fil()).toBe(premier);
  });

  it('commence une nouvelle conversation sur demande', () => {
    const fil = service();
    const avant = fil.fil();
    fil.nouveau();
    expect(fil.fil()).not.toBe(avant);
    expect(fil.fil()).toMatch(/^u7-/);
  });

  it('ne reprend jamais le fil d’un autre utilisateur', () => {
    localStorage.setItem('staport.assistant.fil.8', 'u7-vole');
    utilisateur.set({ id: 8 });
    expect(service().fil()).toMatch(/^u8-/);
  });

  it('n’a pas de fil sans utilisateur connecté', () => {
    utilisateur.set(null);
    expect(service().fil()).toBeUndefined();
  });

  it('distingue un fil neuf d’un fil déjà commencé, y compris après un rechargement', () => {
    const premier = service();
    expect(premier.estUtilise()).toBe(false);
    premier.marquerUtilise();
    expect(premier.estUtilise()).toBe(true);

    TestBed.resetTestingModule();
    const rechargement = service();
    expect(rechargement.estUtilise()).toBe(true);

    rechargement.nouveau();
    expect(rechargement.estUtilise()).toBe(false);
  });

  describe('liste des conversations', () => {
    const URL = 'ia/copilotkit/conversations';
    const conversation = (id: string) => ({ id, title: 'Titre', createdAt: 1, updatedAt: 2 });

    it('charge la liste du runtime', async () => {
      const fil = service();
      const http = TestBed.inject(HttpTestingController);
      const chargement = fil.rafraichir();
      http.expectOne(URL).flush([conversation('u7-a')]);
      await chargement;
      expect(fil.conversations().map((c) => c.id)).toEqual(['u7-a']);
    });

    it('reprend une conversation : fil courant, déclarée commencée (historique rejoué), liste refermée', () => {
      const fil = service();
      fil.listeOuverte.set(true);
      fil.ouvrir('u7-ancienne');
      expect(fil.fil()).toBe('u7-ancienne');
      expect(fil.estUtilise()).toBe(true);
      expect(fil.listeOuverte()).toBe(false);

      TestBed.resetTestingModule();
      expect(service().fil()).toBe('u7-ancienne');
    });

    it('refuse de reprendre la conversation d’un autre utilisateur', () => {
      const fil = service();
      const avant = fil.fil();
      fil.ouvrir('u8-autre');
      expect(fil.fil()).toBe(avant);
    });

    it('renomme puis recharge la liste', async () => {
      const fil = service();
      const http = TestBed.inject(HttpTestingController);
      const action = fil.renommer('u7-a', 'Paie');
      const requete = http.expectOne(`${URL}/u7-a`);
      expect(requete.request.method).toBe('PATCH');
      expect(requete.request.body).toEqual({ title: 'Paie' });
      requete.flush(null);
      await Promise.resolve();
      http.expectOne(URL).flush([]);
      await action;
    });

    it('supprime ; la conversation courante est remplacée par une neuve', async () => {
      const fil = service();
      const http = TestBed.inject(HttpTestingController);
      const courante = fil.fil() as string;
      const action = fil.supprimer(courante);
      const requete = http.expectOne(`${URL}/${courante}`);
      expect(requete.request.method).toBe('DELETE');
      requete.flush(null);
      await Promise.resolve();
      http.expectOne(URL).flush([]);
      await action;
      expect(fil.fil()).not.toBe(courante);
      expect(fil.fil()).toMatch(/^u7-/);
    });

    it('supprimer une autre conversation garde la courante', async () => {
      const fil = service();
      const http = TestBed.inject(HttpTestingController);
      const courante = fil.fil();
      const action = fil.supprimer('u7-autre');
      http.expectOne(`${URL}/u7-autre`).flush(null);
      await Promise.resolve();
      http.expectOne(URL).flush([]);
      await action;
      expect(fil.fil()).toBe(courante);
    });
  });
});
