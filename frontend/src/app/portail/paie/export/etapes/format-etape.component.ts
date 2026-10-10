import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PaieExportStore } from '../paie-export.store';

/** Étape « Format » : rapport PDF de synthèse ou classeur Excel détaillé. */
@Component({
  selector: 'app-paie-export-etape-format',
  imports: [IconComponent],
  templateUrl: './format-etape.component.html',
  styleUrl: './format-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapeFormatComponent {
  protected readonly store = inject(PaieExportStore);
}
