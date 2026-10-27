import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Chantier, NATURE_CHANTIER_LIBELLES } from '../models/chantier.model';
import { confirmationStatutChantier, libelleStatutChantier } from '../models/chantier-statut';
import { ChantierService } from '../services/chantier.service';

@Component({
  selector: 'app-chantier-detail',
  imports: [RouterLink, ButtonComponent, BadgeComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chantier-detail.component.html'
})
export class ChantierDetailComponent {
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('CHANTIER_WRITE'));

  private readonly route = inject(ActivatedRoute);
  private readonly chantierService = inject(ChantierService);
  private readonly confirmationService = inject(ConfirmDialogService);
  private readonly messageService = inject(NotificationService);

  protected readonly chantier = signal<Chantier | null>(null);
  protected readonly changement = signal(false);
  protected readonly libelleStatut = libelleStatutChantier;
  protected readonly natures = NATURE_CHANTIER_LIBELLES;

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.chantierService.getById(id).subscribe((chantier) => (this.chantier.set(chantier)));
  }

  /** Clôture le chantier en cours, ou rouvre le chantier clôturé, après confirmation. */
  protected onChangerStatut(chantier: Chantier): void {
    this.confirmationService.confirm({
      ...confirmationStatutChantier(chantier),
      rejectLabel: 'Annuler',
      accept: () => {
        this.changement.set(true);
        this.chantierService
          .changerStatut(chantier, !chantier.actif)
          .pipe(finalize(() => this.changement.set(false)))
          .subscribe((modifie) => {
            this.chantier.set(modifie);
            this.messageService.add({ severity: 'success', summary: `Chantier ${modifie.code} : ${libelleStatutChantier(modifie.actif).toLowerCase()}`, life: 4000 });
          });
      }
    });
  }
}
