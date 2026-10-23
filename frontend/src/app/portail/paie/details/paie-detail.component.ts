import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DialogComponent } from '../../../shared/ui/dialog/dialog.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { AuditHistoriqueComponent } from '../../audit/historique/audit-historique.component';
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';

@Component({
  selector: 'app-paie-detail',
  imports: [RouterLink, AuditHistoriqueComponent, DecimalPipe, IconComponent, ButtonComponent, DialogComponent],
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

  protected readonly paie = signal<Paie | null>(null);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.paieService.getById(id).subscribe((paie) => this.paie.set(paie));
  }
}
