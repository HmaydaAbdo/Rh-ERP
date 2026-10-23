import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AnalytiquePerimetreComponent } from '../../perimetre/analytique/analytique-perimetre.component';
import { MODULE_EMPLOYE } from '../employee-module';

/** Vue Analytique des employés : le tableau de bord graphique est partagé par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-employee-analytique',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeAnalytiqueComponent {
  protected readonly module = MODULE_EMPLOYE;
}
