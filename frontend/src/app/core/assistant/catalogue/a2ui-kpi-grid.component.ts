import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Grille d'indicateurs clés du catalogue ERP : libellé, grande valeur déjà formatée par l'outil, détail facultatif. */
@Component({
  selector: 'app-a2ui-kpi-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (item of props().items; track $index) {
      <article class="kpi" [class.positif]="item.tone === 'positif'" [class.negatif]="item.tone === 'negatif'">
        <p class="libelle">{{ item.label }}</p>
        <p class="valeur">{{ item.value }}</p>
        @if (item.detail) {
          <p class="detail">{{ item.detail }}</p>
        }
      </article>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
      gap: var(--space-sm);
    }
    .kpi {
      min-width: 0;
      padding: var(--space-sm-md) var(--space-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    p { margin: 0; }
    .libelle { font-size: var(--text-xs); color: var(--color-text-muted); }
    .valeur {
      font-size: var(--text-lg);
      font-weight: 600;
      line-height: 1.3;
      font-variant-numeric: tabular-nums;
      color: var(--color-text);
      overflow-wrap: anywhere;
    }
    .detail { font-size: var(--text-xs); color: var(--color-text-muted); }
    .positif .valeur { color: var(--color-success); }
    .negatif .valeur { color: var(--color-danger); }
  `
})
export class A2uiKpiGridComponent {
  readonly props = input.required<{ items: { label: string; value: string; detail?: string; tone?: string }[] }>();
}
