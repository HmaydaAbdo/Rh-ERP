import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { EquipeService } from '../services/equipe.service';

@Component({
  selector: 'app-equipe-form',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equipe-form.component.html'
})
export class EquipeFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly equipeService = inject(EquipeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly equipeId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly isEditMode = computed(() => this.equipeId() !== null);

  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    libelle: ['', [Validators.required, Validators.maxLength(100)]]
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.equipeId.set(id);
      this.equipeService.getById(id).subscribe((equipe) => this.form.patchValue({ code: equipe.code, libelle: equipe.libelle }));
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focaliserPremiereErreur();
      return;
    }

    const dto = this.form.getRawValue();
    const id = this.equipeId();

    this.saving.set(true);

    const request$ = id !== null ? this.equipeService.update(id, dto) : this.equipeService.create(dto);

    request$.pipe(finalize(() => this.saving.set(false))).subscribe((equipe) => {
      this.messageService.add({
        severity: 'success',
        summary: id !== null ? 'Équipe modifiée' : 'Équipe créée',
        life: 4000
      });
      this.form.markAsPristine();
      this.router.navigate(['/equipes', equipe.id]);
    });
  }
}
