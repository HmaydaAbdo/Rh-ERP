import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { motDePasseConforme, REGLE_MOT_DE_PASSE } from './mot-de-passe.validator';

describe('motDePasseConforme', () => {
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
      expect(erreur.message).toBe(REGLE_MOT_DE_PASSE);
    }
  });

  it('laisse un champ vide à la règle « obligatoire »', () => {
    expect(erreurs('')).toEqual([]);
  });
});
