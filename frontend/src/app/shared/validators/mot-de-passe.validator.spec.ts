import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { PolitiqueMotDePasseService } from './politique-mot-de-passe.service';
import { motDePasseConforme } from './mot-de-passe.validator';

describe('motDePasseConforme', () => {
  const longueur = signal<number | null>(10);
  const politique = {
    longueurMinimale: longueur.asReadonly(),
    regle: computed(() => `${longueur() ?? 'Au moins'} caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.`)
  };

  beforeEach(() => {
    longueur.set(10);
    TestBed.configureTestingModule({ providers: [{ provide: PolitiqueMotDePasseService, useValue: politique }] });
  });

  const erreurs = (valeur: string) => {
    const formulaire = TestBed.runInInjectionContext(() => form(signal({ motDePasse: valeur }), (chemin) => motDePasseConforme(chemin.motDePasse)));
    return formulaire.motDePasse().errors();
  };

  it('accepte 10 caractères ou plus avec une lettre et un chiffre', () => {
    expect(erreurs('abcdefghi1')).toEqual([]);
    expect(erreurs('Mot de passe 2026 !')).toEqual([]);
  });

  it('refuse un mot de passe trop court, sans lettre ou sans chiffre, en énonçant la règle', () => {
    for (const valeur of ['abcdefgh1', '1234567890', 'abcdefghijk']) {
      const [erreur] = erreurs(valeur);
      expect(erreur.kind).toBe('motDePasse');
      expect(erreur.message).toBe('10 caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.');
    }
  });

  it('applique la longueur minimale configurée par le serveur', () => {
    longueur.set(14);

    const [erreur] = erreurs('abcdefghijk1');

    expect(erreur.kind).toBe('motDePasse');
    expect(erreur.message).toContain('14 caractères minimum');
  });

  it('laisse un champ vide à la règle « obligatoire »', () => {
    expect(erreurs('')).toEqual([]);
  });
});
