import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AnalytiquePerimetreComponent } from '../../perimetre/analytique/analytique-perimetre.component';
import { MODULE_PAIE } from '../paie-module';

/** Vue Analytique de la paie : le tableau de bord graphique est partagé par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-paie-analytique',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module()" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieAnalytiqueComponent {
  /** Vue intégrée à la conversation (KAN-308) : le raccourci « Voir les cartes » mène à la page, le sélecteur de la vue le remplace. */
  readonly integree = input(false);
  protected readonly module = computed(() => (this.integree() ? { ...MODULE_PAIE, sansRaccourciCartes: true } : MODULE_PAIE));
}
