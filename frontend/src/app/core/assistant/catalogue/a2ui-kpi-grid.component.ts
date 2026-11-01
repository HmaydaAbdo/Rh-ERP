import { CatalogComponent } from '@a2ui/angular/v0_9';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';

import { KpiGridApi } from './api-catalogue';

/** Grille d'indicateurs clés du catalogue ERP : libellé, grande valeur déjà formatée par l'outil, détail facultatif. */
@Component({
  selector: 'app-a2ui-kpi-grid',
  host: { class: 'app-kpis' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of items(); track $index) {
      <article class="app-kpi" [class.app-kpi--positive]="item.tone === 'positif'" [class.app-kpi--negative]="item.tone === 'negatif'">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        @if (item.detail) {
          <small>{{ item.detail }}</small>
        }
      </article>
    }
  `
})
export class A2uiKpiGridComponent extends CatalogComponent<typeof KpiGridApi> {
  protected readonly items = computed(() => (this.props().items?.value() ?? []) as { label: string; value: string; detail?: string; tone?: string }[]);
}
