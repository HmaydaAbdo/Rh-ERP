import { ChangeDetectionStrategy, Component, effect, input, linkedSignal, output, untracked } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { AUCUN_FILTRE_EQUIPE, EquipeFiltres, memesFiltresEquipe } from './equipe-filtres';

@Component({
  selector: 'app-equipe-filtres',
  imports: [FormField, FormRoot, ButtonComponent],
  template: `
    <form [formRoot]="formulaire" class="app-toolbar">
      <input class="stp-input" type="search" [formField]="formulaire.code" aria-label="Code de l’équipe" autocomplete="off" spellcheck="false" placeholder="Code" />
      <input class="stp-input" type="search" [formField]="formulaire.libelle" aria-label="Libellé de l’équipe" autocomplete="off" placeholder="Libellé" />
      <button stp-button variant="text" icon="x" class="app-toolbar__clear" type="button" (click)="reinitialiser()">Réinitialiser</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeFiltresComponent {
  readonly value = input<EquipeFiltres>(AUCUN_FILTRE_EQUIPE);
  readonly valueChange = output<EquipeFiltres>();

  private readonly courant = linkedSignal(() => this.value());
  protected readonly formulaire = form(this.courant, (chemin) => {
    debounce(chemin.code, 300);
    debounce(chemin.libelle, 300);
  });

  constructor() {
    effect(() => {
      const filtres = this.courant();
      untracked(() => {
        if (!memesFiltresEquipe(filtres, this.value())) this.valueChange.emit(filtres);
      });
    });
  }

  protected reinitialiser(): void {
    this.formulaire().reset({ ...AUCUN_FILTRE_EQUIPE });
  }
}
