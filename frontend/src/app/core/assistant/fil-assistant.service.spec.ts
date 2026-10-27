import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../auth/services/auth.service';
import { FilAssistant } from './fil-assistant.service';

describe('FilAssistant', () => {
  const utilisateur = signal<{ id: number } | null>({ id: 7 });

  function service(): FilAssistant {
    TestBed.configureTestingModule({ providers: [FilAssistant, { provide: AuthService, useValue: { user: utilisateur } }] });
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
    localStorage.setItem('erp-rh.assistant.fil.8', 'u7-vole');
    utilisateur.set({ id: 8 });
    expect(service().fil()).toMatch(/^u8-/);
  });

  it('n’a pas de fil sans utilisateur connecté', () => {
    utilisateur.set(null);
    expect(service().fil()).toBeUndefined();
  });
});
