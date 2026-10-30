import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, contentChild, input, model, output } from '@angular/core';

import { ColumnChooserComponent } from '../column-chooser/column-chooser.component';
import { ColumnState } from '../../table/table-columns';
import { TableCellDirective, TableComponent, TableFooterDirective, TableLazyLoadEvent, TableRowActionsDirective } from '../../ui/table/table.component';
import { ButtonComponent } from '../../ui/button/button.directive';
import { MessageComponent } from '../../ui/message/message.component';

/** Configuration d'affichage du compteur et des états vides; les données et les colonnes restent fournies par le domaine. */
export interface CollectionTableConfig {
  countLabel: (total: number) => string;
  accessibleLabel: string;
  emptyMessage: string;
}

/** Barre de liste et tableau communs. Les cellules et les actions de ligne sont projetées depuis le domaine. */
@Component({
  selector: 'app-collection-table',
  imports: [ColumnChooserComponent, TableComponent, NgTemplateOutlet, TableCellDirective, TableRowActionsDirective, TableFooterDirective, ButtonComponent, MessageComponent],
  template: `
      <div class="app-page app-collection-table__surface" [attr.aria-busy]="loading()">
      @if (erreur(); as message) {
        <stp-message severity="error" [text]="message" />
        <div class="app-page__actions">
          <button stp-button variant="secondary" icon="refresh-cw" type="button" [loading]="loading()" (click)="reessayer.emit()">Réessayer</button>
        </div>
      }
      <div [hidden]="!!erreur()">
      <div class="app-table-bar">
        <div class="app-table-bar__summary">
        <p class="app-table-bar__total" role="status">
          @if (!loading()) { {{ configuration().countLabel(totalRecords()) }} }
        </p>
        <ng-content select="[table-summary]"></ng-content>
        </div>
        <div class="app-table-bar__tools">
          <app-column-chooser class="en-ligne" [state]="columnState()"></app-column-chooser>
          <ng-content select="[table-export]"></ng-content>
        </div>
      </div>
      <stp-table
        [label]="configuration().accessibleLabel"
        [emptyMessage]="configuration().emptyMessage"
        [lazy]="true"
        [value]="value()"
        [totalRecords]="totalRecords()"
        [loading]="loading()"
        [columns]="columnState().visible"
        [(first)]="first"
        (lazyLoad)="lazyLoad.emit($event)"
        (columnsReorder)="columnState().onReorder($event)"
      >
        @if (cell(); as cellule) {
          <ng-template stpCell let-row let-col="col">
            <ng-container [ngTemplateOutlet]="cellule.template" [ngTemplateOutletContext]="{ $implicit: row, col: col }"></ng-container>
          </ng-template>
        }
        @if (rowActions(); as actions) {
          <ng-template stpRowActions let-row>
            <ng-container [ngTemplateOutlet]="actions.template" [ngTemplateOutletContext]="{ $implicit: row }"></ng-container>
          </ng-template>
        }
        @if (footer(); as pied) {
          <ng-template stpFooter let-col="col">
            <ng-container [ngTemplateOutlet]="pied.template" [ngTemplateOutletContext]="{ col: col }"></ng-container>
          </ng-template>
        }
      </stp-table>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollectionTableComponent<T extends object> {
  readonly configuration = input.required<CollectionTableConfig>();
  readonly columnState = input.required<ColumnState>();
  readonly value = input<T[]>([]);
  readonly totalRecords = input(0);
  readonly loading = input(false);
  readonly erreur = input<string | null>(null);
  readonly reessayer = output<void>();
  readonly first = model(0);
  readonly lazyLoad = output<TableLazyLoadEvent>();

  private readonly cell = contentChild(TableCellDirective);
  private readonly rowActions = contentChild(TableRowActionsDirective);
  private readonly footer = contentChild(TableFooterDirective);
}
