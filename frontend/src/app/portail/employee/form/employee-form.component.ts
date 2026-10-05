import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { EmployeeStatut } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';

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
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ButtonModule, InputTextModule, CalendarModule, DropdownModule, LazySelectComponent],
  templateUrl: './employee-form.component.html'
})
export class EmployeeFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly employeeService = inject(EmployeeService);
  readonly functionReferenceService = inject(FunctionReferenceService);
  readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  readonly statutOptions = STATUT_OPTIONS;

  employeeId: number | null = null;
  saving = false;

  readonly form = this.fb.group({
    nomPrenom: ['', [Validators.required, Validators.maxLength(150)]],
    cin: ['', [Validators.required, Validators.maxLength(30)]],
    dateNaissance: [null as Date | null, Validators.required],
    dateEmbauche: [null as Date | null, Validators.required],
    fonctionId: [null as number | null, Validators.required],
    chantierId: [null as number | null, Validators.required],
    statut: ['ACTIF' as EmployeeStatut, Validators.required]
  });

  get isEditMode(): boolean {
    return this.employeeId !== null;
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.employeeId = Number(idParam);
      this.employeeService.getById(this.employeeId).subscribe((employee) => {
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

  onSubmit(): void {
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

    this.saving = true;

    const request$ = this.isEditMode
      ? this.employeeService.update(this.employeeId!, { ...dto, statut: raw.statut! })
      : this.employeeService.create(dto);

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe((employee) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode ? 'Employé modifié' : 'Employé créé',
          life: 4000
        });
        this.form.markAsPristine();
        this.router.navigate(['/employees', employee.id]);
      });
  }
}
