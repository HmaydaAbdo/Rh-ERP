import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';

@Component({
  selector: 'app-equipe-detail',
  imports: [RouterLink, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equipe-detail.component.html'
})
export class EquipeDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly equipeService = inject(EquipeService);
  private readonly authService = inject(AuthService);

  protected readonly equipe = signal<Equipe | null>(null);
  protected readonly canWrite = computed(() => this.authService.hasPermission('EQUIPE_WRITE'));

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.equipeService.getById(id).subscribe((equipe) => this.equipe.set(equipe));
  }
}
