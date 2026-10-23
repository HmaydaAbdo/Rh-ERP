import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { moduleFunction } from '../function-module';
import { FunctionService } from '../services/function.service';

/** Vue Cartes des fonctions : la descente libre par niveaux est partagée par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-function-cartes',
  imports: [CartesPerimetreComponent],
  template: '<app-cartes-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunctionCartesComponent {
  protected readonly module = moduleFunction(inject(FunctionService));
}
