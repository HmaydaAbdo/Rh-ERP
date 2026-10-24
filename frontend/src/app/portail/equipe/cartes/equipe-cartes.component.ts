import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CartesPerimetreComponent } from '../../perimetre/cartes/cartes-perimetre.component';
import { moduleEquipe } from '../equipe-module';
import { EquipeService } from '../services/equipe.service';

/** Vue Cartes des équipes : la hiérarchie Équipe → Chantier → Fonction est définie par le domaine. */
@Component({
  selector: 'app-equipe-cartes',
  imports: [CartesPerimetreComponent],
  template: '<app-cartes-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeCartesComponent {
  protected readonly module = moduleEquipe(inject(EquipeService));
}
