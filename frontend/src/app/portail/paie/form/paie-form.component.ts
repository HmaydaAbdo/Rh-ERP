import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { disabled, form, FormField, FormRoot, min, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
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

interface PaieSaisie {
  employeeId: number | null;
  periode: Date | null;
  fonctionId: number | null;
  chantierId: number | null;
  equipeId: number | null;
  nombreJoursTravailles: number | null;
  joursRecuperationOuvrable: number | null;
  joursRecuperationDimanche: number | null;
  salaireMensuel: number | null;
  primeRoulageOrdinaire: number | null;
  primeRoulageDimanche: number | null;
  salaireTotal: number | null;
  observation: string;
}

@Component({
  selector: 'app-paie-form',
  imports: [
    FormField,
    FormRoot,
    RouterLink,
    LazySelectComponent,
    IconComponent,
    ButtonComponent,
    FieldErrorComponent,
    MessageComponent,
    NumberInputComponent,
    MonthInputComponent
  ],
  templateUrl: './paie-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './paie-form.component.scss'
})
export class PaieFormComponent {
  private readonly paieService = inject(PaieService);
  protected readonly employeeReferenceService = inject(EmployeeReferenceService);
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  protected readonly equipeReferenceService = inject(EquipeReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly paieId = signal<number | null>(null);
  private readonly version = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.paieId() !== null);

  private readonly modele = signal<PaieSaisie>({
    employeeId: null,
    periode: null,
    fonctionId: null,
    chantierId: null,
    equipeId: null,
    nombreJoursTravailles: null,
    joursRecuperationOuvrable: null,
    joursRecuperationDimanche: null,
    salaireMensuel: null,
    primeRoulageOrdinaire: null,
    primeRoulageDimanche: null,
    salaireTotal: null,
    observation: ''
  });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      // L'employé et la période ne se modifient plus après création : un bulletin est un document historique.
      disabled(chemin.employeeId, () => this.isEditMode());
      disabled(chemin.periode, () => this.isEditMode());
      required(chemin.employeeId, { message: "L'employé est obligatoire." });
      required(chemin.periode, { message: 'La période est obligatoire.' });
      required(chemin.fonctionId, { message: 'La fonction est obligatoire.' });
      required(chemin.chantierId, { message: 'Le chantier est obligatoire.' });
      required(chemin.nombreJoursTravailles, { message: 'Le nombre de jours travaillés est obligatoire.' });
      required(chemin.salaireMensuel, { message: 'Le salaire mensuel est obligatoire.' });
      required(chemin.salaireTotal, { message: 'Le salaire total est obligatoire.' });
      for (const montant of [
        chemin.nombreJoursTravailles,
        chemin.joursRecuperationOuvrable,
        chemin.joursRecuperationDimanche,
        chemin.salaireMensuel,
        chemin.primeRoulageOrdinaire,
        chemin.primeRoulageDimanche,
        chemin.salaireTotal
      ]) {
        min(montant, 0, { message: 'La valeur ne peut pas être négative.' });
      }
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.paieId.set(id);

      this.paieService.getById(id).subscribe((paie) => {
        this.version.set(paie.version);
        this.modele.set({
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

  private async enregistrer(): Promise<void> {
    const saisie = this.modele();
    const dto = {
      fonctionId: saisie.fonctionId!,
      chantierId: saisie.chantierId!,
      equipeId: saisie.equipeId,
      nombreJoursTravailles: saisie.nombreJoursTravailles!,
      joursRecuperationOuvrable: saisie.joursRecuperationOuvrable,
      joursRecuperationDimanche: saisie.joursRecuperationDimanche,
      salaireMensuel: saisie.salaireMensuel!,
      primeRoulageOrdinaire: saisie.primeRoulageOrdinaire,
      primeRoulageDimanche: saisie.primeRoulageDimanche,
      salaireTotal: saisie.salaireTotal!,
      observation: saisie.observation || null
    };
    const id = this.paieId();

    const paie = await attendreEnregistrement(
      id !== null
        ? this.paieService.update(id, { ...dto, version: this.version()! })
        : this.paieService.create({ ...dto, employeeId: saisie.employeeId!, periode: toPeriodeString(saisie.periode)! })
    );
    if (!paie) {
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: id !== null ? 'Bulletin modifié' : 'Bulletin créé',
      life: 4000
    });
    this.form().reset();
    this.router.navigate(['/paie', paie.id]);
  }
}
