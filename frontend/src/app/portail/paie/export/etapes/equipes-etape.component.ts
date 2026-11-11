import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PaieExportStore } from '../paie-export.store';

/**
 * Étape « Équipes » : un écran par chantier du rapport. Chaque équipe y reçoit sa présentation — dans la liste du chantier,
 * séparée, ou réunie à d'autres (PDF) ; feuille du chantier ou feuille à part, avec retrait possible (Excel).
 */
@Component({
  selector: 'app-paie-export-etape-equipes',
  imports: [IconComponent],
  templateUrl: './equipes-etape.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapeEquipesComponent {
  protected readonly store = inject(PaieExportStore);
}
