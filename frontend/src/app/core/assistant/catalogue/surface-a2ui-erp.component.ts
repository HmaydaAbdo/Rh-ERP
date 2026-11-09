import {
  A2UI_RENDERER_CONFIG,
  A2uiRendererService,
  BasicCatalog,
  SurfaceComponent,
  createComponentImplementation,
  provideMarkdownRenderer
} from '@a2ui/angular/v0_9';
import { ChangeDetectionStrategy, Component, InjectionToken, effect, inject, input, output, signal } from '@angular/core';
import { renderMarkdown } from '@a2ui/markdown-it';

import { ChartApi, DataTableApi, KpiGridApi } from './api-catalogue';
import { A2uiChartComponent } from './a2ui-chart.component';
import { A2uiDataTableComponent } from './a2ui-data-table.component';
import { A2uiKpiGridComponent } from './a2ui-kpi-grid.component';
import { CHAMP_CATALOGUE_ERP } from './identifiant-catalogue';

/** Ce que le rendu renvoie à l'agent quand l'utilisateur déclenche une action (`a2uiAction`, comme le rendu intégré de CopilotKit). */
export interface EvenementActionA2ui {
  userAction: unknown;
}

/** Relais entre le service de rendu (créé avant le composant) et la sortie `action` du composant. */
const RELAIS_ACTION = new InjectionToken<{ emettre: (action: unknown) => void }>('RELAIS_ACTION');

/** Le catalogue de rendu : le catalogue de base A2UI v0.9 et les composants de l'ERP, sous l'identifiant que l'agent annonce. */
export function creerCatalogueRendu(): BasicCatalog {
  return new BasicCatalog({
    id: CHAMP_CATALOGUE_ERP,
    extraComponents: [
      createComponentImplementation(DataTableApi, A2uiDataTableComponent),
      createComponentImplementation(KpiGridApi, A2uiKpiGridComponent),
      createComponentImplementation(ChartApi, A2uiChartComponent)
    ]
  });
}

/**
 * Surface A2UI de l'assistant, rendue par `@a2ui/angular` (protocole v0.9). CopilotKit la monte à la place de son rendu
 * intégré (`surfaceComponent` du catalogue) : mêmes entrées (`operations`) et mêmes sorties (`action`, `error`, `rendered`).
 * Chaque instance a son propre service de rendu, donc ses propres surfaces.
 */
@Component({
  selector: 'app-a2ui-surface-erp',
  imports: [SurfaceComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  providers: [
    { provide: RELAIS_ACTION, useFactory: () => ({ emettre: () => undefined }) },
    A2uiRendererService,
    provideMarkdownRenderer(renderMarkdown),
    {
      provide: A2UI_RENDERER_CONFIG,
      useFactory: () => {
        const relais = inject(RELAIS_ACTION);
        return { catalogs: [creerCatalogueRendu()], actionHandler: (action: unknown) => relais.emettre(action) };
      }
    }
  ],
  template: `
    @if (erreur()) {
      <p class="app-muted" role="alert">Cette présentation n'a pas pu être affichée.</p>
    }
    @for (id of surfaces(); track id) {
      <a2ui-v09-surface [surfaceId]="id" />
    }
  `
})
export class SurfaceA2uiErpComponent {
  // Entrées que CopilotKit fournit à toute surface ; seules les opérations servent ici.
  readonly operations = input<readonly unknown[]>([]);
  readonly catalog = input<unknown>();
  readonly theme = input<unknown>();
  readonly loadingComponent = input<unknown>();

  readonly action = output<EvenementActionA2ui>();
  // Nom imposé par le contrat de CopilotKit pour une surface (`action`, `error`, `rendered`).
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly error = output<{ error: unknown; message: string }>();
  readonly rendered = output<void>();

  protected readonly surfaces = signal<string[]>([]);
  protected readonly erreur = signal(false);

  private readonly rendu = inject(A2uiRendererService);
  private appliquees: readonly unknown[] = [];

  constructor() {
    inject(RELAIS_ACTION).emettre = (action) => this.action.emit({ userAction: action });
    effect(() => this.appliquer(this.operations()));
  }

  /** CopilotKit renvoie la liste complète des opérations à chaque mise à jour : on n'applique que la suite déjà vue. */
  private appliquer(operations: readonly unknown[]): void {
    const prolonge = this.appliquees.length <= operations.length && this.appliquees.every((op, i) => op === operations[i] || JSON.stringify(op) === JSON.stringify(operations[i]));
    try {
      if (!prolonge) {
        for (const id of [...this.rendu.surfaceGroup.surfacesMap.keys()]) {
          this.rendu.processMessages([{ version: 'v0.9', deleteSurface: { surfaceId: id } }]);
        }
        this.appliquees = [];
      }
      const nouvelles = operations.slice(this.appliquees.length);
      if (nouvelles.length > 0) {
        this.rendu.processMessages(nouvelles);
      }
      this.appliquees = operations;
      this.surfaces.set([...this.rendu.surfaceGroup.surfacesMap.keys()]);
      this.erreur.set(false);
      this.rendered.emit();
    } catch (erreur) {
      // Le formatage des erreurs de validation d'A2UI plante sous zod 4 : on garde un repli lisible au lieu de casser le fil.
      this.erreur.set(true);
      // Le message de validation d'A2UI est masqué par son plantage sous zod 4 (web_core 0.14 lit `error.errors`) : on garde les opérations refusées pour diagnostiquer.
      console.warn('[A2UI ERP] surface refusée', operations);
      this.error.emit({ error: erreur, message: erreur instanceof Error ? erreur.message : 'Surface A2UI invalide' });
    }
  }
}
