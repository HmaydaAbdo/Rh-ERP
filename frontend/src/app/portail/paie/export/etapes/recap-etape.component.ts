import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PaieExportStore } from '../paie-export.store';

/** Étape « Export » : récapitulatif du choix avant la génération, chaque ligne renvoyant à son étape. */
@Component({
  selector: 'app-paie-export-etape-recap',
  imports: [IconComponent],
  templateUrl: './recap-etape.component.html',
  styleUrl: './recap-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapeRecapComponent {
  protected readonly store = inject(PaieExportStore);
}
