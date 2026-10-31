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
      border: 1px solid var(--stp-message-color);
      border-radius: var(--radius-md);
      background: var(--stp-message-bg);
      color: var(--color-text);
      font-size: var(--text-sm);
      line-height: var(--leading-body);
    }

    :host(.stp-message--info) {
      --stp-message-color: var(--color-info);
      --stp-message-bg: var(--color-info-bg);
    }

    :host(.stp-message--warn) {
      --stp-message-color: var(--color-warning);
      --stp-message-bg: var(--color-warning-bg);
    }

    :host(.stp-message--error) {
      --stp-message-color: var(--color-danger);
      --stp-message-bg: var(--color-danger-bg);
    }

    stp-icon {
      margin-top: 0.125rem;
      color: var(--stp-message-color);
    }
  `
})
export class MessageComponent {
  readonly severity = input<MessageSeverity>('info');
  readonly text = input('');

  protected readonly classes = computed(() => `stp-message stp-message--${this.severity()}`);
}
