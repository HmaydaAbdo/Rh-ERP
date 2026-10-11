import { inject } from '@angular/core';
import { SchemaPath, validate } from '@angular/forms/signals';

import { PolitiqueMotDePasseService } from './politique-mot-de-passe.service';

/**
 * Longueur (réglée par le serveur), lettre et chiffre : de quoi guider la saisie avant l'envoi. Un champ vide relève de
 * `required`. À appeler dans un contexte d'injection (le schéma d'un formulaire). Le serveur reste l'autorité : il refuse aussi
 * un mot de passe égal à l’identifiant.
 */
export function motDePasseConforme(chemin: SchemaPath<string>): void {
  const politique = inject(PolitiqueMotDePasseService);
  validate(chemin, ({ value }) => {
    const valeur = value();
    if (!valeur) {
      return undefined;
    }
    const longueurMin = politique.longueurMinimale() ?? 0;
    const conforme = valeur.length >= longueurMin && /\p{L}/u.test(valeur) && /\p{Nd}/u.test(valeur);
    return conforme ? undefined : { kind: 'motDePasse', message: politique.regle() };
  });
}
