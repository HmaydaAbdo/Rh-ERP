import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { PolitiqueMotDePasseService } from './politique-mot-de-passe.service';
import { motDePasseConforme } from './mot-de-passe.validator';

describe('motDePasseConforme', () => {
  const longueur = signal<number | null>(10);
  const politique = {
    longueurMinimale: longueur.asReadonly(),
    regle: computed(() => longueur() === null
      ? 'La longueur minimale dépend du paramètre administrateur ; le mot de passe doit différer de l’identifiant.'
      : `${longueur()} caractères minimum, différent de l’identifiant.`)
  };

  beforeEach(() => {
    longueur.set(10);
    TestBed.configureTestingModule({ providers: [{ provide: PolitiqueMotDePasseService, useValue: politique }] });
  });

  const erreurs = (valeur: string) => {
    const formulaire = TestBed.runInInjectionContext(() => form(signal({ motDePasse: valeur }), (chemin) => motDePasseConforme(chemin.motDePasse)));
    return formulaire.motDePasse().errors();
  };

  it('accepte toute valeur de 10 caractères ou plus sans règle de composition', () => {
    expect(erreurs('abcdefghi1')).toEqual([]);
    expect(erreurs('Mot de passe 2026 !')).toEqual([]);
    expect(erreurs('1234567890')).toEqual([]);
    expect(erreurs('!!!!!!!!!!')).toEqual([]);
  });

  it('refuse un mot de passe trop court en énonçant la règle', () => {
    for (const valeur of ['abcdefgh1']) {
      const [erreur] = erreurs(valeur);
      expect(erreur.kind).toBe('motDePasse');
      expect(erreur.message).toBe('10 caractères minimum, différent de l’identifiant.');
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
