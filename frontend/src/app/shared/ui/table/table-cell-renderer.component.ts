import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal, TemplateRef } from '@angular/core';
import type { ICellRendererAngularComp } from 'ag-grid-angular';
import type { ICellRendererParams } from 'ag-grid-community';

import { IconComponent } from '../icon/icon.component';

/** Ce que `stp-table` demande à une cellule d'afficher : un gabarit projeté par le domaine et son contexte. */
export interface TableCellModele {
  readonly template: TemplateRef<unknown>;
  readonly contexte: object;
}

/** Paramètre `cellRendererParams` : calcule le gabarit d'une cellule à partir de la ligne affichée. */
export interface TableCellParams extends ICellRendererParams {
  resoudre: (params: ICellRendererParams) => TableCellModele | null;
}

/**
 * Cellule d'AG Grid (`cellRenderer`, point d'extension officiel) : affiche le gabarit `stpCell`, `stpRowActions` ou `stpFooter`
 * que le domaine a projeté dans `stp-table`, avec la ligne et la colonne en contexte.
 */
@Component({
  selector: 'stp-table-cell',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (modele(); as m) {
      <ng-container [ngTemplateOutlet]="m.template" [ngTemplateOutletContext]="m.contexte" />
    } @else {
      {{ texte() }}
    }
  `
})
export class TableCellRendererComponent implements ICellRendererAngularComp {
  protected readonly modele = signal<TableCellModele | null>(null);
  /** Sans gabarit projeté, la cellule affiche la valeur de la colonne telle que la grille l'a formatée. */
  protected readonly texte = signal('');

  agInit(params: TableCellParams): void {
    this.charger(params);
  }

  refresh(params: TableCellParams): boolean {
    this.charger(params);
    return true;
  }

  private charger(params: TableCellParams): void {
    this.modele.set(params.resoudre(params));
    this.texte.set(params.valueFormatted ?? '');
  }
}

/** Message affiché quand le tableau n'a aucune ligne (`noRowsOverlayComponent`). */
@Component({
  selector: 'stp-table-empty',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="stp-table__empty-state"><stp-icon name="search" /><span>{{ message() }}</span></span>`
})
export class TableEmptyOverlayComponent {
  protected readonly message = signal('Aucune donnée.');

  agInit(params: { message?: string }): void {
    this.message.set(params.message ?? 'Aucune donnée.');
  }
}
