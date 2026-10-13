import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { ColumnChooserComponent } from '../../../shared/components/column-chooser/column-chooser.component';
import { ColumnState } from '../../../shared/table/table-columns';
import { TableCellDirective, TableComponent } from '../../../shared/ui/table/table.component';
import { libelleChamp } from '../audit-format';
import { AuditChamp } from '../models/audit.model';

/**
 * Ce qui change dans un enregistrement, champ par champ : avant / après pour une valeur, éléments ajoutés et retirés pour
 * une collection de droits. Les valeurs arrivent déjà formatées du serveur ; une relation s'écrit « identifiant — libellé ».
 */
@Component({
  selector: 'app-audit-champs',
  imports: [ColumnChooserComponent, TableComponent, TableCellDirective],
  templateUrl: './audit-champs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './audit-champs.component.scss'
})
export class AuditChampsComponent {
  readonly champs = input.required<AuditChamp[]>();
  protected readonly colonnes = new ColumnState([
    { field: 'champ', header: 'Champ' },
    { field: 'avant', header: 'Avant' },
    { field: 'apres', header: 'Après' }
  ]);

  protected readonly libelleChamp = libelleChamp;
}
