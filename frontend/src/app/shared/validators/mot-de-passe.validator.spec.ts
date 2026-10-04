import { FormControl } from '@angular/forms';

import { motDePasseConforme } from './mot-de-passe.validator';

describe('motDePasseConforme', () => {
  const erreur = (valeur: string | null) => motDePasseConforme(new FormControl(valeur));

  it('accepte 10 caractères ou plus avec une lettre et un chiffre', () => {
    expect(erreur('abcdefghi1')).toBeNull();
    expect(erreur('Mot de passe 2026 !')).toBeNull();
  });

  it('refuse un mot de passe trop court, sans lettre ou sans chiffre', () => {
    expect(erreur('abcdefgh1')).toEqual({ motDePasse: true });
    expect(erreur('1234567890')).toEqual({ motDePasse: true });
    expect(erreur('abcdefghijk')).toEqual({ motDePasse: true });
  });

  it('laisse un champ vide à Validators.required', () => {
    expect(erreur('')).toBeNull();
    expect(erreur(null)).toBeNull();
  });
});
