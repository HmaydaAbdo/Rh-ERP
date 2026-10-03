/** Colonne de données d'un tableau PrimeNG — `field` identifie la colonne (rendu du corps, choix des
 * colonnes visibles), `sortField` est le chemin de propriété transmis au tri (par défaut `field`, ex.
 * `chantier.code` pour une relation, voir `conventions/frontend.md`, section Tableaux). */
export interface TableColumn {
  field: string;
  header: string;
  sortField?: string;
  /** Classes appliquées à l'en-tête ET aux cellules de la colonne (ex. `text-center`, `text-right`). */
  align?: string;
  /** Classes appliquées aux seules cellules de la colonne (ex. troncature d'un texte long). */
  cellClass?: string;
}

/** Choix du nombre de lignes par page, commun à tous les tableaux paginés. */
export const TABLE_ROWS_PER_PAGE = [10, 20, 50, 100];

/** Résumé de pagination commun à tous les tableaux (total de lignes compris). */
export const TABLE_PAGE_REPORT = '{first} - {last} sur {totalRecords} — page {currentPage}/{totalPages}';

/**
 * État des colonnes d'un tableau : ordre (réordonnancement par glisser-déposer) et visibilité
 * (sélecteur de colonnes). `visible` est le tableau à lier à `[columns]` de `p-table` et à parcourir
 * dans l'en-tête et le corps — PrimeNG le réordonne en place, `onReorder` reporte alors le nouvel ordre
 * dans l'ordre complet pour qu'il survive à un masquage/affichage de colonne.
 */
export class ColumnState {
  readonly all: TableColumn[];
  visible: TableColumn[];
  selectedFields: string[];

  private order: TableColumn[];

  constructor(columns: TableColumn[]) {
    this.all = columns;
    this.order = [...columns];
    this.visible = [...columns];
    this.selectedFields = columns.map((column) => column.field);
  }

  /** Au moins une colonne reste visible : une sélection vide est ignorée (le sélecteur est resynchronisé). */
  setSelected(fields: string[]): void {
    if (fields.length === 0) {
      this.selectedFields = [...this.selectedFields];
      return;
    }
    this.selectedFields = this.order.map((column) => column.field).filter((field) => fields.includes(field));
    this.visible = this.order.filter((column) => this.selectedFields.includes(column.field));
  }

  /** Reporte l'ordre des colonnes visibles dans l'ordre complet, sans déplacer les colonnes masquées. */
  onReorder(reordered: TableColumn[] | undefined): void {
    if (!reordered) {
      return;
    }
    const slots = this.order
      .map((column, index) => (this.selectedFields.includes(column.field) ? index : -1))
      .filter((index) => index >= 0);
    const next = [...this.order];
    slots.forEach((slot, rank) => (next[slot] = reordered[rank]));
    this.order = next;
    this.visible = [...reordered];
  }
}
