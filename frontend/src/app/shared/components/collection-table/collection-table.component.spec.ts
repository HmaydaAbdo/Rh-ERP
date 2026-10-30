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
      [loading]="busy()"
      [erreur]="erreur()"
      (reessayer)="reprises = reprises + 1"
      [(first)]="first"
      (lazyLoad)="loads.push($event)"
    >
      <span table-summary>Net à payer 20 DH</span>
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
  readonly busy = signal(false);
  readonly erreur = signal<string | null>(null);
  reprises = 0;
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
    expect(page.querySelector('.app-table-bar__summary')?.textContent).toContain('Net à payer 20 DH');
    expect(page.querySelector('app-column-chooser')).not.toBeNull();
    expect(page.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Liste des collaborateurs');
    expect(Array.from(page.querySelectorAll('tbody td')).map((cell) => cell.textContent?.trim())).toEqual(['Ali', 'Zahra']);
    expect(hote.loads[0]).toMatchObject({ first: 0, rows: 10, sortOrder: 1 });
  });

  it('masque le compteur pendant le chargement et conserve l’état first lié au tableau', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '', component: TableauHote }])] });
    const harness = await RouterTestingHarness.create();
    const hote = await harness.navigateByUrl('/', TableauHote);
    hote.busy.set(true);
    hote.first.set(20);
    harness.detectChanges();
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('');
    expect(page.querySelector('.stp-table__paginator')).not.toBeNull();
    expect(hote.first()).toBe(20);
  });

  it('distingue une erreur du résultat vide, masque les anciennes données et permet de réessayer sans recréer le tableau', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '', component: TableauHote }])] });
    const harness = await RouterTestingHarness.create();
    const hote = await harness.navigateByUrl('/', TableauHote);
    await harness.fixture.whenStable();
    const page = harness.routeNativeElement as HTMLElement;
    const tableau = page.querySelector('stp-table');
    const nombreChargements = hote.loads.length;

    hote.erreur.set('Impossible de charger les collaborateurs.');
    harness.detectChanges();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain(hote.erreur());
    expect(tableau?.closest('[hidden]')).not.toBeNull();
    const reessayer = Array.from(page.querySelectorAll('button')).find((bouton) => bouton.textContent?.includes('Réessayer'))!;
    reessayer.click();
    expect(hote.reprises).toBe(1);

    hote.erreur.set(null);
    harness.detectChanges();
    expect(page.querySelector('[role="alert"]')).toBeNull();
    expect(page.querySelector('stp-table')).toBe(tableau);
    expect(tableau?.closest('[hidden]')).toBeNull();
    expect(hote.loads.length).toBe(nombreChargements);
  });
});
