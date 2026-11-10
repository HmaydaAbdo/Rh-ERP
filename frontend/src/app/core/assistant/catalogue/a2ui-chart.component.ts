import { CatalogComponent } from '@a2ui/angular/v0_9';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { ChartData, ChartOptions } from 'chart.js';

import { animationGraphique, grille, infobulle, jeton, police } from '../../../shared/ui/chart/chart-theme';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { ThemeService } from '../../theme/theme.service';
import { ChartApi } from './api-catalogue';

type TypeGraphique = 'bar' | 'line' | 'doughnut';
interface Serie {
  name: string;
  values: number[];
  /** « montant » ou, par défaut (toute autre valeur), « nombre ». */
  format?: string;
}

const PALETTE = ['--color-primary', '--color-success', '--color-warning', '--color-danger', '--color-text-muted'];

/**
 * Graphique du catalogue ERP : le composant `stp-chart` de l'application (mêmes jetons, même accessibilité) ; plusieurs
 * séries se choisissent par des pastilles, un seul axe à la fois.
 */
@Component({
  selector: 'app-a2ui-chart',
  host: { class: 'app-panel' },
  imports: [ChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-panel__head">
      @if (titre()) {
        <h3 class="app-section-title">{{ titre() }}</h3>
      }
      @if (series().length > 1 && type() !== 'doughnut') {
        <div class="app-chips" role="group" aria-label="Série affichée">
          @for (serie of series(); track serie.name; let i = $index) {
            <button type="button" [attr.aria-pressed]="i === choix()" (click)="choix.set(i)">
              {{ serie.name }}
            </button>
          }
        </div>
      }
    </div>
    <div class="app-chart app-chart--short mt-2">
      <stp-chart [type]="type()" [data]="donnees()" [options]="options()" [ariaLabel]="titre() ?? 'Graphique'" />
    </div>
  `
})
export class A2uiChartComponent extends CatalogComponent<typeof ChartApi> {
  protected readonly titre = computed(() => this.props().title?.value());
  protected readonly type = computed(() => (this.props().type?.value() ?? 'bar') as TypeGraphique);
  protected readonly labels = computed(() => (this.props().labels?.value() ?? []) as string[]);
  protected readonly series = computed(() => (this.props().series?.value() ?? []) as Serie[]);

  protected readonly choix = signal(0);
  private readonly theme = inject(ThemeService);

  private readonly serie = computed<Serie | undefined>(() => this.series()[this.choix()] ?? this.series()[0]);

  protected readonly donnees = computed<ChartData<TypeGraphique>>(() => {
    this.theme.theme(); // reconstruit à la bascule clair / sombre : Chart.js ne lit pas le CSS
    const couleurs = PALETTE.map(jeton);
    const serie = this.serie();
    const anneau = this.type() === 'doughnut';
    return {
      labels: this.labels(),
      datasets: [
        {
          label: serie?.name ?? '',
          data: serie?.values ?? [],
          backgroundColor: anneau ? this.labels().map((_, i) => couleurs[i % couleurs.length]) : couleurs[0],
          borderColor: anneau ? jeton('--color-surface') : couleurs[0],
          borderRadius: anneau ? 0 : 4,
          tension: 0.3
        }
      ]
    } as ChartData<TypeGraphique>;
  });

  protected readonly options = computed<ChartOptions<TypeGraphique>>(() => {
    this.theme.theme();
    const texte = jeton('--color-text-muted');
    const anneau = this.type() === 'doughnut';
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: animationGraphique(),
      plugins: {
        legend: { display: anneau, position: 'bottom', labels: { color: jeton('--color-text'), font: police(), boxWidth: 12 } },
        tooltip: infobulle()
      },
      scales: anneau
        ? {}
        : {
            x: { grid: { display: false }, ticks: { color: texte, font: police(11) } },
            y: { beginAtZero: true, grid: grille(), border: { display: false }, ticks: { color: texte, font: police(11) } }
          }
    } as ChartOptions<TypeGraphique>;
  });
}
