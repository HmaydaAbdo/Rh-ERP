import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AnalytiquePerimetreComponent } from '../../perimetre/analytique/analytique-perimetre.component';
import { moduleFunction } from '../function-module';
import { FunctionService } from '../services/function.service';

/** Vue Analytique des fonctions : le tableau de bord graphique est partagé par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-function-analytique',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionAnalytiqueComponent {
  protected readonly module = moduleFunction(inject(FunctionService));
}
