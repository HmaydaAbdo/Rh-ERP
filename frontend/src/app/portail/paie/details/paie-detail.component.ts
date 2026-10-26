import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { AuditHistoriqueComponent } from '../../audit/historique/audit-historique.component';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

@Component({
  selector: 'app-paie-detail',
  imports: [RouterLink, AuditHistoriqueComponent, DecimalPipe, IconComponent, ButtonComponent, DialogComponent, MessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './paie-detail.component.html'
})
export class PaieDetailComponent {
  private readonly authService = inject(AuthService);

  protected readonly canWrite = computed(() => this.authService.hasPermission('PAIE_WRITE') && this.authService.hasPermission('EMPLOYEE_WRITE'));

  protected readonly canViewHistory = computed(() => this.authService.hasPermission('AUDIT_READ'));

  protected readonly historiqueOuvert = signal(false);

  private readonly route = inject(ActivatedRoute);
  private readonly paieService = inject(PaieService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly paie = signal<Paie | null>(null);
  protected readonly loading = signal(false);
  protected readonly erreur = signal(false);

  constructor() {
    this.charger();
  }

  protected charger(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading.set(true);
    this.erreur.set(false);
    this.paieService.getById(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (paie) => this.paie.set(paie),
      error: () => this.erreur.set(true)
    });
  }
}
