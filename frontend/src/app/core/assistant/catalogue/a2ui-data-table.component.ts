import { ScrollingModule } from '@angular/cdk/scrolling';
import { CatalogComponent } from '@a2ui/angular/v0_9';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { LucideArrowDown, LucideArrowUp, LucideMaximize2, LucideMinimize2, LucideSearch } from '@lucide/angular';

import { DataTableApi } from './api-catalogue';
import { type FormatColonne, comparer, formater } from './formats';

interface Colonne {
  key: string;
  label: string;
  format?: FormatColonne;
  bar?: boolean;
}
type Ligne = Record<string, unknown>;

const HAUTEUR_LIGNE = 40;

/**
 * Tableau de données du catalogue ERP (surface A2UI) : défilement virtualisé (CDK) pour les listes longues, tri par colonne,
 * recherche sur tout le texte et plein écran. Les lignes viennent du modèle de données de
 * la surface (`{ path }`) : le modèle de langage ne les recopie pas.
 */
@Component({
  selector: 'app-a2ui-data-table',
  imports: [ScrollingModule, LucideArrowDown, LucideArrowUp, LucideMaximize2, LucideMinimize2, LucideSearch],
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
    <div class="app-datagrid__grid" role="table" [attr.aria-rowcount]="affichees().length + 1" [style.--colonnes]="colonnes().length">
      <div class="app-datagrid__row app-datagrid__row--head" role="row">
        @for (colonne of colonnes(); track colonne.key) {
          <div
            class="app-datagrid__cell"
            role="columnheader"
            [class.app-datagrid__cell--num]="numerique(colonne)"
            [attr.aria-sort]="ariaTri(colonne)"
          >
            <button type="button" class="app-datagrid__sort" (click)="trier(colonne)">
              {{ colonne.label }}
              @if (tri()?.cle === colonne.key) {
                @if (tri()?.sens === 'asc') {
                  <svg lucideArrowUp aria-hidden="true"></svg>
                } @else {
                  <svg lucideArrowDown aria-hidden="true"></svg>
                }
              }
            </button>
          </div>
        }
      </div>
      <cdk-virtual-scroll-viewport class="app-datagrid__body" role="rowgroup" tabindex="0" aria-label="Lignes du tableau" [itemSize]="hauteurLigne" [style.height.px]="hauteurCorps()">
        <div class="app-datagrid__row" role="row" *cdkVirtualFor="let ligne of affichees(); trackBy: suivre">
          @for (colonne of colonnes(); track colonne.key) {
            <div class="app-datagrid__cell" role="cell" [class.app-datagrid__cell--num]="numerique(colonne)">
              @if (colonne.bar && maximum(colonne) > 0) {
                <span class="app-datagrid__bar-value" [style.width.%]="largeur(ligne[colonne.key], colonne)"></span>
              }
              <span class="app-datagrid__value">{{ texte(ligne[colonne.key], colonne) }}</span>
            </div>
          }
        </div>
      </cdk-virtual-scroll-viewport>
    </div>
    @if (affichees().length === 0) {
      <p class="app-datagrid__empty">Aucune ligne ne correspond à la recherche.</p>
    }
  `
})
export class A2uiDataTableComponent extends CatalogComponent<typeof DataTableApi> {
  protected readonly titre = computed(() => this.props().title?.value());
  protected readonly legende = computed(() => this.props().caption?.value());

  protected readonly hauteurLigne = HAUTEUR_LIGNE;
  protected readonly recherche = signal('');
  protected readonly tri = signal<{ cle: string; sens: 'asc' | 'desc' } | null>(null);
  protected readonly pleinEcran = signal(false);
  // Les lignes sont littérales ou liées au modèle de données de la surface (`{ path }`) : le rendu résout la liaison.
  protected readonly lignes = computed<Ligne[]>(() => {
    const valeur = this.props().rows?.value();
    return Array.isArray(valeur) ? (valeur as Ligne[]) : [];
  });
  protected readonly colonnes = computed(() => (this.props().columns?.value() ?? []) as Colonne[]);

  protected readonly affichees = computed(() => {
    const requete = this.recherche().trim().toLocaleLowerCase('fr');
    let lignes = this.lignes();
    if (requete) {
      lignes = lignes.filter((ligne) =>
        this.colonnes().some((c) => formater(ligne[c.key], c.format).toLocaleLowerCase('fr').includes(requete))
      );
    }
    const tri = this.tri();
    if (tri) {
      const sens = tri.sens === 'asc' ? 1 : -1;
      lignes = [...lignes].sort((a, b) => sens * comparer(a[tri.cle], b[tri.cle]));
    }
    return lignes;
  });

  /** Hauteur du corps : les lignes visibles jusqu'à neuf en ligne, tout l'espace disponible en plein écran. */
  protected readonly hauteurCorps = computed(() =>
    this.pleinEcran() ? Math.max(240, window.innerHeight - 190) : Math.min(Math.max(this.affichees().length, 1), 9) * HAUTEUR_LIGNE
  );

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

  protected suivre(index: number): number {
    return index;
  }

  /** Premier clic : tri naturel (nombres décroissants, texte croissant), deuxième : inverse, troisième : sans tri. */
  protected trier(colonne: Colonne): void {
    const premier = this.numerique(colonne) ? 'desc' : 'asc';
    const courant = this.tri();
    if (courant?.cle !== colonne.key) {
      this.tri.set({ cle: colonne.key, sens: premier });
    } else if (courant.sens === premier) {
      this.tri.set({ cle: colonne.key, sens: premier === 'asc' ? 'desc' : 'asc' });
    } else {
      this.tri.set(null);
    }
  }

  protected ariaTri(colonne: Colonne): 'ascending' | 'descending' | 'none' {
    const tri = this.tri();
    return tri?.cle !== colonne.key ? 'none' : tri.sens === 'asc' ? 'ascending' : 'descending';
  }

}
