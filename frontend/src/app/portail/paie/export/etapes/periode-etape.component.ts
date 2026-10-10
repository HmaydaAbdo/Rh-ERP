import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { MonthPickerComponent } from '../../../../shared/components/month-picker/month-picker.component';
import { CountUpDirective } from '../../../../shared/directives/count-up.directive';
import { IconComponent } from '../../../../shared/ui/icon/icon.component';
import { PaieExportStore } from '../paie-export.store';

/** Étape « Mois » : choix du mois à exporter (seuls les mois qui contiennent des bulletins sont proposés) et résumé de son contenu. */
@Component({
  selector: 'app-paie-export-etape-periode',
  imports: [MonthPickerComponent, CountUpDirective, IconComponent],
  templateUrl: './periode-etape.component.html',
  styleUrl: './periode-etape.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaieExportEtapePeriodeComponent {
  protected readonly store = inject(PaieExportStore);
}
