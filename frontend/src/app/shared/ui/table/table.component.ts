import { afterNextRender, ChangeDetectionStrategy, Component, computed, contentChild, Directive, effect, inject, input, model, output, signal, TemplateRef } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  type CellKeyDownEvent,
  type FullWidthCellKeyDownEvent,
  type ColDef,
  type ColumnMovedEvent,
  type GridApi,
  type GridReadyEvent,
  ModuleRegistry,
  type RowClickedEvent,
  type SortChangedEvent,
  themeQuartz
} from 'ag-grid-community';

import { TABLE_ROWS_PER_PAGE, TableColumn } from '../../table/table-columns';
import { ButtonComponent } from '../button/button.directive';
import { SelectComponent, SelectOption } from '../select/select.component';
import { TableCellParams, TableCellRendererComponent, TableEmptyOverlayComponent } from './table-cell-renderer.component';

ModuleRegistry.registerModules([AllCommunityModule]);

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

const COLONNE_ACTIONS = '__actions';
const LIGNE_PIED = { __pied: true };

/**
 * Thème AG Grid de Staport (API de thèmes officielle) : les valeurs sont les jetons de `_tokens.scss`, lus par le navigateur à
 * chaque rendu ; le changement de thème clair / sombre s'applique donc sans reconstruire la grille. Bordures franches (cadre, trait
 * d'en-tête), séparateurs de ligne visibles, lignes hautes.
 */
const THEME = themeQuartz.withParams({
  backgroundColor: 'var(--color-surface)',
  foregroundColor: 'var(--color-text)',
  accentColor: 'var(--color-primary)',
  borderColor: 'var(--color-border)',
  headerBackgroundColor: 'var(--table-header-bg)',
  headerTextColor: 'var(--color-text)',
  oddRowBackgroundColor: 'var(--table-row-alt-bg)',
  rowHoverColor: 'var(--table-row-hover-bg)',
  fontFamily: 'var(--font-sans)',
  headerFontWeight: 600,
  fontSize: 15,
  headerFontSize: 14,
  rowHeight: 48,
  headerHeight: 46,
  cellHorizontalPadding: 16,
  wrapperBorder: { style: 'solid', width: 1, color: 'var(--table-border)' },
  headerRowBorder: { style: 'solid', width: 1, color: 'var(--table-border)' },
  rowBorder: { style: 'solid', width: 1, color: 'var(--table-border-light)' },
  columnBorder: false,
  wrapperBorderRadius: 8
});

/**
 * Tableau de données Staport, bâti sur **AG Grid Community** (MIT) : tri, redimensionnement, réordonnancement, navigation
 * clavier, ARIA et virtualisation viennent de la bibliothèque ; ce composant ne fait que la raccorder à l'application.
 * Voir `conventions/frontend.md`, section Tableaux.
 *
 * - Mode serveur (`lazy`) : le tableau n'ordonne ni ne découpe rien, il émet `lazyLoad` à l'initialisation puis à chaque
 *   changement de page, de taille ou de tri ; le parent charge la page et fournit `value` et `totalRecords`.
 * - Mode mémoire : `value` contient toutes les lignes, le tri et la pagination sont faits ici.
 * - Les cellules, les actions de ligne et le pied sont des gabarits projetés par le domaine (`stpCell`, `stpRowActions`,
 *   `stpFooter`) affichés par un `cellRenderer` de la grille. Le parent garde l'ordre des colonnes via `columnsReorder`.
 */
@Component({
  selector: 'stp-table',
  imports: [AgGridAngular, ButtonComponent, SelectComponent],
  templateUrl: './table.component.html',
  styleUrl: './table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableComponent<T extends object> {
  readonly value = input<T[]>([]);
  readonly columns = input.required<TableColumn[]>();
  /** Nom accessible du tableau (annoncé avec la grille). */
  readonly label = input.required<string>();
  readonly lazy = input(false);
  /** Total de lignes côté serveur (mode `lazy`). */
  readonly totalRecords = input(0);
  readonly loading = input(false);
  readonly emptyMessage = input('Aucune donnée.');
  readonly rowsPerPageOptions = input<number[]>(TABLE_ROWS_PER_PAGE);
  /** Faux : toutes les lignes sont affichées, sans pagination (petits tableaux de données). */
  readonly paginated = input(true);
  readonly reorderable = input(true);
  readonly resizable = input(true);
  /** Faux : la colonne des actions n'est pas affichée (ex. l'utilisateur n'a pas la permission des actions). */
  readonly rowActionsVisible = input(true);
  /** Ligne cliquable (et atteignable au clavier, Entrée) quand cette fonction répond vrai ; `rowClick` émet alors la ligne. */
  readonly rowClickable = input<((row: T) => boolean) | null>(null);

  /** Index de la première ligne affichée et taille de page : liables en double sens pour conserver l'état dans l'URL. */
  readonly first = model(0);
  readonly rows = model(10);
  readonly sortField = model<string | null>(null);
  readonly sortOrder = model<1 | -1>(1);

  readonly lazyLoad = output<TableLazyLoadEvent>();
  readonly columnsReorder = output<TableColumn[]>();
  readonly rowClick = output<T>();

  protected readonly cell = contentChild(TableCellDirective);
  protected readonly rowActions = contentChild(TableRowActionsDirective);
  protected readonly footer = contentChild(TableFooterDirective);
  protected readonly showActions = computed(() => !!this.rowActions() && this.rowActionsVisible());

  protected readonly theme = THEME;
  protected readonly cellRenderer = TableCellRendererComponent;
  protected readonly noRowsOverlay = TableEmptyOverlayComponent;
  protected readonly noRowsParams = computed(() => ({ message: this.emptyMessage() }));
  protected readonly pinnedBottom = computed(() => (this.footer() ? [LIGNE_PIED] : undefined));

  protected readonly total = computed(() => (this.lazy() ? this.totalRecords() : this.value().length));
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.rows())));
  protected readonly currentPage = computed(() => Math.min(this.pageCount(), Math.floor(this.first() / this.rows()) + 1));
  protected readonly lastRow = computed(() => Math.min(this.total(), this.first() + this.rows()));
  protected readonly rowsOptions = computed<SelectOption<number>[]>(() => this.rowsPerPageOptions().map((value) => ({ value, label: String(value) })));

  protected readonly displayed = computed(() => {
    if (this.lazy()) {
      return this.value();
    }
    const field = this.sortField();
    const rows = [...this.value()];
    if (field) {
      const direction = this.sortOrder();
      rows.sort((a, b) => direction * compareValues(valueAt(a, field), valueAt(b, field)));
    }
    return this.paginated() ? rows.slice(this.first(), this.first() + this.rows()) : rows;
  });

  /** Téléphone : la première colonne reste en vue pendant le défilement horizontal. */
  private readonly etroit = signal(false);

  protected readonly colDefs = computed<ColDef[]>(() => {
    const definitions: ColDef[] = this.columns().map((colonne, index) => ({
      colId: colonne.field,
      field: colonne.field,
      headerName: colonne.shortHeader ?? colonne.header,
      headerTooltip: colonne.header,
      // Le contenu vient du gabarit projeté (`stpCell`) ; sans gabarit, la cellule affiche cette valeur (vide pour un objet).
      valueFormatter: ({ value }) => (value == null || typeof value === 'object' ? '' : String(value)),
      sortable: colonne.sortable !== false,
      // L'ordre vient du serveur (ou de ce composant en mode mémoire) : la grille n'y touche pas.
      comparator: () => 0,
      resizable: this.resizable(),
      suppressMovable: !this.reorderable(),
      minWidth: colonne.minWidth ?? 90,
      flex: colonne.minWidth ? colonne.minWidth / 90 : 1,
      pinned: this.etroit() && index === 0 ? 'left' : null,
      lockPinned: true,
      cellClass: [colonne.align, colonne.cellClass].filter(Boolean).join(' ') || undefined,
      headerClass: colonne.align || undefined,
      cellRenderer: this.cellRenderer,
      cellRendererParams: {
        resoudre: (params) => this.modeleCellule(params, colonne)
      } satisfies Pick<TableCellParams, 'resoudre'>
    }));
    if (this.showActions()) {
      definitions.push({
        colId: COLONNE_ACTIONS,
        headerName: 'Actions',
        headerClass: 'stp-table__actions-header',
        sortable: false,
        resizable: false,
        suppressMovable: true,
        width: 140,
        minWidth: 90,
        cellClass: 'stp-table__actions',
        cellRenderer: this.cellRenderer,
        cellRendererParams: {
          resoudre: (params) => this.modeleActions(params)
        } satisfies Pick<TableCellParams, 'resoudre'>
      });
    }
    return definitions;
  });

  private api: GridApi | null = null;
  private appliqueEtatTri = false;

  constructor() {
    // Le contrat historique : un tableau serveur demande lui-même sa première page dès qu'il est affiché.
    afterNextRender(() => {
      if (this.lazy()) {
        this.emitLazy();
      }
      const fenetre = typeof window === 'undefined' ? null : window;
      const mediaQuery = fenetre?.matchMedia('(max-width: 767px)');
      if (mediaQuery) {
        this.etroit.set(mediaQuery.matches);
        mediaQuery.addEventListener('change', (evenement) => this.etroit.set(evenement.matches));
      }
    });
    // Le tri affiché suit l'état du parent (URL, première charge) sans relancer de chargement.
    effect(() => {
      const champ = this.sortField();
      const ordre = this.sortOrder();
      this.colDefs();
      this.appliquerTriALaGrille(champ, ordre);
    });
  }

  protected onGridReady(evenement: GridReadyEvent): void {
    this.api = evenement.api;
    evenement.api.setGridAriaProperty('label', this.label());
    this.appliquerTriALaGrille(this.sortField(), this.sortOrder());
  }

  protected onSortChanged(evenement: SortChangedEvent): void {
    if (this.appliqueEtatTri) {
      return;
    }
    const triee = evenement.api.getColumnState().find((colonne) => colonne.sort);
    const colonne = triee ? this.columns().find((c) => c.field === triee.colId) : undefined;
    this.sortField.set(colonne ? this.sortKey(colonne) : null);
    this.sortOrder.set(triee?.sort === 'desc' ? -1 : 1);
    this.first.set(0);
    this.emitLazy();
  }

  protected onColumnMoved(evenement: ColumnMovedEvent): void {
    if (!evenement.finished || !evenement.source.startsWith('ui')) {
      return;
    }
    const ordre = evenement.api.getColumnState().map((colonne) => colonne.colId).filter((id) => id !== COLONNE_ACTIONS);
    const colonnes = ordre.map((id) => this.columns().find((c) => c.field === id)).filter((c): c is TableColumn => !!c);
    if (colonnes.length === this.columns().length && colonnes.some((c, i) => c.field !== this.columns()[i]?.field)) {
      this.columnsReorder.emit(colonnes);
    }
  }

  protected onRowClicked(evenement: RowClickedEvent): void {
    const cible = evenement.event?.target as HTMLElement | null;
    if (cible?.closest('button, a, input, select, textarea, [role="button"]')) {
      return;
    }
    this.cliquerLigne(evenement.data as T | undefined);
  }

  protected onCellKeyDown(evenement: CellKeyDownEvent | FullWidthCellKeyDownEvent): void {
    if ((evenement.event as KeyboardEvent | null)?.key === 'Enter') {
      this.cliquerLigne(evenement.data as T | undefined);
    }
  }

  protected readonly getRowClass = (params: { data?: T }): string | undefined => (params.data && this.rowClickable()?.(params.data) ? 'stp-table__row--clickable' : undefined);

  protected goToPage(page: number): void {
    const bounded = Math.min(Math.max(page, 1), this.pageCount());
    this.first.set((bounded - 1) * this.rows());
    this.emitLazy();
  }

  protected changeRows(value: unknown): void {
    if (typeof value !== 'number' || !this.rowsPerPageOptions().includes(value)) {
      return;
    }
    this.rows.set(value);
    this.first.set(0);
    this.emitLazy();
  }

  private cliquerLigne(ligne: T | undefined): void {
    if (ligne && this.rowClickable()?.(ligne)) {
      this.rowClick.emit(ligne);
    }
  }

  private sortKey(colonne: TableColumn): string {
    return colonne.sortField ?? colonne.field;
  }

  private appliquerTriALaGrille(champ: string | null, ordre: 1 | -1): void {
    if (!this.api) {
      return;
    }
    const colonne = champ ? this.columns().find((c) => this.sortKey(c) === champ) : undefined;
    this.appliqueEtatTri = true;
    this.api.applyColumnState({
      state: colonne ? [{ colId: colonne.field, sort: ordre === 1 ? 'asc' : 'desc' }] : [],
      defaultState: { sort: null }
    });
    this.appliqueEtatTri = false;
  }

  private modeleCellule(params: { data?: unknown; node: { rowPinned?: string | null } }, colonne: TableColumn) {
    if (params.node.rowPinned === 'bottom') {
      const pied = this.footer();
      return pied ? { template: pied.template, contexte: { col: colonne } } : null;
    }
    const cellule = this.cell();
    return cellule && params.data ? { template: cellule.template, contexte: { $implicit: params.data, col: colonne } } : null;
  }

  private modeleActions(params: { data?: unknown; node: { rowPinned?: string | null } }) {
    const actions = this.rowActions();
    return actions && params.data && params.node.rowPinned !== 'bottom' ? { template: actions.template, contexte: { $implicit: params.data } } : null;
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
