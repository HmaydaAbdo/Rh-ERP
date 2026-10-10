import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PaieExportStore } from '../paie-export.store';

/** Étape « Équipes » : chantiers (ceux du marché choisi en PDF) dont on détaille des équipes, avec leur retrait de la feuille du chantier en Excel. */
@Component({
  selector: 'app-paie-export-etape-equipes',
  imports: [IconComponent],
  templateUrl: './equipes-etape.component.html',
  styleUrl: './equipes-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapeEquipesComponent {
  protected readonly store = inject(PaieExportStore);
}
