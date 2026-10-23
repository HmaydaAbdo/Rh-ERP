import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { moduleChantier } from '../chantier-module';
import { ChantierService } from '../services/chantier.service';

/** Vue Cartes des chantiers : la descente libre par niveaux est partagée par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-chantier-cartes',
  imports: [CartesPerimetreComponent],
  template: '<app-cartes-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierCartesComponent {
  protected readonly module = moduleChantier(inject(ChantierService));
}
