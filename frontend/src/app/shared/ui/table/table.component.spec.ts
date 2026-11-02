import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { attendreGrille, lignesGrille } from '../../testing/grille';
import type { TableColumn } from '../../table/table-columns';
import { TableCellDirective, TableComponent, TableFooterDirective, TableLazyLoadEvent, TableRowActionsDirective } from './table.component';

interface Employe {
  id: number;
  nom: string;
  fonction: string;
  chantier: { code: string } | null;
}

const COLONNES: TableColumn[] = [
  { field: 'nom', header: 'Nom' },
  { field: 'fonction', header: 'Fonction' },
  { field: 'chantier', header: 'Chantier', sortField: 'chantier.code' }
];

const EMPLOYES: Employe[] = [
  { id: 1, nom: 'Zahra', fonction: 'Maçon', chantier: { code: 'C2' } },
  { id: 2, nom: 'Ali', fonction: 'Chauffeur', chantier: { code: 'C3' } },
  { id: 3, nom: 'Mehdi', fonction: 'Grutier', chantier: null }
];

@Component({
  imports: [TableComponent, TableCellDirective, TableRowActionsDirective, TableFooterDirective],
  template: `
    <stp-table
      label="Employés"
      [value]="lignes()"
      [columns]="colonnes()"
      [lazy]="serveur()"
      [totalRecords]="total()"
      [loading]="chargement()"
      [emptyMessage]="'Aucun employé.'"
      [rowsPerPageOptions]="[2, 5]"
      [rowClickable]="cliquable"
      [rowActionsVisible]="actions()"
      [(first)]="first"
      [(rows)]="taille"
      [(sortField)]="tri"
      (lazyLoad)="chargements.push($event)"
      (columnsReorder)="ordres.push($event)"
      (rowClick)="clics.push($event.nom)"
    >
      <ng-template stpCell let-ligne let-col="col">
        @if (col.field === 'chantier') {
          {{ ligne.chantier?.code ?? '—' }}
        } @else {
          {{ ligne[col.field] }}
        }
      </ng-template>
      <ng-template stpRowActions let-ligne><button type="button" [attr.aria-label]="'Voir ' + ligne.nom">Voir</button></ng-template>
      @if (pied()) {
        <ng-template stpFooter let-col="col">{{ col.field === 'nom' ? 'Total' : '' }}</ng-template>
      }
    </stp-table>
  `
})
class HoteComponent {
  readonly lignes = signal<Employe[]>(EMPLOYES);
  readonly colonnes = signal<TableColumn[]>(COLONNES);
  readonly serveur = signal(false);
  readonly total = signal(0);
  readonly chargement = signal(false);
  readonly actions = signal(true);
  readonly pied = signal(false);
  first = 0;
  taille = 10;
  tri: string | null = null;
  readonly chargements: TableLazyLoadEvent[] = [];
  readonly ordres: TableColumn[][] = [];
  readonly clics: string[] = [];
  readonly cliquable = (ligne: Employe): boolean => ligne.id !== 3;
}

@Component({
  imports: [TableComponent],
  template: `<stp-table label="Simple" [value]="lignes" [columns]="colonnes" [paginated]="false" [reorderable]="false" [rowActionsVisible]="false" />`
})
class HoteSimpleComponent {
  readonly lignes = [{ nom: 'Ali', age: 31, adresse: { ville: 'Fès' } }];
  readonly colonnes: TableColumn[] = [{ field: 'nom', header: 'Nom' }, { field: 'age', header: 'Âge' }, { field: 'adresse', header: 'Adresse' }];
}

describe('TableComponent sans gabarit de cellule', () => {
  it('affiche la valeur de chaque colonne, et rien pour un objet', async () => {
    const fixture = TestBed.createComponent(HoteSimpleComponent);
    fixture.detectChanges();
    await attendreGrille(fixture);

    expect(lignesGrille(fixture.nativeElement)[0].cells.map((c) => c.textContent?.trim())).toEqual(['Ali', '31', '']);
  });
});

describe('TableComponent (AG Grid)', () => {
  let fixture: ComponentFixture<HoteComponent>;
  let hote: HoteComponent;
  const racine = () => fixture.nativeElement as HTMLElement;
  const noms = () => lignesGrille(racine()).map((l) => l.cells[0]?.textContent?.trim());

  async function monter(preparer: (h: HoteComponent) => void = () => undefined): Promise<void> {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(HoteComponent);
    hote = fixture.componentInstance;
    preparer(hote);
    fixture.detectChanges();
    await attendreGrille(fixture);
  }

  it('présente une grille nommée, ses en-têtes complets, ses lignes et une colonne d’actions lue par les lecteurs d’écran', async () => {
    await monter();

    expect(racine().querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('Employés');
    expect(Array.from(racine().querySelectorAll('.ag-header-cell')).map((h) => h.textContent?.trim())).toEqual(['Nom', 'Fonction', 'Chantier', 'Actions']);
    expect(noms()).toEqual(['Zahra', 'Ali', 'Mehdi']);
    expect(lignesGrille(racine())[0].cells.map((c) => c.textContent?.trim()).slice(0, 3)).toEqual(['Zahra', 'Maçon', 'C2']);
    expect(racine().querySelector('button[aria-label="Voir Ali"]')).not.toBeNull();
    expect(racine().querySelector('.stp-table__report')?.textContent?.trim()).toBe('1 - 3 sur 3 — page 1/1');
  });

  it('n’affiche pas la colonne d’actions quand le parent la masque', async () => {
    await monter((h) => h.actions.set(false));

    expect(Array.from(racine().querySelectorAll('.ag-header-cell')).map((h) => h.textContent?.trim())).toEqual(['Nom', 'Fonction', 'Chantier']);
  });

  it('annonce l’absence de ligne', async () => {
    await monter((h) => h.lignes.set([]));

    expect(racine().querySelector('.stp-table__empty-state')?.textContent?.trim()).toBe('Aucun employé.');
    expect(racine().querySelector('.stp-table__report')?.textContent?.trim()).toBe('0 résultat');
  });

  it('signale le chargement', async () => {
    await monter((h) => h.chargement.set(true));

    expect(racine().querySelector('.stp-table')?.getAttribute('aria-busy')).toBe('true');
  });

  it('affiche le pied projeté, une cellule par colonne', async () => {
    await monter((h) => h.pied.set(true));
    await attendreGrille(fixture);

    expect(racine().querySelector('.ag-grid-pinned-bottom-rows')?.textContent).toContain('Total');
  });

  describe('mode mémoire', () => {
    it('trie par un clic sur l’en-tête, puis dans l’autre sens', async () => {
      await monter();
      const entete = () => racine().querySelector<HTMLElement>('.ag-header-cell[col-id="nom"]') as HTMLElement;
      const clic = () => entete().querySelector<HTMLElement>('.ag-header-cell-label')!.click();

      clic();
      await attendreGrille(fixture);
      expect(noms()).toEqual(['Ali', 'Mehdi', 'Zahra']);
      expect(entete().getAttribute('aria-sort')).toBe('ascending');

      clic();
      await attendreGrille(fixture);
      expect(noms()).toEqual(['Zahra', 'Mehdi', 'Ali']);
      expect(entete().getAttribute('aria-sort')).toBe('descending');
    });

    it('trie une relation par son chemin de propriété, sans valeur en premier', async () => {
      await monter();

      racine().querySelector<HTMLElement>('.ag-header-cell[col-id="chantier"] .ag-header-cell-label')!.click();
      await attendreGrille(fixture);

      expect(noms()).toEqual(['Mehdi', 'Zahra', 'Ali']);
      expect(hote.tri).toBe('chantier.code');
    });

    it('découpe en pages, revient à la première au changement de taille', async () => {
      await monter((h) => (h.taille = 2));

      expect(noms()).toEqual(['Zahra', 'Ali']);
      expect(racine().querySelector('.stp-table__report')?.textContent?.trim()).toBe('1 - 2 sur 3 — page 1/2');

      racine().querySelector<HTMLButtonElement>('button[aria-label="Page suivante"]')!.click();
      fixture.detectChanges();
      await attendreGrille(fixture);

      expect(noms()).toEqual(['Mehdi']);
      expect(hote.first).toBe(2);
      expect(hote.chargements).toEqual([]);
    });
  });

  describe('mode serveur', () => {
    it('demande lui-même sa première page, puis chaque page et chaque tri', async () => {
      await monter((h) => {
        h.serveur.set(true);
        h.total.set(30);
        h.taille = 5;
      });
      expect(hote.chargements).toEqual([{ first: 0, rows: 5, sortField: null, sortOrder: 1 }]);

      racine().querySelector<HTMLButtonElement>('button[aria-label="Page suivante"]')!.click();
      expect(hote.chargements.at(-1)).toEqual({ first: 5, rows: 5, sortField: null, sortOrder: 1 });

      racine().querySelector<HTMLElement>('.ag-header-cell[col-id="fonction"] .ag-header-cell-label')!.click();
      await attendreGrille(fixture);
      expect(hote.chargements.at(-1)).toEqual({ first: 0, rows: 5, sortField: 'fonction', sortOrder: 1 });
    });

    it('affiche tel quel ce que le serveur renvoie, sans le réordonner', async () => {
      await monter((h) => {
        h.serveur.set(true);
        h.total.set(3);
        h.tri = 'nom';
      });

      expect(noms()).toEqual(['Zahra', 'Ali', 'Mehdi']);
      expect(racine().querySelector('.ag-header-cell[col-id="nom"]')?.getAttribute('aria-sort')).toBe('ascending');
    });
  });

  describe('lignes cliquables', () => {
    it('émet la ligne sur un clic ou Entrée, sauf sur un bouton ou une ligne non cliquable', async () => {
      await monter();
      const ligne = (i: number) => lignesGrille(racine())[i].elements[0];

      ligne(0).querySelector<HTMLElement>('.ag-cell')!.click();
      ligne(2).querySelector<HTMLElement>('.ag-cell')!.click();
      racine().querySelector<HTMLButtonElement>('button[aria-label="Voir Ali"]')!.click();

      await vi.waitFor(() => expect(hote.clics).toEqual(['Zahra']));
      expect(ligne(0).classList).toContain('stp-table__row--clickable');
      expect(ligne(2).classList).not.toContain('stp-table__row--clickable');
    });
  });

  describe('colonnes', () => {
    it('signale au parent le nouvel ordre quand l’utilisateur déplace une colonne', async () => {
      await monter();
      const composant = fixture.debugElement.children[0].componentInstance as unknown as { onColumnMoved: (e: unknown) => void };
      const api = { getColumnState: () => [{ colId: 'fonction' }, { colId: 'nom' }, { colId: 'chantier' }, { colId: '__actions' }] };

      composant.onColumnMoved({ finished: true, source: 'uiColumnMoved', api });

      expect(hote.ordres.map((o) => o.map((c) => c.field))).toEqual([['fonction', 'nom', 'chantier']]);
    });

    it('ignore un déplacement qui ne vient pas de l’utilisateur ou qui n’est pas terminé', async () => {
      await monter();
      const composant = fixture.debugElement.children[0].componentInstance as unknown as { onColumnMoved: (e: unknown) => void };
      const api = { getColumnState: () => [{ colId: 'fonction' }, { colId: 'nom' }, { colId: 'chantier' }] };

      composant.onColumnMoved({ finished: false, source: 'uiColumnMoved', api });
      composant.onColumnMoved({ finished: true, source: 'api', api });

      expect(hote.ordres).toEqual([]);
    });
  });
});
