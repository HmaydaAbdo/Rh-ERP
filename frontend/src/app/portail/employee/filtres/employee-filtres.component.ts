import { ChangeDetectionStrategy, Component, effect, inject, input, linkedSignal, output, untracked } from '@angular/core';
import { debounce, form, FormField, FormRoot } from '@angular/forms/signals';

import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { ButtonComponent } from '../../../shared/ui/button/button.directive';
import { SelectComponent } from '../../../shared/ui/select/select.component';
import { STATUT_EMPLOYE_OPTIONS } from '../models/employee-statut';
import { AUCUN_FILTRE, EmployeeFiltres, memesFiltres } from './employee-filtres';

const DEBOUNCE_RECHERCHE_MS = 300;

/**
 * Barre de filtres commune aux vues des employés : nom, CIN, fonctions, chantiers, équipes et statut. Le composant n'a pas d'état propre
 * au-delà de ce qu'il affiche : la valeur vient de la page (`value`, l'URL), chaque changement est émis (`valueChange`, les
 * saisies de texte après un court délai) et c'est la page qui le met dans l'URL.
 */
@Component({
  selector: 'app-employee-filtres',
  imports: [FormField, FormRoot, LazySelectComponent, SelectComponent, ButtonComponent],
  template: `
    <form [formRoot]="formulaire" class="app-toolbar">
      <input class="stp-input" type="text" [formField]="formulaire.nomPrenom" aria-label="Nom &amp; prénom" autocomplete="off" placeholder="Nom &amp; prénom" />
      <input class="stp-input" type="text" [formField]="formulaire.cin" aria-label="CIN" autocomplete="off" spellcheck="false" placeholder="CIN" />

      <app-lazy-select
        [formField]="formulaire.fonctionIds"
        [multiple]="true"
        [source]="functionReferenceService"
        optionLabel="libelle"
        ariaLabel="Fonction"
        placeholder="Fonction"
      ></app-lazy-select>

      <app-lazy-select
        [formField]="formulaire.chantierIds"
        [multiple]="true"
        [source]="chantierReferenceService"
        optionLabel="code"
        ariaLabel="Chantier"
        placeholder="Chantier"
      ></app-lazy-select>

      <app-lazy-select
        [formField]="formulaire.equipeIds"
        [multiple]="true"
        [source]="equipeReferenceService"
        optionLabel="code"
        ariaLabel="Équipe"
        placeholder="Équipe"
      ></app-lazy-select>

      <stp-select [formField]="formulaire.statut" [options]="statutOptions" ariaLabel="Statut" placeholder="Statut"></stp-select>

      <button stp-button variant="text" icon="x" class="app-toolbar__clear" type="button" (click)="reinitialiser()">Réinitialiser</button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeFiltresComponent {
  protected readonly functionReferenceService = inject(FunctionReferenceService);
  protected readonly chantierReferenceService = inject(ChantierReferenceService);
  protected readonly equipeReferenceService = inject(EquipeReferenceService);

  /** Les filtres affichés : ils viennent de la page (l'URL), le composant les émet à chaque changement (`valueChange`). */
  readonly value = input<EmployeeFiltres>(AUCUN_FILTRE);
  readonly valueChange = output<EmployeeFiltres>();

  protected readonly statutOptions = STATUT_EMPLOYE_OPTIONS;

  /** Les filtres courants : ceux de la page, tant que l'utilisateur n'en a pas changé un. */
  private readonly courant = linkedSignal<EmployeeFiltres>(() => this.value());

  /** Le formulaire édite directement les filtres courants : une saisie de texte n'y arrive qu'après un court délai. */
  protected readonly formulaire = form(this.courant, (chemin) => {
    debounce(chemin.nomPrenom, DEBOUNCE_RECHERCHE_MS);
    debounce(chemin.cin, DEBOUNCE_RECHERCHE_MS);
  });

  constructor() {
    // Un champ modifié par l'utilisateur change les filtres courants : la page en est prévenue (pas l'écho de sa propre valeur).
    effect(() => {
      const filtres = this.courant();
      untracked(() => {
        if (!memesFiltres(filtres, this.value())) {
          this.valueChange.emit(filtres);
        }
      });
    });
  }

  protected reinitialiser(): void {
    this.formulaire().reset({ ...AUCUN_FILTRE });
  }
}
