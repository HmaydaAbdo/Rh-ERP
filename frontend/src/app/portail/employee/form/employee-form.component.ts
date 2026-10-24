import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, min, required, validate } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/services/auth.service';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { DateInputComponent } from '../../../shared/ui/date-input/date-input.component';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { NumberInputComponent } from '../../../shared/ui/number-input/number-input.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { EmployeeStatut, TypeSalaire } from '../models/employee.model';
import { STATUT_EMPLOYE_OPTIONS } from '../models/employee-statut';
import { EmployeeService } from '../services/employee.service';

const TYPE_SALAIRE_OPTIONS: { label: string; value: TypeSalaire }[] = [
  { label: 'Mensuel', value: 'MENSUEL' },
  { label: 'Journalier (tarif d’une journée)', value: 'JOURNALIER' }
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

interface EmployeeSaisie {
  nomPrenom: string;
  cin: string;
  dateNaissance: Date | null;
  dateEmbauche: Date | null;
  fonctionId: number | null;
  chantierId: number | null;
  equipeId: number | null;
  salaire: number | null;
  typeSalaire: TypeSalaire | null;
  statut: EmployeeStatut;
}

@Component({
  selector: 'app-employee-form',
  imports: [FormField, FormRoot, RouterLink, LazySelectComponent, ButtonComponent, FieldErrorComponent, IconComponent, SelectComponent, DateInputComponent, NumberInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employee-form.component.html'
})
export class EmployeeFormComponent {
  private readonly employeeService = inject(EmployeeService);
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  protected readonly equipeReferenceService = inject(EquipeReferenceService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  protected readonly statutOptions = STATUT_EMPLOYE_OPTIONS;
  protected readonly typeSalaireOptions = TYPE_SALAIRE_OPTIONS;
  /** Le salaire est une donnée de paie : ses champs ne sont proposés qu'à qui a `PAIE_READ` (le serveur ignore sinon ce qui est saisi). */
  protected readonly voitLaPaie = computed(() => this.authService.hasPermission('PAIE_READ'));

  private readonly employeeId = signal<number | null>(null);
  private readonly version = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.employeeId() !== null);
  protected readonly estInactif = computed(() => this.modele().statut === 'INACTIF');

  private readonly modele = signal<EmployeeSaisie>({
    nomPrenom: '',
    cin: '',
    dateNaissance: null,
    dateEmbauche: null,
    fonctionId: null,
    chantierId: null,
    equipeId: null,
    salaire: null,
    typeSalaire: null,
    statut: 'ACTIF'
  });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.nomPrenom, { message: 'Le nom et prénom sont obligatoires.' });
      maxLength(chemin.nomPrenom, 150, { message: 'Le nom et prénom ne dépassent pas 150 caractères.' });
      required(chemin.cin, { message: 'Le CIN est obligatoire.' });
      maxLength(chemin.cin, 30, { message: 'Le CIN ne dépasse pas 30 caractères.' });
      required(chemin.dateNaissance, { message: 'La date de naissance est obligatoire.' });
      required(chemin.dateEmbauche, { message: "La date d'embauche est obligatoire." });
      required(chemin.fonctionId, { message: 'La fonction est obligatoire.' });
      validate(chemin.chantierId, ({ value, valueOf }) =>
        valueOf(chemin.statut) !== 'INACTIF' && value() === null
          ? { kind: 'required', message: 'Le chantier est obligatoire.' }
          : undefined
      );
      min(chemin.salaire, 0, { message: 'Le salaire ne peut pas être négatif.' });
      // Le salaire et son type vont ensemble : l'un sans l'autre ne dit pas combien l'employé est payé.
      validate(chemin.typeSalaire, ({ value, valueOf }) =>
        (value() === null) !== (valueOf(chemin.salaire) === null)
          ? { kind: 'salaireEtType', message: 'Renseignez le salaire et son type ensemble.' }
          : undefined
      );
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.employeeId.set(id);
      this.employeeService.getById(id).subscribe((employee) => {
        this.version.set(employee.version);
        this.modele.set({
          nomPrenom: employee.nomPrenom,
          cin: employee.cin,
          dateNaissance: fromIsoDate(employee.dateNaissance),
          dateEmbauche: fromIsoDate(employee.dateEmbauche),
          fonctionId: employee.fonction.id,
          chantierId: employee.chantier?.id ?? null,
          equipeId: employee.equipe?.id ?? null,
          salaire: employee.salaire,
          typeSalaire: employee.typeSalaire,
          statut: employee.statut
        });
      });
    }
  }

  private async enregistrer(): Promise<void> {
    const saisie = this.modele();
    const dto = {
      nomPrenom: saisie.nomPrenom,
      cin: saisie.cin,
      dateNaissance: toIsoDate(saisie.dateNaissance!),
      dateEmbauche: toIsoDate(saisie.dateEmbauche!),
      fonctionId: saisie.fonctionId!,
      salaire: saisie.salaire,
      typeSalaire: saisie.typeSalaire
    };
    const id = this.employeeId();

    const employee = await attendreEnregistrement(
      id !== null
        ? this.employeeService.update(id, {
            ...dto,
            chantierId: saisie.statut === 'INACTIF' ? null : saisie.chantierId!,
            equipeId: saisie.statut === 'INACTIF' || saisie.equipeId === 0 ? null : saisie.equipeId,
            statut: saisie.statut,
            version: this.version()!
          })
        : this.employeeService.create({ ...dto, chantierId: saisie.chantierId!, equipeId: saisie.equipeId === 0 ? null : saisie.equipeId })
    );
    if (!employee) {
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: id !== null ? 'Employé modifié' : 'Employé créé',
      life: 4000
    });
    this.form().reset();
    this.router.navigate(['/employees', employee.id]);
  }
}
