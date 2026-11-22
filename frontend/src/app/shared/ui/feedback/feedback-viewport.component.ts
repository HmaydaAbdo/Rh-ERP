import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
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
/**
 * Notifications et confirmation, posées dans la couche supérieure du navigateur (`popover="manual"`) : les fenêtres du CDK
 * (`stp-dialog`, sélecteurs) y sont aussi, et rien dans une couche de z-index ne passe au-dessus d'elles. Sans cela, la
 * confirmation « Fermer sans enregistrer ? » d'un formulaire en fenêtre (KAN-310) ou une erreur serveur resterait cachée
 * derrière la fenêtre. Un élément affiché plus tard passe au-dessus : la confirmation et chaque nouvelle notification
 * sont (ré)affichées au moment où elles apparaissent.
 */
export class FeedbackViewportComponent {
  private readonly notificationService = inject(NotificationService);
  readonly notifications = this.notificationService.notifications;
  readonly confirmation = inject(ConfirmDialogService);
  private readonly pile = viewChild<ElementRef<HTMLElement>>('pile');
  private readonly fond = viewChild<ElementRef<HTMLElement>>('fond');
  private notificationsAffichees = 0;

  constructor() {
    effect(() => {
      const pile = this.pile()?.nativeElement;
      const nombre = this.notifications().length;
      if (!pile) {
        return;
      }
      // La pile reste ouverte (région `aria-live` toujours rendue) ; une nouvelle notification la remonte au-dessus des fenêtres.
      if (!pile.matches(':popover-open') || nombre > this.notificationsAffichees) {
        this.remonter(pile);
      }
      this.notificationsAffichees = nombre;
    });
    effect(() => {
      const fond = this.fond()?.nativeElement;
      if (fond && !fond.matches(':popover-open')) {
        this.remonter(fond);
      }
    });
  }

  private remonter(element: HTMLElement): void {
    if (typeof element.showPopover !== 'function') {
      return;
    }
    if (element.matches(':popover-open')) {
      element.hidePopover();
    }
    element.showPopover();
  }

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
