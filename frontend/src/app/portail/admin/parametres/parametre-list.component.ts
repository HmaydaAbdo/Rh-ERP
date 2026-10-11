import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Parametre, ParametreService } from '../services/parametre.service';
import { ParametreItemComponent } from './parametre-item.component';

@Component({
  selector: 'app-parametre-list',
  imports: [IconComponent, ParametreItemComponent],
  templateUrl: './parametre-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './parametre-list.component.scss'
})
export class ParametreListComponent {
  private readonly parametreService = inject(ParametreService);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);

  protected readonly parametres = signal<Parametre[]>([]);
  protected readonly loading = signal(true);
  protected readonly canWrite = computed(() => this.authService.hasPermission('PARAMETRE_WRITE'));

  constructor() {
    this.parametreService
      .findAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe((parametres) => this.parametres.set(parametres));
  }

  protected onSaved(parametre: Parametre): void {
    this.parametres.update((courants) => courants.map((courant) => (courant.id === parametre.id ? parametre : courant)));
    this.notificationService.add({ severity: 'success', summary: 'Paramètre enregistré', life: 4000 });
  }
}
