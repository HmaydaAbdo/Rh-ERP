import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ChartData } from 'chart.js';

import { ChartComponent, ChartSelection } from './chart.component';

@Component({
  selector: 'app-graphique-test',
  imports: [ChartComponent],
  template: `
    <div style="width: 400px; height: 240px">
      <stp-chart type="bar" ariaLabel="Masse salariale par chantier" [data]="donnees()" [options]="options()" (dataSelect)="selections.push($event)" />
    </div>
  `
})
class GraphiqueTestComponent {
  readonly donnees = signal<ChartData<'bar'>>({ labels: ['C168', 'C196'], datasets: [{ label: 'Masse', data: [10, 20] }] });
  readonly options = signal({ animation: false as const, responsive: true });
  readonly selections: ChartSelection[] = [];
}

@Component({
  selector: 'app-graphique-radar-test',
  imports: [ChartComponent],
  template: `
    <div style="width: 400px; height: 240px">
      <stp-chart type="radar" ariaLabel="Valeurs par critère" [data]="donnees()" />
    </div>
  `
})
class GraphiqueRadarTestComponent {
  readonly donnees = signal<ChartData<'radar'>>({ labels: ['A', 'B'], datasets: [{ label: 'Masse', data: [10, 20] }] });
}

describe('ChartComponent', () => {
  let fixture: ComponentFixture<GraphiqueTestComponent>;
  const canvas = () => fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;

  afterEach(() => vi.restoreAllMocks());

  async function afficher(): Promise<void> {
    fixture = TestBed.createComponent(GraphiqueTestComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(async () => {
      const { default: Chart } = await import('chart.js/auto');
      expect(Chart.getChart(canvas())).toBeDefined();
    }, { timeout: 10_000 });
  }

  async function graphique() {
    const { default: Chart } = await import('chart.js/auto');
    return Chart.getChart(canvas())!;
  }

  it('dessine un canvas décrit pour les technologies d’assistance', async () => {
    await afficher();

    expect(canvas().getAttribute('role')).toBe('img');
    expect(canvas().getAttribute('aria-label')).toBe(
      'Masse salariale par chantier. Utilisez les flèches pour parcourir les données, puis Entrée pour sélectionner.'
    );
  });

  it('crée un graphique du type demandé avec ses données', async () => {
    await afficher();

    const chart = await graphique();
    expect((chart.config as { type: string }).type).toBe('bar');
    expect(chart.data.labels).toEqual(['C168', 'C196']);
    expect(chart.data.datasets[0].data).toEqual([10, 20]);
  });

  it('se recrée quand les données changent', async () => {
    await afficher();
    const avant = await graphique();

    fixture.componentInstance.donnees.set({ labels: ['C057'], datasets: [{ label: 'Masse', data: [5] }] });
    fixture.detectChanges();

    await vi.waitFor(async () => {
      const apres = await graphique();
      expect(apres).not.toBe(avant);
      expect(apres.data.labels).toEqual(['C057']);
    });
  });

  it('applique les couleurs système en contraste forcé et suit sa désactivation', async () => {
    let changement: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      matches: true,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => changement = listener,
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList;
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const couleurSysteme = (nom: string): string => {
      const contexte = document.createElement('canvas').getContext('2d')!;
      contexte.fillStyle = nom;
      return contexte.fillStyle;
    };

    await afficher();
    const contraste = await graphique();
    expect(contraste.options.color).toBe(couleurSysteme('CanvasText'));
    expect(contraste.options.scales?.['x']?.ticks?.color).toBe(couleurSysteme('CanvasText'));
    expect(contraste.options.scales?.['y']?.grid?.color).toBe(couleurSysteme('GrayText'));

    changement?.({ matches: false } as MediaQueryListEvent);
    fixture.detectChanges();
    await vi.waitFor(async () => expect(await graphique()).not.toBe(contraste));
    const normal = await graphique();
    expect(normal.options.color).toBe('#666');
    expect(normal.options.scales?.['x']?.ticks?.color).toBe('#666');

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('applique la palette système à l’échelle radar', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList);
    fixture = TestBed.createComponent(GraphiqueRadarTestComponent) as unknown as ComponentFixture<GraphiqueTestComponent>;
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(async () => {
      const { default: Chart } = await import('chart.js/auto');
      expect(Chart.getChart(canvas())).toBeDefined();
    }, { timeout: 10_000 });

    const chart = await graphique();
    const contexte = document.createElement('canvas').getContext('2d')!;
    const optionsRadiales = (chart.options.scales as unknown as Record<string, {
      grid?: { color?: unknown };
      angleLines?: { color?: unknown };
      pointLabels?: { color?: unknown };
    }>)['r'];
    contexte.fillStyle = 'GrayText';
    expect(optionsRadiales.grid?.color).toBe(contexte.fillStyle);
    expect(optionsRadiales.angleLines?.color).toBe(contexte.fillStyle);
    contexte.fillStyle = 'CanvasText';
    expect(optionsRadiales.pointLabels?.color).toBe(contexte.fillStyle);

    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('prévient du point cliqué', async () => {
    await afficher();
    const chart = await graphique();
    vi.spyOn(chart, 'getElementsAtEventForMode').mockReturnValue([{ index: 1, datasetIndex: 0, element: {} as never }]);

    canvas().dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.selections).toEqual([{ index: 1, datasetIndex: 0 }]);
  });

  it('ne dit rien d’un clic à côté des données', async () => {
    await afficher();
    const chart = await graphique();
    vi.spyOn(chart, 'getElementsAtEventForMode').mockReturnValue([]);

    canvas().dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(fixture.componentInstance.selections).toEqual([]);
  });

  it('détruit le graphique avec le composant', async () => {
    await afficher();
    const chart = await graphique();
    const detruire = vi.spyOn(chart, 'destroy');

    fixture.destroy();

    expect(detruire).toHaveBeenCalled();
  });
});
