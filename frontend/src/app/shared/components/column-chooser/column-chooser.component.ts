import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';

import { ColumnState } from '../../table/table-columns';
import { SelectComponent, SelectOption } from '../../ui/select/select.component';

/** Sélecteur des colonnes visibles d'un tableau (voir `conventions/frontend.md`, section Tableaux) : au moins une colonne reste
 * visible, une sélection vide est ignorée et le champ resynchronisé (voir `ColumnState.setSelected`). */
@Component({
  selector: 'app-column-chooser',
  imports: [SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <stp-select
      [multiple]="true"
      [clearable]="false"
      [options]="options()"
      [value]="selection()"
      (valueChange)="choisir($event)"
      [summaryFrom]="1"
      summaryLabel="Colonnes ({0})"
      placeholder="Colonnes"
      ariaLabel="Choisir les colonnes visibles"
    />
  `,
  styles: `
    :host {
      display: flex;
      justify-content: flex-end;
      margin-bottom: var(--space-sm);
    }

    /* Posé dans une barre d'outils (classe \`en-ligne\`) : sans marge propre. */
    :host(.en-ligne) {
      display: inline-flex;
      margin-bottom: 0;
    }

    stp-select {
      min-width: 9rem;
    }
  `
})
export class ColumnChooserComponent {
  readonly state = input.required<ColumnState>();

  protected readonly selection = linkedSignal<string[]>(() => [...this.state().selectedFields]);

  protected options(): SelectOption<string>[] {
    return this.state().all.map((column) => ({ label: column.header, value: column.field }));
  }

  /** La sélection retenue (jamais vide) est reportée dans le champ, qui se resynchronise si la sienne a été ignorée. */
  protected choisir(valeur: unknown): void {
    const fields = valeur as string[];
    this.state().setSelected(fields);
    this.selection.set([...this.state().selectedFields]);
  }
}
