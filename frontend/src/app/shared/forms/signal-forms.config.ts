import { provideSignalFormsConfig } from '@angular/forms/signals';

/**
 * Réglage des Signal Forms de l'application : les styles de champ invalide / touché (`styles/_forms.scss`, `ui/select`) s'accrochent
 * aux classes `ng-invalid` et `ng-touched`, posées par Signal Forms sur chaque champ lié (`[formField]`).
 */
export function fournirSignalForms() {
  return provideSignalFormsConfig({
    classes: {
      'ng-invalid': (champ) => champ.state().invalid(),
      'ng-touched': (champ) => champ.state().touched()
    }
  });
}
