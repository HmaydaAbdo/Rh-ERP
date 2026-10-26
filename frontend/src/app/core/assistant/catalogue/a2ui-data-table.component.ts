import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { injectA2UIComponentContext } from '@copilotkit/angular/a2ui';
import { LucideArrowDown, LucideArrowUp, LucideDownload, LucideMaximize2, LucideMinimize2, LucideSearch } from '@lucide/angular';

import { type FormatColonne, comparer, formater, versCsv } from './formats';

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
 * recherche sur tout le texte, export CSV des lignes affichées et plein écran. Les lignes viennent du modèle de données de
 * la surface (`{ path }`) : le modèle de langage ne les recopie pas.
 */
@Component({
  selector: 'app-a2ui-data-table',
  imports: [ScrollingModule, LucideArrowDown, LucideArrowUp, LucideDownload, LucideMaximize2, LucideMinimize2, LucideSearch],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.plein-ecran]': 'pleinEcran()', '(document:keydown.escape)': 'pleinEcran.set(false)' },
  template: `
    <header class="barre">
      <div class="titres">
        @if (props().title) {
          <h3 class="titre">{{ props().title }}</h3>
        }
        <p class="meta">
          {{ affichees().length }}
          @if (affichees().length !== lignes().length) {
            sur {{ lignes().length }}
          }
          ligne{{ affichees().length > 1 ? 's' : '' }}
          @if (props().caption) {
            · {{ props().caption }}
          }
        </p>
      </div>
      <label class="recherche">
        <svg lucideSearch aria-hidden="true"></svg>
        <input
          type="search"
          placeholder="Rechercher"
          aria-label="Rechercher dans le tableau"
          [value]="recherche()"
          (input)="recherche.set($any($event.target).value)"
        />
      </label>
      <button type="button" class="action" (click)="exporter()" aria-label="Exporter en CSV" title="Exporter en CSV">
        <svg lucideDownload aria-hidden="true"></svg>
      </button>
      <button
        type="button"
        class="action"
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
    </header>
    <div class="grille" role="table" [attr.aria-rowcount]="affichees().length + 1" [style.--colonnes]="colonnes().length">
      <div class="ligne entete" role="row">
        @for (colonne of colonnes(); track colonne.key) {
          <button
            type="button"
            class="cellule tri"
            role="columnheader"
            [class.numerique]="numerique(colonne)"
            [attr.aria-sort]="ariaTri(colonne)"
            (click)="trier(colonne)"
          >
            {{ colonne.label }}
            @if (tri()?.cle === colonne.key) {
              @if (tri()?.sens === 'asc') {
                <svg lucideArrowUp aria-hidden="true"></svg>
              } @else {
                <svg lucideArrowDown aria-hidden="true"></svg>
              }
            }
          </button>
        }
      </div>
      <cdk-virtual-scroll-viewport class="corps" [itemSize]="hauteurLigne" [style.height.px]="hauteurCorps()">
        <div class="ligne" role="row" *cdkVirtualFor="let ligne of affichees(); trackBy: suivre">
          @for (colonne of colonnes(); track colonne.key) {
            <div class="cellule" role="cell" [class.numerique]="numerique(colonne)">
              @if (colonne.bar && maximum(colonne) > 0) {
                <span class="barre-valeur" [style.width.%]="largeur(ligne[colonne.key], colonne)"></span>
              }
              <span class="valeur">{{ texte(ligne[colonne.key], colonne) }}</span>
            </div>
          }
        </div>
      </cdk-virtual-scroll-viewport>
    </div>
    @if (affichees().length === 0) {
      <p class="vide">Aucune ligne ne correspond à la recherche.</p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      overflow: hidden;
    }
    :host(.plein-ecran) {
      position: fixed;
      inset: var(--space-md);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 80px color-mix(in srgb, var(--color-text) 30%, transparent);
    }
    .barre {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      border-bottom: 1px solid var(--color-border);
    }
    .titres { flex: 1; min-width: 0; }
    .titre { margin: 0; font-size: var(--text-base); font-weight: 600; color: var(--color-text); }
    .meta { margin: 0; font-size: var(--text-xs); color: var(--color-text-muted); }
    .recherche {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface-alt);
      color: var(--color-text-muted);
      svg { width: 0.875rem; height: 0.875rem; flex: none; }
      input {
        width: 8rem;
        min-width: 0;
        padding: var(--space-xs) 0;
        border: 0;
        outline: 0;
        background: transparent;
        font: inherit;
        font-size: var(--text-sm);
        color: var(--color-text);
      }
      &:focus-within { border-color: var(--color-primary); }
    }
    .action {
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      svg { width: 1rem; height: 1rem; }
      &:hover { background: var(--color-surface-alt); color: var(--color-text); }
      &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
    }
    .grille { display: flex; flex-direction: column; min-height: 0; flex: 1; font-size: var(--text-sm); }
    .ligne {
      display: grid;
      grid-template-columns: repeat(var(--colonnes), minmax(5rem, 1fr));
      height: 2.5rem;
      border-bottom: 1px solid var(--color-border);
    }
    .entete { background: var(--color-surface-alt); }
    .cellule {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      min-width: 0;
      padding: 0 var(--space-md);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      &.numerique { justify-content: flex-end; font-variant-numeric: tabular-nums; }
    }
    .tri {
      border: 0;
      background: transparent;
      font: inherit;
      font-size: var(--text-xs);
      font-weight: 600;
      color: var(--color-text-muted);
      cursor: pointer;
      svg { width: 0.75rem; height: 0.75rem; flex: none; }
      &:hover { color: var(--color-text); }
      &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
    }
    .corps { flex: 1; }
    .corps .ligne:hover { background: var(--color-primary-soft); }
    .valeur { position: relative; overflow: hidden; text-overflow: ellipsis; color: var(--color-text); }
    .barre-valeur {
      position: absolute;
      inset-block: 0.5rem;
      right: var(--space-md);
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--color-primary) 16%, transparent);
    }
    .vide { margin: 0; padding: var(--space-md); text-align: center; color: var(--color-text-muted); }
  `
})
export class A2uiDataTableComponent {
  readonly props = input.required<{ title?: string; caption?: string; columns: Colonne[]; rows: unknown }>();

  protected readonly hauteurLigne = HAUTEUR_LIGNE;
  protected readonly recherche = signal('');
  protected readonly tri = signal<{ cle: string; sens: 'asc' | 'desc' } | null>(null);
  protected readonly pleinEcran = signal(false);
  protected readonly lignes = signal<Ligne[]>([]);
  protected readonly colonnes = computed(() => this.props().columns ?? []);

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

  private readonly contexte = injectA2UIComponentContext();

  constructor() {
    // Les lignes sont littérales ou liées au modèle de données de la surface (`{ path }`) : on suit alors ce dernier.
    effect((nettoyer) => {
      const brut = this.props().rows;
      if (Array.isArray(brut)) {
        this.lignes.set(brut as Ligne[]);
      } else if (brut && typeof brut === 'object' && 'path' in brut) {
        const abonnement = this.contexte.dataContext.subscribeDynamicValue<Ligne[] | undefined>(
          brut as { path: string },
          (valeur) => this.lignes.set(Array.isArray(valeur) ? valeur : [])
        );
        this.lignes.set(Array.isArray(abonnement.value) ? abonnement.value : []);
        nettoyer(() => abonnement.unsubscribe());
      }
    });
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

  protected exporter(): void {
    const fichier = new Blob([versCsv(this.colonnes(), this.affichees())], { type: 'text/csv;charset=utf-8' });
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(fichier);
    lien.download = `${(this.props().title ?? 'tableau').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, '-')}.csv`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  }
}
