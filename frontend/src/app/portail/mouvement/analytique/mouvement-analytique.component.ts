import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartData, ChartOptions } from 'chart.js';

import { ThemeService } from '../../../core/theme/theme.service';
import type { TableColumn } from '../../../shared/table/table-columns';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { jeton } from '../../../shared/ui/chart/chart-theme';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { hauteurPourLignes, optionsBarres } from '../../perimetre/analytique/graphiques-perimetre';
import { compterParCategorie, DimensionMouvement, grouperMouvements, LIBELLES_DIMENSION, LigneMouvement, sommeMontants } from '../mouvement-agregats';

/** Le nombre maximal de groupes tracés dans un graphique ; le tableau des données les donne tous. */
const GROUPES_TRACES = 12;
const COULEURS = ['--chart-1', '--chart-3', '--chart-4', '--chart-2', '--chart-5', '--chart-6'];

interface Graphique {
  dimension: DimensionMouvement;
  titre: string;
  hauteur: number;
  data: ChartData<'bar'>;
  options: ChartOptions<'bar'>;
  tableau: Record<string, string | number>[];
  colonnes: TableColumn[];
  total: number;
}

/**
 * Vue Analytique d'un domaine de mouvements : les chiffres du mois, puis la répartition des mouvements par chantier, équipe
 * et fonction, chaque barre étant empilée par catégorie (type d'entrée, motif de sortie). Chaque graphique a son tableau de
 * données voisin (lecture au clavier et par lecteur d'écran). Calculée sur la liste du mois que l'état du domaine a chargée :
 * l'évolution sur plusieurs mois demanderait une route d'agrégat, elle n'est pas proposée ici.
 */
@Component({
  selector: 'app-mouvement-analytique',
  imports: [DecimalPipe, ChartComponent, MessageComponent, TableComponent, TableCellDirective],
  template: `
    <div class="app-analytics">
      @if (message(); as texte) {
        <stp-message severity="warn" [text]="texte" />
      }
      <div class="app-busy" [attr.aria-busy]="chargement()">
        @if (chargement()) {
          <stp-message text="Chargement du mois…" />
        } @else if (lignes().length === 0) {
          <p class="app-muted" role="status">Aucune donnée pour ce mois et ces filtres.</p>
        } @else {
          <section class="app-kpis" aria-label="Chiffres du mois">
            <div class="app-kpi">
              <span>{{ libelleUnite() }} du mois</span>
              <strong>{{ lignes().length }}</strong>
              <small>{{ libelleCategorie() }} : {{ resumeCategories() }}</small>
            </div>
            <div class="app-kpi">
              <span>Chantiers concernés</span>
              <strong>{{ chantiers() }}</strong>
              <small>où les mouvements sont affectés</small>
            </div>
            <div class="app-kpi">
              <span>Équipes concernées</span>
              <strong>{{ equipes() }}</strong>
              <small>équipes distinctes</small>
            </div>
            @if (montant() !== null) {
              <div class="app-kpi">
                <span>Montant des bulletins</span>
                <strong>{{ montant() | number: '1.0-0' }} DH</strong>
                <small>somme du mois</small>
              </div>
            }
          </section>

          @for (graphique of graphiques(); track graphique.dimension) {
            <section class="app-panel" [attr.aria-labelledby]="'mvt-' + graphique.dimension">
              <div class="app-panel__head">
                <h2 id="{{ 'mvt-' + graphique.dimension }}">{{ graphique.titre }}</h2>
              </div>
              <div class="app-chart app-chart--tall" [style.height.rem]="graphique.hauteur">
                <stp-chart
                  type="bar"
                  [ariaLabel]="graphique.titre + ', le détail complet est dans le tableau des données.'"
                  [data]="graphique.data"
                  [options]="graphique.options"
                ></stp-chart>
              </div>
              <details class="app-data-details">
                <summary>Voir les données ({{ graphique.tableau.length }})</summary>
                <stp-table
                  [label]="'Données : ' + graphique.titre"
                  [value]="graphique.tableau"
                  [columns]="graphique.colonnes"
                  [paginated]="false"
                  [reorderable]="false"
                  [rowActionsVisible]="false"
                >
                  <ng-template stpCell let-ligne let-col="col">{{ ligne[col.field] }}</ng-template>
                </stp-table>
              </details>
            </section>
          }
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MouvementAnalytiqueComponent {
  readonly lignes = input.required<LigneMouvement[]>();
  readonly chargement = input(false);
  /** Pluriel capitalisé du domaine : « Entrants », « Sorties ». */
  readonly libelleUnite = input.required<string>();
  /** Nom de la catégorie du domaine : « Type d’entrée », « Motif ». */
  readonly libelleCategorie = input.required<string>();
  readonly message = input<string | null>(null);

  private readonly theme = inject(ThemeService);

  protected readonly montant = computed(() => sommeMontants(this.lignes()));
  protected readonly chantiers = computed(() => new Set(this.lignes().map((l) => l.chantierId ?? 0)).size);
  protected readonly equipes = computed(() => new Set(this.lignes().filter((l) => l.equipeId != null).map((l) => l.equipeId)).size);
  protected readonly resumeCategories = computed(() =>
    compterParCategorie(this.lignes())
      .map((c) => `${c.categorie} ${c.nombre}`)
      .join(' · ')
  );

  protected readonly graphiques = computed<Graphique[]>(() => {
    this.theme.theme(); // recalcule les couleurs à la bascule clair / sombre
    const lignes = this.lignes();
    const categories = compterParCategorie(lignes).map((c) => c.categorie);
    return (['chantier', 'equipe', 'fonction'] as const).map((dimension) => {
      const groupes = grouperMouvements(lignes, dimension);
      const traces = groupes.slice(0, GROUPES_TRACES);
      const titre = `Répartition par ${LIBELLES_DIMENSION[dimension].toLowerCase()}`;
      return {
        dimension,
        titre,
        hauteur: hauteurPourLignes(traces.length),
        total: groupes.length,
        data: {
          labels: traces.map((g) => g.libelle),
          datasets: categories.map((categorie, i) => ({
            label: categorie,
            data: traces.map((g) => g.parCategorie.find((c) => c.categorie === categorie)?.nombre ?? 0),
            backgroundColor: jeton(COULEURS[i % COULEURS.length]),
            borderRadius: 4
          }))
        },
        options: optionsBarres({ indexAxis: 'y', empile: true, legende: true }),
        colonnes: [{ field: 'libelle', header: LIBELLES_DIMENSION[dimension], minWidth: 160 }, ...categories.map((c, i) => ({ field: `c${i}`, header: c, align: 'text-end' })), { field: 'total', header: 'Total', align: 'text-end' }],
        tableau: groupes.map((g) => ({
          libelle: g.libelle,
          ...Object.fromEntries(categories.map((c, i) => [`c${i}`, g.parCategorie.find((p) => p.categorie === c)?.nombre ?? 0])),
          total: g.nombre
        }))
      };
    });
  });
}
