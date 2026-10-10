import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';

import { ConfirmDialogService, NotificationService } from './feedback.service';

@Component({
  selector: 'app-feedback-viewport',
  imports: [A11yModule],
  templateUrl: './feedback-viewport.component.html',
  styleUrl: './feedback-viewport.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedbackViewportComponent {
  private readonly notificationService = inject(NotificationService);
  readonly notifications = this.notificationService.notifications;
  readonly confirmation = inject(ConfirmDialogService);

  dismiss(id: number): void {
    this.notificationService.remove(id);
  }

  handleEscape(event: Event): void {
    event.stopPropagation();
    this.confirmation.reject();
  }
}
