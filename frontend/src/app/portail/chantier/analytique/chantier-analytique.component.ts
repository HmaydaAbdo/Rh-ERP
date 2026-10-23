import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AnalytiquePerimetreComponent } from '../../perimetre/analytique/analytique-perimetre.component';
import { moduleChantier } from '../chantier-module';
import { ChantierService } from '../services/chantier.service';

/** Vue Analytique des chantiers : le tableau de bord graphique est partagé par tous les modules (voir `portail/perimetre/`). */
@Component({
  selector: 'app-chantier-analytique',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChantierAnalytiqueComponent {
  protected readonly module = moduleChantier(inject(ChantierService));
}
