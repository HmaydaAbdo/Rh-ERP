import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { disabled, form, FormField, FormRoot, max, maxLength, min, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { LazySelectComponent } from '../../../shared/ui/lazy-select/lazy-select.component';
import { NotificationService } from '../../../shared/ui/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { arrondirDemiBas } from '../../../shared/utils/arrondi-nombre';
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
import { Paie } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { BrouillonPaie, ecrireBrouillon, effacerBrouillon, lireBrouillon } from './paie-brouillon';

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
  changeDetection: ChangeDetectionStrategy.OnPush
})
/**
 * Formulaire de bulletin de paie : écran de la page (`/paie/new`, `/paie/:id/edit`) ou, avec `integre`, contenu de la fenêtre de
 * dialogue de la conversation (KAN-310, voir `PaieFormDialogComponent`) : le même composant, sans copie. Dans la conversation,
 * pas d'en-tête ni de navigation : l'enregistrement et l'annulation sont signalés au parent (`enregistre`, `annule`), la
 * création garde un brouillon dans le navigateur et le parent peut demander si une saisie reste à enregistrer.
 */
export class PaieFormComponent {
  /** Vrai dans la fenêtre de dialogue de la conversation. */
  readonly integre = input(false);
  /** Bulletin à modifier dans la fenêtre de dialogue ; absent : création. Sur la page, l'identifiant vient de l'URL. */
  readonly paieIdEntree = input<number | null>(null);
  readonly enregistre = output<Paie>();
  readonly annule = output<void>();

  private readonly paieService = inject(PaieService);
  protected readonly employeeReferenceService = inject(EmployeeReferenceService);
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  protected readonly equipeReferenceService = inject(EquipeReferenceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly paieId = signal<number | null>(null);
  private readonly version = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.paieId() !== null);
  protected readonly loading = signal(false);
  protected readonly erreurChargement = signal(false);
  /** Un brouillon a été remis dans le formulaire à l'ouverture (création dans la conversation). */
  protected readonly brouillonRestaure = signal(false);

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
      for (const jours of [chemin.nombreJoursTravailles, chemin.joursRecuperationOuvrable, chemin.joursRecuperationDimanche]) {
        max(jours, 1000, { message: 'Le maximum est de 1 000 jours.' });
      }
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
      for (const montant of [chemin.salaireMensuel, chemin.primeRoulageOrdinaire, chemin.primeRoulageDimanche, chemin.salaireTotal]) {
        max(montant, 9999999999, { message: 'Le maximum est de 9 999 999 999.' });
      }
      maxLength(chemin.observation, 255, { message: 'L’observation est limitée à 255 caractères.' });
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.paieId.set(id);
      this.charger();
    }
    effect(() => {
      const id = this.paieIdEntree();
      const integre = this.integre();
      untracked(() => {
        if (id !== null) {
          this.paieId.set(id);
          this.charger();
        } else if (integre && this.paieId() === null) {
          this.restaurerBrouillon();
        }
      });
    });
    // Création dans la conversation : la saisie est gardée en brouillon tant qu'elle n'est pas enregistrée.
    effect(() => {
      const saisie = this.modele();
      if (this.integre() && !this.isEditMode()) {
        untracked(() => (this.estVide(saisie) ? effacerBrouillon() : ecrireBrouillon(this.versBrouillon(saisie))));
      }
    });
  }

  /** Vrai quand la fermeture perdrait de la saisie : champs modifiés (modification) ou formulaire non vide (création). */
  saisieNonEnregistree(): boolean {
    return this.isEditMode() ? this.form().dirty() : !this.estVide(this.modele());
  }

  /** Efface la saisie et le brouillon (abandon voulu). */
  abandonner(): void {
    effacerBrouillon();
    this.modele.set(this.saisieVide());
    this.form().reset();
    this.brouillonRestaure.set(false);
  }

  protected effacerBrouillonRestaure(): void {
    this.abandonner();
  }

  private saisieVide(): PaieSaisie {
    return {
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
    };
  }

  private estVide(saisie: PaieSaisie): boolean {
    return Object.values(saisie).every((valeur) => valeur === null || valeur === '');
  }

  private versBrouillon(saisie: PaieSaisie): BrouillonPaie {
    return { ...saisie, periode: toPeriodeString(saisie.periode) ?? null };
  }

  private restaurerBrouillon(): void {
    const brouillon = lireBrouillon();
    if (!brouillon) {
      return;
    }
    const vide = this.saisieVide();
    const restaure = { ...vide } as Record<string, unknown>;
    for (const cle of Object.keys(vide) as (keyof PaieSaisie)[]) {
      const valeur = brouillon[cle];
      if (cle === 'periode') {
        restaure[cle] = typeof valeur === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(valeur) ? fromPeriodeString(valeur) : null;
      } else if (cle === 'observation') {
        restaure[cle] = typeof valeur === 'string' ? valeur.slice(0, 255) : '';
      } else {
        restaure[cle] = typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;
      }
    }
    if (!this.estVide(restaure as unknown as PaieSaisie)) {
      this.modele.set(restaure as unknown as PaieSaisie);
      this.brouillonRestaure.set(true);
    }
  }

  protected charger(): void {
    const id = this.paieId();
    if (id === null) {
      return;
    }
    this.loading.set(true);
    this.erreurChargement.set(false);
    this.paieService.getById(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: (paie) => {
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
      },
      error: () => this.erreurChargement.set(true)
    });
  }

  private async enregistrer(): Promise<void> {
    if (this.loading() || this.erreurChargement()) {
      return;
    }
    const saisie = this.modele();
    const dto = {
      fonctionId: saisie.fonctionId!,
      chantierId: saisie.chantierId!,
      equipeId: saisie.equipeId === 0 ? null : saisie.equipeId,
      nombreJoursTravailles: arrondirDemiBas(saisie.nombreJoursTravailles!),
      joursRecuperationOuvrable: saisie.joursRecuperationOuvrable === null ? null : arrondirDemiBas(saisie.joursRecuperationOuvrable),
      joursRecuperationDimanche: saisie.joursRecuperationDimanche === null ? null : arrondirDemiBas(saisie.joursRecuperationDimanche),
      salaireMensuel: arrondirDemiBas(saisie.salaireMensuel!),
      primeRoulageOrdinaire: saisie.primeRoulageOrdinaire === null ? null : arrondirDemiBas(saisie.primeRoulageOrdinaire),
      primeRoulageDimanche: saisie.primeRoulageDimanche === null ? null : arrondirDemiBas(saisie.primeRoulageDimanche),
      salaireTotal: arrondirDemiBas(saisie.salaireTotal!),
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
    if (this.integre()) {
      if (id === null) {
        effacerBrouillon();
      }
      this.enregistre.emit(paie);
      return;
    }
    this.router.navigate(['/paie', paie.id]);
  }
}
