import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { BadgeComponent } from '../../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Chantier } from '../models/chantier.model';
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

  protected readonly chantier = signal<Chantier | null>(null);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.chantierService.getById(id).subscribe((chantier) => (this.chantier.set(chantier)));
  }
}
