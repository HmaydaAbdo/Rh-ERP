import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { surChangementDesFiltres } from './filtres';

describe('surChangementDesFiltres', () => {
  function brancher(initial = { libelle: '', ids: [] as number[] }) {
    const filtres = signal(initial);
    const action = vi.fn();
    TestBed.runInInjectionContext(() => surChangementDesFiltres(filtres, action));
    TestBed.tick();
    return { filtres, action };
  }

  it('ne relance pas la recherche pour les filtres initiaux (le tableau charge lui-même sa première page)', () => {
    const { action } = brancher();

    expect(action).not.toHaveBeenCalled();
  });

  it('relance la recherche quand un filtre change', () => {
    const { filtres, action } = brancher();

    filtres.update((f) => ({ ...f, libelle: 'mac' }));
    TestBed.tick();

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('ne relance pas une recherche pour des filtres de même contenu (nouvel objet, mêmes valeurs)', () => {
    const { filtres, action } = brancher({ libelle: 'mac', ids: [1, 2] });

    filtres.set({ libelle: 'mac', ids: [1, 2] });
    TestBed.tick();

    expect(action).not.toHaveBeenCalled();
  });

  it('relance la recherche quand le contenu d’un tableau de filtres change', () => {
    const { filtres, action } = brancher({ libelle: '', ids: [1] });

    filtres.update((f) => ({ ...f, ids: [1, 2] }));
    TestBed.tick();

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('regroupe plusieurs changements successifs en une seule recherche', () => {
    const { filtres, action } = brancher();

    filtres.update((f) => ({ ...f, libelle: 'a' }));
    filtres.update((f) => ({ ...f, libelle: 'ab' }));
    TestBed.tick();

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('s’arrête avec le composant', () => {
    const { filtres, action } = brancher();
    TestBed.resetTestingModule();

    filtres.update((f) => ({ ...f, libelle: 'x' }));

    expect(action).not.toHaveBeenCalled();
  });
});
