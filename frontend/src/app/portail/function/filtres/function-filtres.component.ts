import { ChangeDetectionStrategy, Component, effect, input, linkedSignal, output, untracked } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { AUCUN_FILTRE_FUNCTION, FunctionFiltres, memesFiltresFunction } from './function-filtres';

@Component({
  selector: 'app-function-filtres',
  imports: [FormField, FormRoot, ButtonComponent],
  template: `
    <form [formRoot]="formulaire" class="app-toolbar">
      <input class="stp-input" type="search" [formField]="formulaire.libelle" aria-label="Libellé de la fonction" autocomplete="off" placeholder="Libellé" />
      <button stp-button variant="text" icon="x" class="app-toolbar__clear" type="button" (click)="reinitialiser()">Réinitialiser</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionFiltresComponent {
  readonly value = input<FunctionFiltres>(AUCUN_FILTRE_FUNCTION);
  readonly valueChange = output<FunctionFiltres>();

  private readonly courant = linkedSignal(() => this.value());
  protected readonly formulaire = form(this.courant, (chemin) => {
    debounce(chemin.libelle, 300);
  });

  constructor() {
    effect(() => {
      const filtres = this.courant();
      untracked(() => {
        if (!memesFiltresFunction(filtres, this.value())) this.valueChange.emit(filtres);
      });
    });
  }

  protected reinitialiser(): void {
    this.formulaire().reset({ ...AUCUN_FILTRE_FUNCTION });
  }
}
