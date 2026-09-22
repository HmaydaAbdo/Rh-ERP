import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { ChantierReference } from '../../../shared/reference-data/chantier-reference.model';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EmployeeReference } from '../../../shared/reference-data/employee-reference.model';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { FunctionReference } from '../../../shared/reference-data/function-reference.model';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
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
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    CalendarModule,
    DropdownModule,
    AutoCompleteModule,
    MessageModule
  ],
  templateUrl: './paie-form.component.html',
  styleUrl: './paie-form.component.scss'
})
export class PaieFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly paieService = inject(PaieService);
  private readonly employeeReferenceService = inject(EmployeeReferenceService);
  private readonly functionReferenceService = inject(FunctionReferenceService);
  private readonly chantierReferenceService = inject(ChantierReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);

  functions: FunctionReference[] = [];
  chantiers: ChantierReference[] = [];
  employeeSuggestions: EmployeeReference[] = [];

  paieId: number | null = null;
  saving = false;

  readonly form = this.fb.group({
    employee: [null as EmployeeReference | null, Validators.required],
    periode: [null as Date | null, Validators.required],
    fonctionId: [null as number | null, Validators.required],
    chantierId: [null as number | null, Validators.required],
    equipe: [''],
    nombreJoursTravailles: [null as number | null, [Validators.required, Validators.min(0)]],
    joursRecuperationOuvrable: [null as number | null],
    joursRecuperationDimanche: [null as number | null],
    salaireMensuel: [null as number | null, [Validators.required, Validators.min(0)]],
    primeRoulageOrdinaire: [null as number | null],
    primeRoulageDimanche: [null as number | null],
    observation: ['']
  });

  get isEditMode(): boolean {
    return this.paieId !== null;
  }

  /** Aperçu local, non soumis : le serveur recalcule et fait foi (salaireTotal n'est jamais saisi). */
  get salaireTotalCalcule(): number {
    const raw = this.form.getRawValue();
    return (raw.salaireMensuel ?? 0) + (raw.primeRoulageOrdinaire ?? 0) + (raw.primeRoulageDimanche ?? 0);
  }

  ngOnInit(): void {
    this.functionReferenceService.list().subscribe((functions) => (this.functions = functions));
    this.chantierReferenceService.listActive().subscribe((chantiers) => (this.chantiers = chantiers));

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.paieId = Number(idParam);
      this.form.controls.employee.disable();
      this.form.controls.periode.disable();

      this.paieService.getById(this.paieId).subscribe((paie) => {
        this.form.patchValue({
          employee: paie.employee,
          periode: fromPeriodeString(paie.periode),
          fonctionId: paie.fonction.id,
          chantierId: paie.chantier.id,
          equipe: paie.equipe ?? '',
          nombreJoursTravailles: paie.nombreJoursTravailles,
          joursRecuperationOuvrable: paie.joursRecuperationOuvrable,
          joursRecuperationDimanche: paie.joursRecuperationDimanche,
          salaireMensuel: paie.salaireMensuel,
          primeRoulageOrdinaire: paie.primeRoulageOrdinaire,
          primeRoulageDimanche: paie.primeRoulageDimanche,
          observation: paie.observation ?? ''
        });
      });
    }
  }

  rechercherEmployes(event: AutoCompleteCompleteEvent): void {
    this.employeeReferenceService
      .rechercherParNom(event.query)
      .subscribe((suggestions) => (this.employeeSuggestions = suggestions));
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const dto = {
      fonctionId: raw.fonctionId!,
      chantierId: raw.chantierId!,
      equipe: raw.equipe || null,
      nombreJoursTravailles: raw.nombreJoursTravailles!,
      joursRecuperationOuvrable: raw.joursRecuperationOuvrable,
      joursRecuperationDimanche: raw.joursRecuperationDimanche,
      salaireMensuel: raw.salaireMensuel!,
      primeRoulageOrdinaire: raw.primeRoulageOrdinaire,
      primeRoulageDimanche: raw.primeRoulageDimanche,
      observation: raw.observation || null
    };

    this.saving = true;

    const request$ = this.isEditMode
      ? this.paieService.update(this.paieId!, dto)
      : this.paieService.create({
          ...dto,
          employeeId: raw.employee!.id,
          periode: toPeriodeString(raw.periode)!
        });

    request$
      .pipe(finalize(() => (this.saving = false)))
      .subscribe((paie) => {
        this.messageService.add({
          severity: 'success',
          summary: this.isEditMode ? 'Bulletin modifié' : 'Bulletin créé',
          life: 4000
        });
        this.router.navigate(['/paie', paie.id]);
      });
  }
}
