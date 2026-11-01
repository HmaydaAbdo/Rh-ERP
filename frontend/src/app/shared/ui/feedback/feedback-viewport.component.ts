import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

import { IconComponent } from '../icon/icon.component';
import { ConfirmDialogService, NotificationService, NotificationSeverity } from './feedback.service';

@Component({
  selector: 'app-feedback-viewport',
  imports: [A11yModule, IconComponent],
  templateUrl: './feedback-viewport.component.html',
  styleUrl: './feedback-viewport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackViewportComponent {
  private readonly notificationService = inject(NotificationService);
  readonly notifications = this.notificationService.notifications;
  readonly confirmation = inject(ConfirmDialogService);

  /** La sévérité n'est pas portée par la seule couleur : une icône la double. */
  protected icone(severity: NotificationSeverity): string {
    return { success: 'circle-check', info: 'info', warn: 'triangle-alert', error: 'circle-alert' }[severity];
  }

  dismiss(id: number): void {
    this.notificationService.remove(id);
  }

  handleEscape(event: Event): void {
    event.stopPropagation();
    this.confirmation.reject();
  }
}
