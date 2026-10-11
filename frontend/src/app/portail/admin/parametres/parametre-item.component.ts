import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
import { disabled, form, FormField, FormRoot, required, validate } from '@angular/forms/signals';

import { attendreEnregistrement } from '../../../shared/forms/soumission';
import { focaliserPremiereErreur } from '../../../shared/forms/focus-first-error';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { FieldErrorComponent } from '../../../shared/ui/field-error/field-error.component';
import { Parametre, ParametreService } from '../services/parametre.service';

@Component({
  selector: 'app-parametre-item',
  imports: [FormField, FormRoot, ButtonComponent, FieldErrorComponent],
  template: `
    <section class="parametre-item">
      <div class="parametre-item__description">
        <h2>{{ parametre().libelle }}</h2>
        <p>{{ parametre().description }}</p>
      </div>
      <form [formRoot]="form" class="parametre-item__form">
        <div class="field">
          <label [for]="'parametre-' + parametre().id">Valeur @if (parametre().unite) { ({{ parametre().unite }}) }</label>
          <input
            class="stp-input"
            [id]="'parametre-' + parametre().id"
            type="text"
            [attr.inputmode]="parametre().type === 'ENTIER' ? 'numeric' : 'text'"
            [attr.placeholder]="parametre().type === 'CRON' ? '0 0 23 * * *' : null"
            autocomplete="off"
            spellcheck="false"
            [formField]="form.valeur"
          />
          <stp-field-error [field]="form.valeur" />
          @if (parametre().type === 'ENTIER' && parametre().minimum !== null && parametre().maximum !== null) {
            <small class="parametre-item__hint">Valeur comprise entre {{ parametre().minimum }} et {{ parametre().maximum }}.</small>
          } @else if (parametre().type === 'CRON') {
            <small class="parametre-item__hint">Expression Spring à six champs, secondes comprises.</small>
          }
        </div>
        @if (editable()) {
          <button stp-button type="submit" [loading]="form().submitting()">Enregistrer</button>
        }
      </form>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './parametre-item.component.scss'
})
export class ParametreItemComponent implements OnInit {
  private readonly parametreService = inject(ParametreService);
  readonly parametre = input.required<Parametre>();
  readonly editable = input(false);
  readonly saved = output<Parametre>();

  private readonly saisie = signal({ valeur: '' });
  protected readonly form = form(
    this.saisie,
    (chemin) => {
      disabled(chemin.valeur, () => !this.editable());
      required(chemin.valeur, { message: 'La valeur est obligatoire.' });
      validate(chemin.valeur, ({ value }) => {
        const parametre = this.parametre();
        if (parametre.type !== 'ENTIER' || value().trim() === '') {
          return undefined;
        }
        const nombre = Number(value());
        if (!Number.isInteger(nombre) || (parametre.minimum !== null && nombre < parametre.minimum) || (parametre.maximum !== null && nombre > parametre.maximum)) {
          return { kind: 'bornes', message: `Saisissez un entier compris entre ${parametre.minimum} et ${parametre.maximum}.` };
        }
        return undefined;
      });
    },
    { submission: { action: () => this.enregistrer(), onInvalid: (formulaire) => focaliserPremiereErreur(formulaire) } }
  );

  ngOnInit(): void {
    this.saisie.set({ valeur: this.parametre().valeur });
  }

  private async enregistrer(): Promise<void> {
    const parametre = this.parametre();
    const resultat = await attendreEnregistrement(this.parametreService.update(parametre.id, { valeur: this.saisie().valeur }));
    if (resultat) {
      this.saisie.set({ valeur: resultat.valeur });
      this.form().reset();
      this.saved.emit(resultat);
    }
  }
}
