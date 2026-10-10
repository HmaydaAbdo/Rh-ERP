import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ColumnState } from '../../table/table-columns';
import { SelectComponent, SelectOption } from '../../ui/select/select.component';

/** Sélecteur des colonnes visibles d'un tableau (voir `conventions/frontend.md`, section Tableaux) : au moins une colonne reste
 * visible, une sélection vide est ignorée et le champ resynchronisé (voir `ColumnState.setSelected`). */
@Component({
  selector: 'app-column-chooser',
  imports: [ReactiveFormsModule, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <stp-select
      [multiple]="true"
      [clearable]="false"
      [options]="options()"
      [formControl]="control"
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

  protected readonly control = new FormControl<string[]>([], { nonNullable: true });

  protected options(): SelectOption<string>[] {
    return this.state().all.map((column) => ({ label: column.header, value: column.field }));
  }

  constructor() {
    effect(() => this.control.setValue([...this.state().selectedFields], { emitEvent: false }));
    this.control.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((fields) => {
      this.state().setSelected(fields);
      this.control.setValue([...this.state().selectedFields], { emitEvent: false });
    });
  }
}
