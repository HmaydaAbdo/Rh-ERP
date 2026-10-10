import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { ChantierService } from '../services/chantier.service';

const ACTIF_OPTIONS: { label: string; value: boolean }[] = [
  { label: 'Actif', value: true },
  { label: 'Inactif', value: false }
];

@Component({
  selector: 'app-chantier-form',
  imports: [ReactiveFormsModule, RouterLink, ButtonComponent, IconComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chantier-form.component.html'
})
export class ChantierFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly chantierService = inject(ChantierService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  protected readonly actifOptions = ACTIF_OPTIONS;

  private readonly chantierId = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.maxLength(100)]],
    designation: ['', [Validators.required, Validators.maxLength(500)]],
    nom: ['', Validators.maxLength(255)],
    actif: [true, Validators.required]
  });

  protected readonly isEditMode = computed(() => this.chantierId() !== null);

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.chantierId.set(id);
      this.chantierService.getById(id).subscribe((chantier) => {
        this.form.patchValue({
          code: chantier.code,
          designation: chantier.designation,
          nom: chantier.nom,
          actif: chantier.actif
        });
      });
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focaliserPremiereErreur();
      return;
    }

    const raw = this.form.getRawValue();
    const dto = { code: raw.code!, designation: raw.designation!, nom: raw.nom || null };

    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.chantierService.update(this.chantierId()!, { ...dto, actif: raw.actif! })
      : this.chantierService.create(dto);

    request$
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe((chantier) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode() ? 'Chantier modifié' : 'Chantier créé',
          life: 4000
        });
        this.form.markAsPristine();
        this.router.navigate(['/chantiers', chantier.id]);
      });
  }
}
