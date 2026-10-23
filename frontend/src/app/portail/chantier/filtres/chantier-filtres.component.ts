import { ChangeDetectionStrategy, Component, effect, input, linkedSignal, output, untracked } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';

import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { STATUT_CHANTIER_OPTIONS } from '../models/chantier-statut';
import { AUCUN_FILTRE_CHANTIER, ChantierFiltres, memesFiltresChantier } from './chantier-filtres';

const DEBOUNCE_RECHERCHE_MS = 300;

/**
 * Barre de filtres commune aux vues des chantiers : code, désignation et statut. La valeur vient de la page (`value`, l'URL),
 * chaque changement est émis (`valueChange`, les saisies de texte après un court délai) et c'est la page qui le met dans l'URL.
 */
@Component({
  selector: 'app-chantier-filtres',
  imports: [FormField, FormRoot, SelectComponent, ButtonComponent],
  template: `
    <form [formRoot]="formulaire" class="app-toolbar">
      <input class="stp-input" type="search" [formField]="formulaire.code" aria-label="Code" autocomplete="off" spellcheck="false" placeholder="Code" />
      <input class="stp-input" type="search" [formField]="formulaire.designation" aria-label="Désignation" autocomplete="off" placeholder="Désignation" />
      <stp-select [formField]="formulaire.actif" [options]="statutOptions" ariaLabel="Statut" placeholder="Statut"></stp-select>
      <button stp-button variant="text" icon="x" class="app-toolbar__clear" type="button" (click)="reinitialiser()">Réinitialiser</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierFiltresComponent {
  readonly value = input<ChantierFiltres>(AUCUN_FILTRE_CHANTIER);
  readonly valueChange = output<ChantierFiltres>();

  protected readonly statutOptions = STATUT_CHANTIER_OPTIONS;

  private readonly courant = linkedSignal(() => this.value());
  protected readonly formulaire = form(this.courant, (chemin) => {
    debounce(chemin.code, DEBOUNCE_RECHERCHE_MS);
    debounce(chemin.designation, DEBOUNCE_RECHERCHE_MS);
  });

  constructor() {
    effect(() => {
      const filtres = this.courant();
      untracked(() => {
        if (!memesFiltresChantier(filtres, this.value())) this.valueChange.emit(filtres);
      });
    });
  }

  protected reinitialiser(): void {
    this.formulaire().reset({ ...AUCUN_FILTRE_CHANTIER });
  }
}
