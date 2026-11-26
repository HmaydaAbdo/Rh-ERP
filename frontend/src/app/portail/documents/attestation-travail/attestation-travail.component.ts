import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { form, FormField, FormRoot, required } from '@angular/forms/signals';
import { finalize } from 'rxjs';

import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { LazySelectComponent } from '../../../shared/ui/lazy-select/lazy-select.component';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { telechargerFichier } from '../../../shared/utils/telecharger-fichier';
import { Civilite, CIVILITE_OPTIONS, Employee } from '../../employee/models/employee.model';
import { EmployeeService } from '../../employee/services/employee.service';

interface DemandeAttestation {
  employeeId: number | null;
  civilite: Civilite | null;
}

/** Ce qui empêche d'attester, dans les mots du serveur : l'attestation dit « travaille… jusqu'à ce jour ». */
export function raisonsAttestationImpossible(employe: Employee): string[] {
  const raisons: string[] = [];
  if (employe.statut !== 'ACTIF') raisons.push('l’employé n’est plus en poste');
  if (!employe.matriculeCnss) raisons.push('le matricule CNSS n’est pas renseigné');
  if (!employe.dateDeclarationCnss) raisons.push('la date de déclaration CNSS n’est pas renseignée');
  return raisons;
}

/**
 * Attestation de travail (KAN-320) : l'employé se cherche par nom ou CIN, sa fiche montre ce qui sera imprimé, la civilité
 * se choisit (proposée depuis la fiche, puis conservée par le serveur). Le PDF s'ouvre dans un nouvel onglet pour
 * l'impression, ou se télécharge si le navigateur bloque l'onglet.
 */
@Component({
  selector: 'app-attestation-travail',
  imports: [DatePipe, FormField, FormRoot, ButtonComponent, FieldErrorComponent, LazySelectComponent, MessageComponent, SelectComponent],
  templateUrl: './attestation-travail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttestationTravailComponent {
  protected readonly employes = inject(EmployeeReferenceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly notifications = inject(NotificationService);

  protected readonly civiliteOptions = CIVILITE_OPTIONS;
  protected readonly impression = signal(false);

  private readonly modele = signal<DemandeAttestation>({ employeeId: null, civilite: null });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.employeeId, { message: 'Choisissez un employé.' });
      required(chemin.civilite, { message: 'Choisissez la civilité.' });
    },
    { submission: { action: async () => this.imprimer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  /** La fiche complète de l'employé choisi : ce que l'attestation imprimera. */
  protected readonly fiche = rxResource({
    params: () => this.modele().employeeId ?? undefined,
    stream: ({ params }) => this.employeeService.getById(params)
  });
  protected readonly raisons = computed(() => {
    const employe = this.fiche.value();
    return employe ? raisonsAttestationImpossible(employe) : [];
  });

  constructor() {
    // La civilité déjà connue de la fiche est proposée ; l'utilisateur peut la changer avant d'imprimer.
    effect(() => {
      const employe = this.fiche.value();
      if (employe) {
        untracked(() => this.form.civilite().value.set(employe.civilite));
      }
    });
  }

  private imprimer(): void {
    const { employeeId, civilite } = this.modele();
    const employe = this.fiche.value();
    if (employeeId === null || civilite === null || !employe || this.raisons().length > 0) {
      return;
    }
    this.impression.set(true);
    this.employeeService
      .attestationTravail(employeeId, civilite)
      .pipe(finalize(() => this.impression.set(false)))
      .subscribe({
        next: (pdf) => {
          const nom = `Attestation_de_travail_${employe.cin}.pdf`;
          const url = window.URL.createObjectURL(pdf);
          const onglet = window.open(url, '_blank');
          if (onglet === null) {
            telechargerFichier(pdf, nom);
          }
          setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
          this.notifications.add({ severity: 'success', summary: 'Attestation de travail prête', detail: employe.nomPrenom, life: 4000 });
        },
        error: () => this.notifications.add({ severity: 'error', summary: 'L’attestation n’a pas pu être générée.' })
      });
  }
}
