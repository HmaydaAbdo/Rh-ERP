import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import type { Chart, ChartData, ChartOptions, ChartType, Plugin } from 'chart.js';

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
      min-width: 0;
    }
    canvas { max-width: 100%; }
  `
})
export class ChartComponent<T extends ChartType = ChartType> {
  readonly type = input.required<T>();
  readonly data = input.required<ChartData<T>>();
  readonly options = input<ChartOptions<T>>({} as ChartOptions<T>);
  /** Plugins Chart.js supplémentaires, par exemple les valeurs persistantes des points d'une évolution. */
  readonly plugins = input<Plugin<T>[]>([]);
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
  private readonly document = inject(DOCUMENT);
  private readonly forcedColors = signal(false);
  private chart: Chart | null = null;
  private generation = 0;

  constructor() {
    const forcedColorsQuery = this.document.defaultView?.matchMedia?.('(forced-colors: active)');
    const onForcedColorsChange = (event: MediaQueryListEvent) => this.forcedColors.set(event.matches);
    this.forcedColors.set(forcedColorsQuery?.matches ?? false);
    forcedColorsQuery?.addEventListener('change', onForcedColorsChange);

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      forcedColorsQuery?.removeEventListener('change', onForcedColorsChange);
      this.generation++;
      this.chart?.destroy();
    });

    effect(() => {
      const forcedColors = this.forcedColors();
      const type = this.type();
      const options = this.options();
      const plugins = this.plugins();
      const config = {
        type,
        data: this.data(),
        options: forcedColors ? this.optionsEnContrasteForce(options, type) : options,
        plugins
      };
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
  }

  /** Chart.js peint sur canvas : les couleurs forcées du navigateur ne touchent pas les pixels déjà dessinés. */
  private optionsEnContrasteForce(options: ChartOptions<T>, type: T): ChartOptions<T> {
    const texte = this.couleurSysteme('CanvasText');
    const surface = this.couleurSysteme('Canvas');
    const grille = this.couleurSysteme('GrayText');
    const source = options as unknown as Record<string, unknown>;

    const optionsPlugins = source['plugins'];
    let plugins: false | Record<string, unknown> = false;
    if (optionsPlugins !== false) {
      plugins = optionsPlugins && typeof optionsPlugins === 'object'
        ? { ...optionsPlugins as Record<string, unknown> }
        : {};
      plugins['legend'] = this.optionsPlugin(plugins['legend'], { labels: { color: texte } });
      plugins['tooltip'] = this.optionsPlugin(plugins['tooltip'], {
        backgroundColor: surface,
        borderColor: texte,
        titleColor: texte,
        bodyColor: texte
      });
    }

    const sourceScales = source['scales'];
    let scales: unknown = sourceScales;
    if (sourceScales !== false) {
      let echellesParDefaut: Record<string, unknown> = {};
      if (['bar', 'line', 'scatter', 'bubble'].includes(type)) {
        echellesParDefaut = { x: {}, y: {} };
      } else if (['polarArea', 'radar'].includes(type)) {
        echellesParDefaut = { r: {} };
      }
      const scalesSource = sourceScales && typeof sourceScales === 'object'
        ? sourceScales as Record<string, unknown>
        : echellesParDefaut;
      scales = Object.fromEntries(Object.entries(scalesSource).map(([nom, valeur]) => {
        if (!valeur || typeof valeur !== 'object') {
          return [nom, valeur];
        }
        const scale = valeur as Record<string, unknown>;
        return [nom, {
          ...scale,
          ticks: { ...this.optionsObjet(scale['ticks']), color: texte },
          grid: { ...this.optionsObjet(scale['grid']), color: grille },
          border: { ...this.optionsObjet(scale['border']), color: texte },
          angleLines: { ...this.optionsObjet(scale['angleLines']), color: grille },
          pointLabels: { ...this.optionsObjet(scale['pointLabels']), color: texte }
        }];
      }));
    }

    return { ...options, color: texte, plugins, scales } as unknown as ChartOptions<T>;
  }

  private optionsPlugin(value: unknown, valeursSysteme: Record<string, unknown>): false | Record<string, unknown> {
    if (value === false) {
      return false;
    }
    const original = this.optionsObjet(value);
    if ('labels' in valeursSysteme) {
      return {
        ...original,
        labels: { ...this.optionsObjet(original['labels']), ...this.optionsObjet(valeursSysteme['labels']) }
      };
    }
    return { ...original, ...valeursSysteme };
  }

  private optionsObjet(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  /** Le contexte canvas résout les couleurs système selon la palette de contraste choisie par l’OS. */
  private couleurSysteme(nom: 'CanvasText' | 'Canvas' | 'GrayText'): string {
    const contexte = this.document.createElement('canvas').getContext('2d');
    if (!contexte) {
      return nom;
    }
    contexte.fillStyle = nom;
    return contexte.fillStyle;
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
    let suivante: number;
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
