import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';

import { CollectionTableComponent, CollectionTableConfig } from '../../../shared/components/collection-table/collection-table.component';
import { ColumnState } from '../../../shared/table/table-columns';
import { TableCellDirective, TableLazyLoadEvent } from '../../../shared/ui/table/table.component';
import { HeuresSupp, HeuresSuppSearchCriteria } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';

const TABLE: CollectionTableConfig = { countLabel: (n) => `${n} ligne${n > 1 ? 's' : ''}`, accessibleLabel: 'Liste des heures supplémentaires', emptyMessage: 'Aucune heure supplémentaire ou forfait sur ce périmètre.' };

@Component({
  selector: 'app-heures-supp-list',
  imports: [DecimalPipe, CollectionTableComponent, TableCellDirective],
  template: `
    <app-collection-table [configuration]="table" [columnState]="columns" [value]="lignes()" [totalRecords]="total()" [loading]="chargement()" [erreur]="erreur()" (lazyLoad)="charger($event)" (reessayer)="charger({first: 0, rows: 20, sortField: 'periode', sortOrder: -1})">
      <ng-template stpCell let-ligne let-col="col">
        @switch (col.field) {
          @case ('periode') { {{ ligne.periode }} }
          @case ('chantier') { <strong>{{ ligne.codeChantier }}</strong><span class="heures-supp-secondaire">{{ ligne.chantier }}</span> }
          @case ('employe') { <strong>{{ ligne.nomPrenom }}</strong><span class="heures-supp-secondaire">{{ ligne.cin }}</span> }
          @case ('fonction') { {{ ligne.fonction }} }
          @case ('heuresSupplementaires') { {{ ligne.heuresSupplementaires === null ? '—' : (ligne.heuresSupplementaires | number:'1.0-1') + ' h' }} }
          @case ('montantDh') { {{ ligne.montantDh | number:'1.2-2' }} DH }
          @case ('stcDh') { {{ ligne.stcDh | number:'1.2-2' }} DH }
          @case ('forfaitDh') { {{ ligne.forfaitDh === null ? '—' : (ligne.forfaitDh | number:'1.2-2') + ' DH' }} }
          @case ('netAPayerDh') { <strong>{{ ligne.netAPayerDh | number:'1.2-2' }} DH</strong> }
        }
      </ng-template>
    </app-collection-table>
  `,
  styles: `.heures-supp-secondaire{display:block;color:var(--color-text-muted);font-size:.875em}`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeuresSuppListComponent {
  protected readonly table = TABLE;
  protected readonly columns = new ColumnState([
    { field: 'periode', header: 'Mois' }, { field: 'chantier', header: 'Chantier' }, { field: 'employe', header: 'Employé' },
    { field: 'fonction', header: 'Fonction' }, { field: 'heuresSupplementaires', header: 'P/H' }, { field: 'montantDh', header: 'Montant' },
    { field: 'stcDh', header: 'STC' }, { field: 'forfaitDh', header: 'Forfait' }, { field: 'netAPayerDh', header: 'Net à payer' }
  ]);
  protected readonly lignes = signal<HeuresSupp[]>([]);
  protected readonly total = signal(0);
  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  private readonly service = inject(HeuresSuppService);
  private readonly route = inject(ActivatedRoute);
  private criteres: HeuresSuppSearchCriteria = {};
  private dernierEvenement: TableLazyLoadEvent | null = null;

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const periode = params.get('periode');
      const ids = (key: string): number[] | undefined => {
        const value = params.get(key);
        if (value === null) return undefined;
        return value.split(',').map(Number).filter((id) => Number.isInteger(id) && id >= 0);
      };
      this.criteres = {
        periode: periode ?? undefined,
        chantierIds: ids('chantierIds'),
        equipeIds: ids('equipeIds'),
        fonctionIds: ids('fonctionIds')
      };
      if (this.dernierEvenement) this.charger(this.dernierEvenement);
    });
  }

  protected charger(event: TableLazyLoadEvent): void {
    this.dernierEvenement = event;
    this.chargement.set(true); this.erreur.set(null);
    this.service.search(this.criteres, Math.floor(event.first / event.rows), event.rows).pipe(finalize(() => this.chargement.set(false))).subscribe({
      next: (page) => { this.lignes.set(page.content); this.total.set(page.page.totalElements); },
      error: () => this.erreur.set('Les heures supplémentaires n’ont pas pu être chargées. Réessayez.')
    });
  }
}
