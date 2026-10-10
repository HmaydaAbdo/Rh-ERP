import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PaieExportStore } from '../paie-export.store';

/** Étape « Matériel » : nombre de chaque ligne du parc matériel, imprimé dans la colonne « Nbre » des tableaux des équipes détaillées. */
@Component({
  selector: 'app-paie-export-etape-materiel',
  imports: [CountUpDirective, IconComponent],
  templateUrl: './materiel-etape.component.html',
  styleUrl: './materiel-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapeMaterielComponent {
  protected readonly store = inject(PaieExportStore);
}
