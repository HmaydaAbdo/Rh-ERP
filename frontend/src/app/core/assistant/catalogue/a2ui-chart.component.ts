import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ChartData, ChartOptions } from 'chart.js';

import { animationGraphique, grille, infobulle, jeton, police } from '../../../shared/ui/chart/chart-theme';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { ThemeService } from '../../theme/theme.service';

type TypeGraphique = 'bar' | 'line' | 'doughnut';
interface Serie {
  name: string;
  values: number[];
  format?: 'nombre' | 'montant';
}

const PALETTE = ['--color-primary', '--color-success', '--color-warning', '--color-danger', '--color-text-muted'];

/**
 * Graphique du catalogue ERP : le composant `stp-chart` de l'application (mêmes jetons, même accessibilité) ; plusieurs
 * séries se choisissent par des pastilles, un seul axe à la fois.
 */
@Component({
  selector: 'app-a2ui-chart',
  imports: [ChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="entete">
      @if (props().title) {
        <h3 class="titre">{{ props().title }}</h3>
      }
      @if (props().series.length > 1 && props().type !== 'doughnut') {
        <div class="series" role="group" aria-label="Série affichée">
          @for (serie of props().series; track serie.name; let i = $index) {
            <button type="button" class="pastille" [class.actif]="i === choix()" [attr.aria-pressed]="i === choix()" (click)="choix.set(i)">
              {{ serie.name }}
            </button>
          }
        </div>
      }
    </header>
    <div class="zone">
      <stp-chart [type]="props().type" [data]="donnees()" [options]="options()" [ariaLabel]="props().title ?? 'Graphique'" />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      padding: var(--space-sm-md) var(--space-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .entete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-sm); }
    .titre { margin: 0; font-size: var(--text-base); font-weight: 600; color: var(--color-text); }
    .series { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
    .pastille {
      padding: var(--space-2xs) var(--space-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: transparent;
      font: inherit;
      font-size: var(--text-xs);
      color: var(--color-text-muted);
      cursor: pointer;
      &.actif { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-text); }
      &:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
    }
    .zone { height: 14rem; margin-top: var(--space-sm); }
  `
})
export class A2uiChartComponent {
  readonly props = input.required<{ title?: string; type: TypeGraphique; labels: string[]; series: Serie[] }>();

  protected readonly choix = signal(0);
  private readonly theme = inject(ThemeService);

  private readonly serie = computed<Serie | undefined>(() => this.props().series[this.choix()] ?? this.props().series[0]);

  protected readonly donnees = computed<ChartData<TypeGraphique>>(() => {
    this.theme.theme(); // reconstruit à la bascule clair / sombre : Chart.js ne lit pas le CSS
    const couleurs = PALETTE.map(jeton);
    const serie = this.serie();
    const anneau = this.props().type === 'doughnut';
    return {
      labels: this.props().labels,
      datasets: [
        {
          label: serie?.name ?? '',
          data: serie?.values ?? [],
          backgroundColor: anneau ? this.props().labels.map((_, i) => couleurs[i % couleurs.length]) : couleurs[0],
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
    const anneau = this.props().type === 'doughnut';
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
