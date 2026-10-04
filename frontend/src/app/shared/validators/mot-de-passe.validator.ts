import { ValidatorFn } from '@angular/forms';

/** La règle des mots de passe, énoncée aux utilisateurs. Le serveur en est l'autorité (il refuse aussi un mot de passe égal à l’identifiant). */
export const REGLE_MOT_DE_PASSE = '10 caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.';

const LONGUEUR_MIN = 10;

/** Longueur, lettre et chiffre : de quoi guider la saisie avant l'envoi. Un champ vide relève de `Validators.required`. */
export const motDePasseConforme: ValidatorFn = (control) => {
  const valeur = String(control.value ?? '');
  if (!valeur) {
    return null;
  }
  const conforme = valeur.length >= LONGUEUR_MIN && /\p{L}/u.test(valeur) && /\p{Nd}/u.test(valeur);
  return conforme ? null : { motDePasse: true };
};
