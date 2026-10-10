import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DateInputComponent } from '../../../shared/ui/date-input/date-input.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { EmployeeStatut } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';

const STATUT_OPTIONS: { label: string; value: EmployeeStatut }[] = [
  { label: 'Actif', value: 'ACTIF' },
  { label: 'Inactif', value: 'INACTIF' }
];

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

@Component({
  selector: 'app-employee-form',
  imports: [ReactiveFormsModule, RouterLink, LazySelectComponent, ButtonComponent, IconComponent, SelectComponent, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employee-form.component.html'
})
export class EmployeeFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly employeeService = inject(EmployeeService);
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  protected readonly statutOptions = STATUT_OPTIONS;

  private readonly employeeId = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    nomPrenom: ['', [Validators.required, Validators.maxLength(150)]],
    cin: ['', [Validators.required, Validators.maxLength(30)]],
    dateNaissance: [null as Date | null, Validators.required],
    dateEmbauche: [null as Date | null, Validators.required],
    fonctionId: [null as number | null, Validators.required],
    chantierId: [null as number | null, Validators.required],
    statut: ['ACTIF' as EmployeeStatut, Validators.required]
  });

  protected readonly isEditMode = computed(() => this.employeeId() !== null);

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.employeeId.set(id);
      this.employeeService.getById(id).subscribe((employee) => {
        this.form.patchValue({
          nomPrenom: employee.nomPrenom,
          cin: employee.cin,
          dateNaissance: fromIsoDate(employee.dateNaissance),
          dateEmbauche: fromIsoDate(employee.dateEmbauche),
          fonctionId: employee.fonction.id,
          chantierId: employee.chantier.id,
          statut: employee.statut
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
    const dto = {
      nomPrenom: raw.nomPrenom!,
      cin: raw.cin!,
      dateNaissance: toIsoDate(raw.dateNaissance!),
      dateEmbauche: toIsoDate(raw.dateEmbauche!),
      fonctionId: raw.fonctionId!,
      chantierId: raw.chantierId!
    };

    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.employeeService.update(this.employeeId()!, { ...dto, statut: raw.statut! })
      : this.employeeService.create(dto);

    request$
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe((employee) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode() ? 'Employé modifié' : 'Employé créé',
          life: 4000
        });
        this.form.markAsPristine();
        this.router.navigate(['/employees', employee.id]);
      });
  }
}
