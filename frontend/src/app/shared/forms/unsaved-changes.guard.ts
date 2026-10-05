import { inject } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { Observable } from 'rxjs';

/** Un écran de formulaire que le guard sait protéger : il expose son `FormGroup`. */
export interface FormulaireProtege {
  readonly form: FormGroup;
}

/**
 * Quitter un formulaire modifié demande confirmation : sans elle, un clic sur un lien du menu ou « Annuler » perd en silence
 * la saisie (un bulletin de paie compte une dizaine de champs). Un formulaire enregistré est remis à l'état « intact »
 * (`markAsPristine`) avant de naviguer : aucune question n'est posée après un enregistrement réussi.
 */
export const unsavedChangesGuard: CanDeactivateFn<FormulaireProtege> = (composant) => {
  if (!composant.form.dirty) {
    return true;
  }
  const confirmation = inject(ConfirmationService);
  return new Observable<boolean>((abonne) => {
    const repondre = (reponse: boolean): void => {
      abonne.next(reponse);
      abonne.complete();
    };
    confirmation.confirm({
      key: 'sortie',
      header: 'Quitter sans enregistrer ?',
      message: 'Les modifications de ce formulaire seront perdues.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Quitter',
      rejectLabel: 'Rester',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => repondre(true),
      reject: () => repondre(false)
    });
  });
};
