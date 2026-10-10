import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';

export type MessageSeverity = 'info' | 'warn' | 'error';

/** Message permanent dans la page (avis, rappel de règle). Les erreurs de champ restent des `<small role="alert">`. */
@Component({
  selector: 'stp-message',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()', '[attr.role]': 'severity() === "error" ? "alert" : "status"' },
  template: `<stp-icon [name]="severity() === 'info' ? 'info' : 'triangle-alert'" /><span>{{ text() }}<ng-content /></span>`,
  styles: `
    :host {
      display: flex;
      align-items: flex-start;
      gap: var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      border: 1px solid var(--color-border);
      border-inline-start-width: 4px;
      border-radius: var(--radius-md);
      background: var(--color-surface-alt);
      font-size: var(--text-sm);
    }

    :host(.stp-message--info) {
      border-inline-start-color: var(--color-primary);
    }

    :host(.stp-message--warn) {
      border-inline-start-color: var(--color-warning);
    }

    :host(.stp-message--error) {
      border-inline-start-color: var(--color-danger);
    }

    stp-icon {
      margin-top: 0.125rem;
    }
  `
})
export class MessageComponent {
  readonly severity = input<MessageSeverity>('info');
  readonly text = input('');

  protected readonly classes = computed(() => `stp-message stp-message--${this.severity()}`);
}
