import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, FormRoot, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { IconComponent } from '../../../shared/ui/icon/icon.component';
import { FunctionService } from '../services/function.service';

@Component({
  selector: 'app-function-form',
  imports: [FormField, FormRoot, RouterLink, ButtonComponent, FieldErrorComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './function-form.component.html'
})
export class FunctionFormComponent {
  private readonly functionService = inject(FunctionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messageService = inject(NotificationService);

  private readonly functionId = signal<number | null>(null);
  protected readonly isEditMode = computed(() => this.functionId() !== null);

  private readonly modele = signal({ libelle: '' });
  protected readonly form = form(
    this.modele,
    (chemin) => {
      required(chemin.libelle, { message: 'Le libellé est obligatoire.' });
      maxLength(chemin.libelle, 100, { message: 'Le libellé ne dépasse pas 100 caractères.' });
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.functionId.set(id);
      this.functionService.getById(id).subscribe((fonction) => this.modele.set({ libelle: fonction.libelle }));
    }
  }

  private async enregistrer(): Promise<void> {
    const dto = { libelle: this.modele().libelle };
    const id = this.functionId();

    const fonction = await attendreEnregistrement(id !== null ? this.functionService.update(id, dto) : this.functionService.create(dto));
    if (!fonction) {
      return;
    }
    this.messageService.add({
      severity: 'success',
      summary: id !== null ? 'Fonction modifiée' : 'Fonction créée',
      life: 4000
    });
    this.form().reset();
    this.router.navigate(['/functions', fonction.id]);
  }
}
