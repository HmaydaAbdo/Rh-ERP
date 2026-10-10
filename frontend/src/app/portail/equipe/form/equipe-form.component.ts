import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { EquipeService } from '../services/equipe.service';

@Component({
  selector: 'app-equipe-form',
  imports: [FormField, FormRoot, RouterLink, ButtonComponent, FieldErrorComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equipe-form.component.html'
})
export class EquipeFormComponent {
  private readonly equipeService = inject(EquipeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly equipeId = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.equipeId() !== null);

  private readonly modele = signal({ code: '', libelle: '' });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.code, { message: 'Le code est obligatoire.' });
      maxLength(chemin.code, 50, { message: 'Le code ne dépasse pas 50 caractères.' });
      required(chemin.libelle, { message: 'Le libellé est obligatoire.' });
      maxLength(chemin.libelle, 100, { message: 'Le libellé ne dépasse pas 100 caractères.' });
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.equipeId.set(id);
      this.equipeService.getById(id).subscribe((equipe) => this.modele.set({ code: equipe.code, libelle: equipe.libelle }));
    }
  }

  private async enregistrer(): Promise<void> {
    const dto = this.modele();
    const id = this.equipeId();

    const equipe = await attendreEnregistrement(id !== null ? this.equipeService.update(id, dto) : this.equipeService.create(dto));
    if (!equipe) {
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: id !== null ? 'Équipe modifiée' : 'Équipe créée',
      life: 4000
    });
    this.form().reset();
    this.router.navigate(['/equipes', equipe.id]);
  }
}
