
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { NotificationService } from '@shared/feedback/feedback.service';
import { finalize } from 'rxjs';

import { EquipeService } from '../services/equipe.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';

@Component({
    selector: 'app-equipe-form',
    imports: [ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './equipe-form.component.html'
})
export class EquipeFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly equipeService = inject(EquipeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  equipeId: number | null = null;
  saving = false;

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    libelle: ['', [Validators.required, Validators.maxLength(100)]]
  });

  get isEditMode(): boolean {
    return this.equipeId !== null;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.equipeId = Number(idParam);
      this.equipeService.getById(this.equipeId).subscribe((equipe) => {
        this.form.patchValue({ code: equipe.code, libelle: equipe.libelle });
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focaliserPremiereErreur();
      return;
    }

    const raw = this.form.getRawValue();
    const dto = { code: raw.code!, libelle: raw.libelle! };

    this.saving = true;

    const request$ = this.isEditMode
      ? this.equipeService.update(this.equipeId!, dto)
      : this.equipeService.create(dto);

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe((equipe) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode ? 'Équipe modifiée' : 'Équipe créée',
          life: 4000
        });
        this.form.markAsPristine();
        this.router.navigate(['/equipes', equipe.id]);
      });
  }
}
