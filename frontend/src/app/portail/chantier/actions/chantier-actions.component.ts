import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { ChantierService } from '../services/chantier.service';

/**
 * Les actions des chantiers — Synchroniser maintenant et Nouveau chantier — posées une seule fois dans l'en-tête de la page
 * (voir `ChantierVuesComponent`). Chaque bouton n'apparaît qu'avec sa permission. Une synchronisation réussie prévient la page
 * par `synchronise`, qui recharge la vue.
 */
@Component({
  selector: 'app-chantier-actions',
  imports: [RouterLink, ButtonComponent],
  template: `
    <div class="app-page__actions app-page__actions--liste">
      @if (canSync()) {
        <button stp-button variant="secondary" icon="refresh-cw" type="button" [loading]="syncing()" (click)="onSynchroniser()">Synchroniser maintenant</button>
      }
      @if (canWrite()) {
        <a stp-button icon="plus" routerLink="/chantiers/new">Nouveau chantier</a>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierActionsComponent {
  /** Des chantiers ont pu être ajoutés : la vue affichée doit se recharger. */
  readonly synchronise = output<void>();

  private readonly chantierService = inject(ChantierService);
  private readonly messageService = inject(NotificationService);
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('CHANTIER_WRITE'));
  protected readonly canSync = computed(() => this.authService.hasPermission('CHANTIER_SYNC'));
  protected readonly syncing = signal(false);

  protected onSynchroniser(): void {
    this.syncing.set(true);
    this.chantierService
      .synchroniser()
      .pipe(finalize(() => this.syncing.set(false)))
      .subscribe((result) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Synchronisation terminée',
          detail: `${result.crees} créé(s), ${result.dejaPresents} déjà présent(s), ${result.ignores} ignoré(s)`,
          life: 8000
        });
        this.synchronise.emit();
      });
  }
}
