import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { ColumnState } from '../../table/table-columns';
import { TableCellDirective, TableLazyLoadEvent } from '../../ui/table/table.component';
import { CollectionTableComponent, CollectionTableConfig } from './collection-table.component';

@Component({
  standalone: true,
  imports: [CollectionTableComponent, TableCellDirective],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-collection-table
      [configuration]="configuration"
      [columnState]="columns"
      [value]="rows"
      [totalRecords]="2"
      [loading]="busy"
      [(first)]="first"
      (lazyLoad)="loads.push($event)"
    >
      <ng-template stpCell let-row let-col="col">{{ row.nom }}</ng-template>
    </app-collection-table>
  `
})
class TableauHote {
  readonly configuration: CollectionTableConfig = {
    countLabel: (total) => `${total} collaborateur${total > 1 ? 's' : ''}`,
    accessibleLabel: 'Liste des collaborateurs',
    emptyMessage: 'Aucun collaborateur.'
  };
  readonly columns = new ColumnState([{ field: 'nom', header: 'Nom' }]);
  readonly rows = [{ nom: 'Ali' }, { nom: 'Zahra' }];
  readonly first = signal(0);
  readonly loads: TableLazyLoadEvent[] = [];
  busy = false;
}

describe('CollectionTableComponent', () => {
  it('rend compteur, choix de colonnes, tableau accessible et cellules projetées, puis demande sa page serveur', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '', component: TableauHote }])] });
    const harness = await RouterTestingHarness.create();
    const hote = await harness.navigateByUrl('/', TableauHote);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('[role="status"]')?.textContent?.trim()).toBe('2 collaborateurs');
    expect(page.querySelector('app-column-chooser')).not.toBeNull();
    expect(page.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Liste des collaborateurs');
    expect(Array.from(page.querySelectorAll('tbody td')).map((cell) => cell.textContent?.trim())).toEqual(['Ali', 'Zahra']);
    expect(hote.loads[0]).toMatchObject({ first: 0, rows: 10, sortOrder: 1 });
  });

  it('masque le compteur pendant le chargement et conserve l’état first lié au tableau', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '', component: TableauHote }])] });
    const harness = await RouterTestingHarness.create();
    const hote = await harness.navigateByUrl('/', TableauHote);
    hote.busy = true;
    hote.first.set(20);
    harness.detectChanges();
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('');
    expect(page.querySelector('.stp-table__paginator')).not.toBeNull();
    expect(hote.first()).toBe(20);
  });
});
