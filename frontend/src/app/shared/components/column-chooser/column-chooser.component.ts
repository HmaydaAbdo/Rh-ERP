import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';

import { ColumnState } from '../../table/table-columns';

/** Sélecteur des colonnes visibles d'un tableau (voir `conventions/frontend.md`, section Tableaux).
 * `[ngModel]` ci-dessous n'est pas un formulaire Template Driven : c'est le moyen de piloter le
 * `p-multiSelect` de PrimeNG depuis un composant de présentation réutilisable, comme dans
 * `LazySelectComponent`. */
@Component({
  selector: 'app-column-chooser',
  standalone: true,
  imports: [FormsModule, MultiSelectModule],
  template: `
    <p-multiSelect
      [options]="state.all"
      optionLabel="header"
      optionValue="field"
      [ngModel]="state.selectedFields"
      (ngModelChange)="state.setSelected($event)"
      [ngModelOptions]="{ standalone: true }"
      [maxSelectedLabels]="0"
      selectedItemsLabel="Colonnes ({0})"
      placeholder="Colonnes"
      [showHeader]="true"
      appendTo="body"
    ></p-multiSelect>
  `,
  styles: [
    `
      :host {
        display: flex;
        justify-content: flex-end;
        margin-bottom: var(--space-sm);
      }

      /* Posé dans une barre d'outils (classe \`en-ligne\`) : à la hauteur des autres contrôles, sans marge propre. */
      :host(.en-ligne) {
        display: inline-flex;
        margin-bottom: 0;
      }

      :host(.en-ligne) ::ng-deep .p-multiselect {
        height: var(--control-height);
        font-size: var(--text-sm);
      }

      :host(.en-ligne) ::ng-deep .p-multiselect-label {
        display: flex;
        align-items: center;
        padding-block: 0;
      }
    `
  ]
})
export class ColumnChooserComponent {
  @Input({ required: true }) state!: ColumnState;
}
