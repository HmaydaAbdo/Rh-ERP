import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { moduleFunction } from '../function-module';
import { FunctionService } from '../services/function.service';

/** Vue Cartes des fonctions : la hiérarchie Fonction → Chantier → Équipe est configurée par le domaine. */
@Component({
  selector: 'app-function-cartes',
  imports: [CartesPerimetreComponent],
  template: '<app-cartes-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionCartesComponent {
  protected readonly module = moduleFunction(inject(FunctionService));
}
