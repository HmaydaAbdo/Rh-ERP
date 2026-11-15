import { CatalogComponent } from '@a2ui/angular/v0_9';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { LucideMaximize2, LucideMinimize2, LucideSearch } from '@lucide/angular';

import { TableColumn } from '../../../shared/table/table-columns';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { DataTableApi } from './api-catalogue';
import { type FormatColonne, formater } from './formats';

interface Colonne {
  key: string;
  label: string;
  format?: FormatColonne;
  bar?: boolean;
}
type Ligne = Record<string, unknown>;

/** Au-delà de ce nombre de lignes, le tableau se pagine (le défilement virtualisé maison est remplacé par la pagination). */
const LIGNES_PAR_PAGE = 20;

/**
 * Tableau de données du catalogue ERP (surface A2UI) : le tableau AG Grid de l'application (`stp-table` : tri, clavier,
 * accessibilité et thème viennent de la bibliothèque). Ce composant n'ajoute que la barre (titre, recherche sur tout le texte,
 * plein écran), le format des cellules et la barre de proportion. Les lignes viennent du modèle de données de la surface
 * (`{ path }`) : le modèle de langage ne les recopie pas.
 */
@Component({
  selector: 'app-a2ui-data-table',
  imports: [TableComponent, TableCellDirective, LucideMaximize2, LucideMinimize2, LucideSearch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'app-datagrid', '[class.app-datagrid--fullscreen]': 'pleinEcran()', '(document:keydown.escape)': 'pleinEcran.set(false)' },
  template: `
    <div class="app-datagrid__bar">
      <div class="app-datagrid__titles">
        @if (titre()) {
          <h3 class="app-datagrid__title">{{ titre() }}</h3>
        }
        <p class="app-datagrid__meta">
          {{ affichees().length }}
          @if (affichees().length !== lignes().length) {
            sur {{ lignes().length }}
          }
          ligne{{ affichees().length > 1 ? 's' : '' }}
          @if (legende()) {
            · {{ legende() }}
          }
        </p>
      </div>
      <label class="app-datagrid__search">
        <svg lucideSearch aria-hidden="true"></svg>
        <input
          type="search"
          placeholder="Rechercher"
          aria-label="Rechercher dans le tableau"
          [value]="recherche()"
          (input)="recherche.set($any($event.target).value)"
        />
      </label>
      <button
        type="button"
        class="app-datagrid__action"
        (click)="pleinEcran.set(!pleinEcran())"
        [attr.aria-label]="pleinEcran() ? 'Quitter le plein écran' : 'Plein écran'"
        [attr.title]="pleinEcran() ? 'Quitter le plein écran' : 'Plein écran'"
      >
        @if (pleinEcran()) {
          <svg lucideMinimize2 aria-hidden="true"></svg>
        } @else {
          <svg lucideMaximize2 aria-hidden="true"></svg>
        }
      </button>
    </div>
    <div class="app-datagrid__grid">
      <stp-table
        [value]="affichees()"
        [columns]="colonnesTable()"
        [label]="titre() ?? 'Tableau de données'"
        [paginated]="affichees().length > lignesParPage"
        [rows]="lignesParPage"
        [reorderable]="false"
        emptyMessage="Aucune ligne ne correspond à la recherche."
      >
        <ng-template stpCell let-ligne let-col="col">
          @if (colonneDe(col.field); as colonne) {
            @if (colonne.bar && maximum(colonne) > 0) {
              <span class="app-datagrid__bar-value" [style.width.%]="largeur(ligne[colonne.key], colonne)"></span>
            }
            <span class="app-datagrid__value">{{ texte(ligne[colonne.key], colonne) }}</span>
          }
        </ng-template>
      </stp-table>
    </div>
  `
})
export class A2uiDataTableComponent extends CatalogComponent<typeof DataTableApi> {
  protected readonly titre = computed(() => this.props().title?.value());
  protected readonly legende = computed(() => this.props().caption?.value());

  protected readonly lignesParPage = LIGNES_PAR_PAGE;
  protected readonly recherche = signal('');
  protected readonly pleinEcran = signal(false);
  // Les lignes sont littérales ou liées au modèle de données de la surface (`{ path }`) : le rendu résout la liaison.
  protected readonly lignes = computed<Ligne[]>(() => {
    const valeur = this.props().rows?.value();
    return Array.isArray(valeur) ? (valeur as Ligne[]) : [];
  });
  protected readonly colonnes = computed(() => (this.props().columns?.value() ?? []) as Colonne[]);

  protected readonly colonnesTable = computed<TableColumn[]>(() =>
    this.colonnes().map((c) => ({
      field: c.key,
      header: c.label,
      align: this.numerique(c) ? 'text-end' : undefined,
      minWidth: 90
    }))
  );

  protected readonly affichees = computed(() => {
    const requete = this.recherche().trim().toLocaleLowerCase('fr');
    if (!requete) {
      return this.lignes();
    }
    return this.lignes().filter((ligne) =>
      this.colonnes().some((c) => formater(ligne[c.key], c.format).toLocaleLowerCase('fr').includes(requete))
    );
  });

  protected colonneDe(cle: string): Colonne | undefined {
    return this.colonnes().find((c) => c.key === cle);
  }

  protected numerique(colonne: Colonne): boolean {
    return colonne.format === 'nombre' || colonne.format === 'montant';
  }

  protected maximum(colonne: Colonne): number {
    return Math.max(0, ...this.lignes().map((l) => (typeof l[colonne.key] === 'number' ? (l[colonne.key] as number) : 0)));
  }

  /** Part de la plus grande valeur de la colonne, en pourcentage de la largeur de la cellule. */
  protected largeur(valeur: unknown, colonne: Colonne): number {
    return typeof valeur === 'number' ? (100 * valeur) / this.maximum(colonne) : 0;
  }

  protected texte(valeur: unknown, colonne: Colonne): string {
    return formater(valeur, colonne.format);
  }
}
