import { SchemaPath, validate } from '@angular/forms/signals';

/** La règle des mots de passe, énoncée aux utilisateurs. Le serveur en est l'autorité (il refuse aussi un mot de passe égal à l’identifiant). */
export const REGLE_MOT_DE_PASSE = '10 caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.';

const LONGUEUR_MIN = 10;

/** Longueur, lettre et chiffre : de quoi guider la saisie avant l'envoi. Un champ vide relève de `required`. */
export function motDePasseConforme(chemin: SchemaPath<string>): void {
  validate(chemin, ({ value }) => {
    const valeur = value();
    if (!valeur) {
      return undefined;
    }
    const conforme = valeur.length >= LONGUEUR_MIN && /\p{L}/u.test(valeur) && /\p{Nd}/u.test(valeur);
    return conforme ? undefined : { kind: 'motDePasse', message: REGLE_MOT_DE_PASSE };
  });
}
