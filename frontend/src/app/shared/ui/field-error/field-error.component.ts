import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReadonlyFieldTree } from '@angular/forms/signals';

/**
 * Message d'erreur d'un champ, sous le champ : la première erreur de validation, affichée une fois le champ touché (ou le
 * formulaire soumis) et annoncée aux lecteurs d'écran (`role="alert"`). Le texte est celui de la règle du schéma
 * (`required(chemin, { message })`). Un `id` posé sur l'élément permet au champ de le désigner par `aria-describedby`.
 */
@Component({
  selector: 'stp-field-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as texte) {
      <small class="field-error" role="alert">{{ texte }}</small>
    }
  `,
  // Sans erreur, l'élément ne laisse pas d'écart vide dans la colonne du champ.
  styles: `
    :host(:empty) {
      display: none;
    }
  `
})
export class FieldErrorComponent {
  readonly field = input.required<ReadonlyFieldTree<unknown>>();

  protected readonly message = computed(() => {
    const etat = this.field()();
    return etat.touched() && etat.invalid() ? (etat.errors()[0]?.message ?? 'Valeur invalide.') : null;
  });
}
