import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Grille d'indicateurs clés du catalogue ERP : libellé, grande valeur déjà formatée par l'outil, détail facultatif. */
@Component({
  selector: 'app-a2ui-kpi-grid',
  host: { class: 'app-kpis' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of props().items; track $index) {
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
export class A2uiKpiGridComponent {
  readonly props = input.required<{ items: { label: string; value: string; detail?: string; tone?: string }[] }>();
}
