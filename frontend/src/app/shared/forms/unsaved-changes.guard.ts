import { inject } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';
import { CanDeactivateFn } from '@angular/router';
import { Observable } from 'rxjs';

import { ConfirmDialogService } from '@shared/feedback/feedback.service';

/** Un écran de formulaire que le guard sait protéger : il expose son formulaire (Signal Forms). */
export interface FormulaireProtege {
  readonly form: FieldTree<unknown>;
}

/**
 * Quitter un formulaire modifié demande confirmation : sans elle, un clic sur un lien du menu ou « Annuler » perd en silence
 * la saisie (un bulletin de paie compte une dizaine de champs). Un formulaire enregistré est remis à l'état « intact »
 * (`reset()`) avant de naviguer : aucune question n'est posée après un enregistrement réussi.
 */
export const unsavedChangesGuard: CanDeactivateFn<FormulaireProtege> = (composant) => {
  if (!composant.form().dirty()) {
    return true;
  }
  const confirmation = inject(ConfirmDialogService);
  return new Observable<boolean>((abonne) => {
    const repondre = (reponse: boolean): void => {
      abonne.next(reponse);
      abonne.complete();
    };
    confirmation.confirm({
      header: 'Quitter sans enregistrer ?',
      message: 'Les modifications de ce formulaire seront perdues.',
      acceptLabel: 'Quitter',
      rejectLabel: 'Rester',
      accept: () => repondre(true),
      reject: () => repondre(false)
    });
  });
};
