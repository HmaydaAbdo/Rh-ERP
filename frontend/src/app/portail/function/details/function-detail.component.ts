import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';

@Component({
  selector: 'app-function-detail',
  imports: [RouterLink, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './function-detail.component.html'
})
export class FunctionDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly functionService = inject(FunctionService);

  private readonly authService = inject(AuthService);
  protected readonly canWrite = computed(() => this.authService.hasPermission('FUNCTION_WRITE'));
  protected readonly fonction = signal<Function | null>(null);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.functionService.getById(id).subscribe((fonction) => this.fonction.set(fonction));
  }
}
