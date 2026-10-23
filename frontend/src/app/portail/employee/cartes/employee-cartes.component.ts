import { ChangeDetectionStrategy, Component } from '@angular/core';

import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { MODULE_EMPLOYE } from '../employee-module';

/** Vue Cartes des employés : la descente libre par niveaux est partagée par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-employee-cartes',
  imports: [CartesPerimetreComponent],
  template: '<app-cartes-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeCartesComponent {
  protected readonly module = MODULE_EMPLOYE;
}
