import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AnalytiquePerimetreComponent } from '../../perimetre/analytique/analytique-perimetre.component';
import { MODULE_PAIE } from '../paie-module';

/** Vue Analytique de la paie : le tableau de bord graphique est partagé par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-paie-analytique',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieAnalytiqueComponent {
  protected readonly module = MODULE_PAIE;
}
