import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { FunctionService } from '../services/function.service';

@Component({
  selector: 'app-function-form',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './function-form.component.html'
})
export class FunctionFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly functionService = inject(FunctionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly functionId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly isEditMode = computed(() => this.functionId() !== null);

  protected readonly form = this.fb.nonNullable.group({
    libelle: ['', [Validators.required, Validators.maxLength(100)]]
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.functionId.set(id);
      this.functionService.getById(id).subscribe((fonction) => this.form.patchValue({ libelle: fonction.libelle }));
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focaliserPremiereErreur();
      return;
    }

    const dto = { libelle: this.form.getRawValue().libelle };
    const id = this.functionId();

    this.saving.set(true);

    const request$ = id !== null ? this.functionService.update(id, dto) : this.functionService.create(dto);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe((fonction) => {
      this.messageService.add({
        severity: 'success',
        summary: id !== null ? 'Fonction modifiée' : 'Fonction créée',
        life: 4000
      });
      this.form.markAsPristine();
      this.router.navigate(['/functions', fonction.id]);
    });
  }
}
