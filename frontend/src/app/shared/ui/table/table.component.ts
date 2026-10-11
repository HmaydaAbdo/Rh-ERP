import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, contentChild, Directive, inject, Injector, input, model, output, signal, TemplateRef } from '@angular/core';

import { TABLE_ROWS_PER_PAGE, TableColumn } from '../../table/table-columns';
import { ButtonComponent } from '../button/button.directive';
import { IconComponent } from '../icon/icon.component';

/** Requête de données d'un tableau paginé côté serveur (même forme que l'ancien `TableLazyLoadEvent`). */
export interface TableLazyLoadEvent {
  first: number;
  rows: number;
  sortField: string | null;
  sortOrder: 1 | -1;
}

/** Gabarit d'une cellule : `<ng-template stpCell let-row let-col="col">` — reçoit la ligne et la colonne. */
@Directive({ selector: 'ng-template[stpCell]' })
export class TableCellDirective {
  readonly template = inject(TemplateRef);
}

/** Gabarit des boutons d'action d'une ligne : ajoute la dernière colonne, dont l'en-tête est réservé aux lecteurs d'écran. */
@Directive({ selector: 'ng-template[stpRowActions]' })
export class TableRowActionsDirective {
  readonly template = inject(TemplateRef);
}

/** Gabarit du pied : une cellule par colonne (`let-col="col"`), en gras — totaux d'un tableau. */
@Directive({ selector: 'ng-template[stpFooter]' })
export class TableFooterDirective {
  readonly template = inject(TemplateRef);
}

const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 2000;
const KEYBOARD_RESIZE_STEP = 12;

/**
 * Tableau de données Staport : HTML natif (`table`, `th scope="col"`, `aria-sort`) sans dépendance de widgets.
 * Voir `conventions/frontend.md`, section Tableaux.
 *
 * - Mode serveur (`lazy`) : le tableau ne trie ni ne découpe rien, il émet `lazyLoad` à l'initialisation puis à chaque
 *   changement de page, de taille ou de tri ; le parent charge la page et fournit `value` et `totalRecords`.
 * - Mode mémoire : `value` contient toutes les lignes, le tri et la pagination sont faits ici.
 * - Colonnes : tri par bouton d'en-tête, redimensionnement (poignée à la souris, flèches au clavier), réordonnancement
 *   (glisser-déposer ou Alt + flèches sur l'en-tête). Le parent garde l'ordre via `columnsReorder`.
 */
@Component({
  selector: 'stp-table',
  imports: [NgTemplateOutlet, ButtonComponent, IconComponent],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableComponent<T extends object> {
  readonly value = input<T[]>([]);
  readonly columns = input.required<TableColumn[]>();
  /** Nom accessible du tableau (annoncé avec la région défilante). */
  readonly label = input.required<string>();
  readonly lazy = input(false);
  /** Total de lignes côté serveur (mode `lazy`). */
  readonly totalRecords = input(0);
  readonly loading = input(false);
  readonly emptyMessage = input('Aucune donnée.');
  readonly rowsPerPageOptions = input<number[]>(TABLE_ROWS_PER_PAGE);
  readonly reorderable = input(true);
  readonly resizable = input(true);
  /** Faux : la colonne des actions n'est pas affichée (ex. l'utilisateur n'a pas la permission des actions). */
  readonly rowActionsVisible = input(true);
  /** Ligne cliquable (et atteignable au clavier, Entrée) quand cette fonction répond vrai ; `rowClick` émet alors la ligne. */
  readonly rowClickable = input<((row: T) => boolean) | null>(null);
  readonly rowTitle = input<((row: T) => string | null) | null>(null);

  /** Index de la première ligne affichée et taille de page : liables en double sens pour conserver l'état dans l'URL. */
  readonly first = model(0);
  readonly rows = model(10);
  readonly sortField = model<string | null>(null);
  readonly sortOrder = model<1 | -1>(1);

  readonly lazyLoad = output<TableLazyLoadEvent>();
  readonly columnsReorder = output<TableColumn[]>();
  readonly rowClick = output<T>();

  private readonly injector = inject(Injector);

  protected readonly cell = contentChild(TableCellDirective);
  protected readonly rowActions = contentChild(TableRowActionsDirective);
  protected readonly footer = contentChild(TableFooterDirective);
  protected readonly showActions = computed(() => !!this.rowActions() && this.rowActionsVisible());

  protected readonly widths = signal<Record<string, number>>({});
  protected readonly dragged = signal<string | null>(null);
  protected readonly dropTarget = signal<string | null>(null);

  protected readonly total = computed(() => (this.lazy() ? this.totalRecords() : this.value().length));
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.rows())));
  protected readonly currentPage = computed(() => Math.min(this.pageCount(), Math.floor(this.first() / this.rows()) + 1));
  protected readonly lastRow = computed(() => Math.min(this.total(), this.first() + this.rows()));
  protected readonly columnCount = computed(() => this.columns().length + (this.showActions() ? 1 : 0));

  protected readonly displayed = computed(() => {
    if (this.lazy()) {
      return this.value();
    }
    const field = this.sortField();
    let rows = [...this.value()];
    if (field) {
      const direction = this.sortOrder();
      rows.sort((a, b) => direction * compareValues(valueAt(a, field), valueAt(b, field)));
    }
    rows = rows.slice(this.first(), this.first() + this.rows());
    return rows;
  });

  constructor() {
    // Le contrat historique : un tableau serveur demande lui-même sa première page dès qu'il est affiché.
    afterNextRender(() => {
      if (this.lazy()) {
        this.emitLazy();
      }
    });
  }

  protected isClickable(row: T): boolean {
    return this.rowClickable()?.(row) ?? false;
  }

  protected onRowClick(row: T): void {
    if (this.isClickable(row)) {
      this.rowClick.emit(row);
    }
  }

  protected sortKey(column: TableColumn): string {
    return column.sortField ?? column.field;
  }

  protected ariaSort(column: TableColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortField() !== this.sortKey(column)) {
      return 'none';
    }
    return this.sortOrder() === 1 ? 'ascending' : 'descending';
  }

  protected sortBy(column: TableColumn): void {
    if (column.sortable === false) {
      return;
    }
    const key = this.sortKey(column);
    if (this.sortField() === key) {
      this.sortOrder.set(this.sortOrder() === 1 ? -1 : 1);
    } else {
      this.sortField.set(key);
      this.sortOrder.set(1);
    }
    this.first.set(0);
    this.emitLazy();
  }

  protected goToPage(page: number): void {
    const bounded = Math.min(Math.max(page, 1), this.pageCount());
    this.first.set((bounded - 1) * this.rows());
    this.emitLazy();
  }

  protected changeRows(size: number): void {
    this.rows.set(size);
    this.first.set(0);
    this.emitLazy();
  }

  protected rowsFromSelect(event: Event): number {
    return Number((event.target as HTMLSelectElement).value);
  }

  // ---- Redimensionnement ----

  protected startResize(event: PointerEvent, column: TableColumn): void {
    event.preventDefault();
    const header = (event.target as HTMLElement).closest('th') as HTMLElement;
    const startX = event.clientX;
    const startWidth = header.offsetWidth;
    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => this.setWidth(column, startWidth + moveEvent.clientX - startX);
    const stop = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  }

  protected resizeWithKeyboard(event: KeyboardEvent, column: TableColumn): void {
    const delta = event.key === 'ArrowRight' ? KEYBOARD_RESIZE_STEP : event.key === 'ArrowLeft' ? -KEYBOARD_RESIZE_STEP : 0;
    if (delta === 0) {
      return;
    }
    event.preventDefault();
    const header = (event.target as HTMLElement).closest('th') as HTMLElement;
    this.setWidth(column, (this.widths()[column.field] ?? header.offsetWidth) + delta);
  }

  private setWidth(column: TableColumn, width: number): void {
    this.widths.update((current) => ({
      ...current,
      [column.field]: Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)))
    }));
  }

  // ---- Réordonnancement ----

  protected onDragStart(event: DragEvent, column: TableColumn): void {
    this.dragged.set(column.field);
    event.dataTransfer?.setData('text/plain', column.field);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected onDragOver(event: DragEvent, column: TableColumn): void {
    if (this.dragged() && this.dragged() !== column.field) {
      event.preventDefault();
      this.dropTarget.set(column.field);
    }
  }

  protected onDrop(event: DragEvent, column: TableColumn): void {
    event.preventDefault();
    const source = this.dragged();
    this.onDragEnd();
    if (source && source !== column.field) {
      this.move(source, this.columns().findIndex((c) => c.field === column.field));
    }
  }

  protected onDragEnd(): void {
    this.dragged.set(null);
    this.dropTarget.set(null);
  }

  protected moveWithKeyboard(event: Event, column: TableColumn, offset: -1 | 1): void {
    event.preventDefault();
    const index = this.columns().findIndex((c) => c.field === column.field);
    this.move(column.field, index + offset);
    // L'en-tête change de place : le focus le suit une fois le tableau redessiné.
    afterNextRender(() => document.getElementById(this.headerId(column))?.querySelector('button')?.focus(), { injector: this.injector });
  }

  protected headerId(column: TableColumn): string {
    return `stp-th-${column.field}`;
  }

  private move(field: string, targetIndex: number): void {
    const columns = [...this.columns()];
    const from = columns.findIndex((c) => c.field === field);
    if (from < 0 || targetIndex < 0 || targetIndex >= columns.length || from === targetIndex) {
      return;
    }
    const [moved] = columns.splice(from, 1);
    columns.splice(targetIndex, 0, moved);
    this.columnsReorder.emit(columns);
  }

  private emitLazy(): void {
    if (this.lazy()) {
      this.lazyLoad.emit({ first: this.first(), rows: this.rows(), sortField: this.sortField(), sortOrder: this.sortOrder() });
    }
  }
}

/** Valeur d'un chemin de propriété (`chantier.code`) ; `null` si un maillon manque. */
function valueAt(row: object, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => (current == null ? null : (current as Record<string, unknown>)[key]), row);
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return -1;
  }
  if (b == null) {
    return 1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
}
