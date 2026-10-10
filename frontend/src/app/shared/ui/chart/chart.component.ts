import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, output, viewChild } from '@angular/core';
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
  template: `<canvas #canvas role="img" [attr.aria-label]="ariaLabel()" (click)="onClick($event)"></canvas>`,
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
      this.dataSelect.emit({ index: elements[0].index, datasetIndex: elements[0].datasetIndex });
    }
  }
}
