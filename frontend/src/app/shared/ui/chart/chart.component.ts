import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import type { Chart, ChartData, ChartOptions, ChartType } from 'chart.js';

/** Barre ou point cliqué d'un graphique : indice de la donnée et de la série. */
export interface ChartSelection {
  index: number;
  datasetIndex: number;
}

/**
 * Graphique Chart.js dans un `<canvas>` (`role="img"` : le détail est donné par le tableau de données voisin, voir
 * `conventions/design-system.md`, section Graphiques). Chart.js n'est chargé qu'à la première création d'un graphique.
 * Le graphique est recréé quand `type`, `data` ou `options` changent (ex. à la bascule du thème, qui recalcule les options).
 */
@Component({
  selector: 'stp-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'stp-chart' },
  template: `
    <canvas
      #canvas
      role="img"
      tabindex="0"
      aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter Space"
      [attr.aria-label]="ariaLabel() + '. Utilisez les flèches pour parcourir les données, puis Entrée pour sélectionner.'"
      (focus)="initialiserSelection()"
      (keydown)="onKeydown($event)"
      (click)="onClick($event)"
    ></canvas>
    <span class="app-lecteur" aria-live="polite">{{ annonceSelection() }}</span>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
    }
  `
})
export class ChartComponent<T extends ChartType = ChartType> {
  readonly type = input.required<T>();
  readonly data = input.required<ChartData<T>>();
  readonly options = input<ChartOptions<T>>({} as ChartOptions<T>);
  readonly ariaLabel = input.required<string>();

  readonly dataSelect = output<ChartSelection>();

  private readonly selection = signal<ChartSelection | null>(null);
  protected readonly annonceSelection = computed(() => {
    const selection = this.selection();
    if (!selection) {
      return '';
    }
    const dataset = this.data().datasets[selection.datasetIndex];
    const label = this.data().labels?.[selection.index];
    const valeur = dataset?.data[selection.index];
    const valeurFormatee = typeof valeur === 'number' ? new Intl.NumberFormat('fr-FR').format(valeur) : String(valeur ?? '');
    return `${String(label ?? '')}, ${dataset?.label ?? `série ${selection.datasetIndex + 1}`}, ${valeurFormatee}`;
  });

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;
  private generation = 0;

  constructor() {
    effect(() => {
      const config = { type: this.type(), data: this.data(), options: this.options() };
      const generation = ++this.generation;
      import('chart.js/auto').then(({ default: ChartJs }) => {
        // Une création plus récente a pris le relais pendant le chargement du module.
        if (generation !== this.generation) {
          return;
        }
        this.chart?.destroy();
        this.chart = new ChartJs(this.canvas().nativeElement, config as never);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.chart?.destroy();
    });
  }

  protected onClick(event: MouseEvent): void {
    const elements = this.chart?.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true) ?? [];
    if (elements.length > 0) {
      this.selectionner({ index: elements[0].index, datasetIndex: elements[0].datasetIndex }, true);
    }
  }

  protected initialiserSelection(): void {
    if (this.selection() || !this.data().datasets.some((dataset) => dataset.data.length > 0)) {
      return;
    }
    this.selectionner({ index: 0, datasetIndex: 0 });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const courant = this.selection();
    const points = this.data().datasets.flatMap((dataset, datasetIndex) =>
      dataset.data.map((_, index) => ({ index, datasetIndex }))
    );
    if (points.length === 0) {
      return;
    }

    const position = courant ? points.findIndex((point) => point.index === courant.index && point.datasetIndex === courant.datasetIndex) : -1;
    let suivante: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        suivante = Math.min(points.length - 1, position + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        suivante = Math.max(0, position < 0 ? 0 : position - 1);
        break;
      case 'Home':
        suivante = 0;
        break;
      case 'End':
        suivante = points.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.selectionner(courant ?? points[0], true);
        return;
      default:
        return;
    }

    event.preventDefault();
    this.selectionner(points[suivante]);
  }

  private selectionner(selection: ChartSelection, emettre = false): void {
    this.selection.set(selection);
    this.chart?.setActiveElements([selection]);
    this.chart?.update('none');
    if (emettre) {
      this.dataSelect.emit(selection);
    }
  }
}
