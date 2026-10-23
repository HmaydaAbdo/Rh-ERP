import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AnalytiquePerimetreComponent } from '../../perimetre/analytique/analytique-perimetre.component';
import { moduleEquipe } from '../equipe-module';
import { EquipeService } from '../services/equipe.service';

/** Vue Analytique des équipes : le tableau de bord graphique est partagé par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-equipe-analytique',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeAnalytiqueComponent {
  protected readonly module = moduleEquipe(inject(EquipeService));
}
