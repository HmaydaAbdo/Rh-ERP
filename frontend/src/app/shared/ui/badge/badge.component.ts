import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeSeverity = 'success' | 'danger' | 'info' | 'neutral';

/** Pastille de statut (Actif / Inactif, source, nombre de permissions…) : le sens est dans le texte, la couleur le renforce. */
@Component({
  selector: 'stp-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `{{ value() }}<ng-content />`
})
export class BadgeComponent {
  readonly value = input('');
  readonly severity = input<BadgeSeverity>('neutral');

  protected readonly classes = computed(() => `stp-badge stp-badge--${this.severity()}`);
}
