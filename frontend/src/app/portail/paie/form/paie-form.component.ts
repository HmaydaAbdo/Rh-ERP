import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { NumberInputComponent } from '../../../shared/ui/number-input/number-input.component';
import { PaieService } from '../services/paie.service';

function toPeriodeString(date: Date | null): string | undefined {
  if (!date) {
    return undefined;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function fromPeriodeString(periode: string): Date {
  const [year, month] = periode.split('-').map(Number);
  return new Date(year, month - 1, 1);
}

@Component({
  selector: 'app-paie-form',
  imports: [ReactiveFormsModule, RouterLink, LazySelectComponent, IconComponent, ButtonComponent, MessageComponent, NumberInputComponent, MonthInputComponent],
  templateUrl: './paie-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './paie-form.component.scss'
})
export class PaieFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly paieService = inject(PaieService);
  protected readonly employeeReferenceService = inject(EmployeeReferenceService);
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  protected readonly equipeReferenceService = inject(EquipeReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly paieId = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    employeeId: [null as number | null, Validators.required],
    periode: [null as Date | null, Validators.required],
    fonctionId: [null as number | null, Validators.required],
    chantierId: [null as number | null, Validators.required],
    equipeId: [null as number | null],
    nombreJoursTravailles: [null as number | null, [Validators.required, Validators.min(0)]],
    joursRecuperationOuvrable: [null as number | null],
    joursRecuperationDimanche: [null as number | null],
    salaireMensuel: [null as number | null, [Validators.required, Validators.min(0)]],
    primeRoulageOrdinaire: [null as number | null],
    primeRoulageDimanche: [null as number | null],
    salaireTotal: [null as number | null, [Validators.required, Validators.min(0)]],
    observation: ['']
  });

  protected readonly isEditMode = computed(() => this.paieId() !== null);

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.paieId.set(id);
      this.form.controls.employeeId.disable();
      this.form.controls.periode.disable();

      this.paieService.getById(id).subscribe((paie) => {
        this.form.patchValue({
          employeeId: paie.employee.id,
          periode: fromPeriodeString(paie.periode),
          fonctionId: paie.fonction.id,
          chantierId: paie.chantier.id,
          equipeId: paie.equipe?.id ?? null,
          nombreJoursTravailles: paie.nombreJoursTravailles,
          joursRecuperationOuvrable: paie.joursRecuperationOuvrable,
          joursRecuperationDimanche: paie.joursRecuperationDimanche,
          salaireMensuel: paie.salaireMensuel,
          primeRoulageOrdinaire: paie.primeRoulageOrdinaire,
          primeRoulageDimanche: paie.primeRoulageDimanche,
          salaireTotal: paie.salaireTotal,
          observation: paie.observation ?? ''
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
      fonctionId: raw.fonctionId!,
      chantierId: raw.chantierId!,
      equipeId: raw.equipeId,
      nombreJoursTravailles: raw.nombreJoursTravailles!,
      joursRecuperationOuvrable: raw.joursRecuperationOuvrable,
      joursRecuperationDimanche: raw.joursRecuperationDimanche,
      salaireMensuel: raw.salaireMensuel!,
      primeRoulageOrdinaire: raw.primeRoulageOrdinaire,
      primeRoulageDimanche: raw.primeRoulageDimanche,
      salaireTotal: raw.salaireTotal!,
      observation: raw.observation || null
    };

    this.saving.set(true);

    const request$ = this.isEditMode()
      ? this.paieService.update(this.paieId()!, dto)
      : this.paieService.create({
          ...dto,
          employeeId: raw.employeeId!,
          periode: toPeriodeString(raw.periode)!
        });

    request$
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe((paie) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode() ? 'Bulletin modifié' : 'Bulletin créé',
          life: 4000
        });
        this.form.markAsPristine();
        this.router.navigate(['/paie', paie.id]);
      });
  }
}
