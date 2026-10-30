import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormField, FormRoot, disabled, form, min, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { MessageComponent } from '../../../shared/ui/message/message.component';
import { MonthInputComponent } from '../../../shared/ui/month-input/month-input.component';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { NumberInputComponent } from '../../../shared/ui/number-input/number-input.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { HeuresSupp } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';

interface SaisieHeuresSupp {
  employeeId: number | null;
  periode: Date | null;
  chantierId: number | null;
  heuresSupplementaires: number | null;
  forfaitDh: number | null;
}

function periodeDate(periode: string): Date {
  const [annee, mois] = periode.split('-').map(Number);
  return new Date(annee, mois - 1, 1);
}

function periodeTexte(periode: Date | null): string | null {
  return periode ? `${periode.getFullYear()}-${String(periode.getMonth() + 1).padStart(2, '0')}` : null;
}

@Component({
  selector: 'app-heures-supp-form',
  imports: [DecimalPipe, FormField, FormRoot, RouterLink, LazySelectComponent, MessageComponent, MonthInputComponent, ButtonComponent, FieldErrorComponent, IconComponent, NumberInputComponent],
  templateUrl: './heures-supp-form.component.html',
  styleUrl: './heures-supp-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppFormComponent {
  protected readonly employes = inject(EmployeeReferenceService);
  protected readonly chantiers = inject(ChantierReferenceService);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly ligne = signal<HeuresSupp | null>(null);
  protected readonly id = signal<number | null>(null);
  protected readonly edition = computed(() => this.id() !== null);

  private readonly modele = signal<SaisieHeuresSupp>({
    employeeId: null,
    periode: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    chantierId: null,
    heuresSupplementaires: null,
    forfaitDh: null
  });
  readonly form = form(this.modele, (chemin) => {
    required(chemin.employeeId, { message: 'Choisissez un employé.' });
    required(chemin.periode, { message: 'Choisissez un mois.' });
    required(chemin.chantierId, { message: 'Choisissez un chantier.' });
    min(chemin.heuresSupplementaires, 0, { message: 'Les heures ne peuvent pas être négatives.' });
    min(chemin.forfaitDh, 0, { message: 'Le forfait ne peut pas être négatif.' });
    disabled(chemin.forfaitDh, () => this.ligne()?.stcOuSortie ?? false);
  });

  private readonly service = inject(HeuresSuppService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (Number.isInteger(id) && id > 0) {
      this.id.set(id);
      this.charger(id);
    }
  }

  protected charger(id: number): void {
    this.loading.set(true);
    this.service.get(id).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (ligne) => {
        this.ligne.set(ligne);
        this.modele.set({ employeeId: ligne.employeeId, periode: periodeDate(ligne.periode), chantierId: ligne.chantierId,
          heuresSupplementaires: ligne.heuresSupplementaires, forfaitDh: ligne.forfaitDh });
      },
      error: () => this.erreur.set('Cette ligne n’a pas pu être chargée. Revenez à la liste et réessayez.')
    });
  }

  protected enregistrer(): void {
    if (this.modele().heuresSupplementaires === null && this.modele().forfaitDh === null) {
      this.erreur.set('Saisissez des heures supplémentaires ou un forfait.');
      return;
    }
    if (!this.form().valid()) {
      this.form().markAsTouched();
      return;
    }
    const saisie = this.modele();
    const periode = periodeTexte(saisie.periode);
    if (!periode || saisie.employeeId === null || saisie.chantierId === null) return;
    this.saving.set(true);
    const requete = this.ligne()
      ? this.service.modifier(this.ligne()!.id, { version: this.ligne()!.version, heuresSupplementaires: saisie.heuresSupplementaires, forfaitDh: saisie.forfaitDh })
      : this.service.creer({ employeeId: saisie.employeeId, periode, chantierId: saisie.chantierId, heuresSupplementaires: saisie.heuresSupplementaires, forfaitDh: saisie.forfaitDh });
    requete.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.form().reset();
        void this.router.navigate(['/heures-supp'], { queryParams: { periode } });
      },
      error: (e: { error?: { message?: string } }) => this.erreur.set(e.error?.message ?? 'La ligne n’a pas pu être enregistrée. Vérifiez la paie du mois, les doublons et les valeurs saisies.')
    });
  }
}
