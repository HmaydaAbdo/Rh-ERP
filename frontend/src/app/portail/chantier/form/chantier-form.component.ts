import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { STATUT_CHANTIER_OPTIONS } from '../models/chantier-statut';
import { ChantierService } from '../services/chantier.service';


@Component({
  selector: 'app-chantier-form',
  imports: [FormField, FormRoot, RouterLink, ButtonComponent, FieldErrorComponent, IconComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chantier-form.component.html'
})
export class ChantierFormComponent {
  private readonly chantierService = inject(ChantierService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  protected readonly actifOptions = STATUT_CHANTIER_OPTIONS;

  private readonly chantierId = signal<number | null>(null);
  private readonly version = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.chantierId() !== null);

  private readonly modele = signal({ code: '', designation: '', nom: '', actif: true });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.code, { message: 'Le code est obligatoire.' });
      maxLength(chemin.code, 100, { message: 'Le code ne dépasse pas 100 caractères.' });
      required(chemin.designation, { message: 'La désignation est obligatoire.' });
      maxLength(chemin.designation, 500, { message: 'La désignation ne dépasse pas 500 caractères.' });
      maxLength(chemin.nom, 255, { message: 'Le nom ne dépasse pas 255 caractères.' });
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.chantierId.set(id);
      this.chantierService.getById(id).subscribe((chantier) => {
        this.version.set(chantier.version);
        this.modele.set({ code: chantier.code, designation: chantier.designation, nom: chantier.nom ?? '', actif: chantier.actif });
      });
    }
  }

  private async enregistrer(): Promise<void> {
    const saisie = this.modele();
    const dto = { code: saisie.code, designation: saisie.designation, nom: saisie.nom || null };
    const id = this.chantierId();

    const chantier = await attendreEnregistrement(
      id !== null ? this.chantierService.update(id, { ...dto, actif: saisie.actif, version: this.version()! }) : this.chantierService.create(dto)
    );
    if (!chantier) {
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: id !== null ? 'Chantier modifié' : 'Chantier créé',
      life: 4000
    });
    this.form().reset();
    this.router.navigate(['/chantiers', chantier.id]);
  }
}
