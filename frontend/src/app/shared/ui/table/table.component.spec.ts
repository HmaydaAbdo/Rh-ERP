import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TableColumn } from '../../table/table-columns';
import { TableCellDirective, TableComponent, TableFooterDirective, TableLazyLoadEvent, TableRowActionsDirective } from './table.component';

interface Ligne {
  id: number;
  nom: string;
  age: number | null;
  chantier?: { code: string } | null;
}

@Component({
  selector: 'app-tableau-test',
  imports: [TableComponent, TableCellDirective, TableRowActionsDirective, TableFooterDirective],
  template: `
    <stp-table
      label="Employés"
      [value]="lignes()"
      [columns]="colonnes()"
      [lazy]="lazy()"
      [totalRecords]="total()"
      [loading]="chargement()"
      [emptyMessage]="'Aucun employé.'"
      [rowActionsVisible]="actionsVisibles()"
      [rowClickable]="cliquable()"
      [reorderable]="true"
      [(first)]="first"
      [(rows)]="rows"
      [(sortField)]="tri"
      [(sortOrder)]="sens"
      (lazyLoad)="chargements.push($event)"
      (columnsReorder)="ordres.push($event)"
      (rowClick)="cliques.push($event)"
    >
      <ng-template stpCell let-row let-col="col">{{ row[col.field] }}</ng-template>
      <ng-template stpRowActions let-row><button type="button" class="action">Voir {{ row.nom }}</button></ng-template>
      <ng-template stpFooter let-col="col">Σ {{ col.field }}</ng-template>
    </stp-table>
  `
})
class TableauTestComponent {
  readonly lignes = signal<Ligne[]>([]);
  readonly colonnes = signal<TableColumn[]>([
    { field: 'nom', header: 'Nom' },
    { field: 'age', header: 'Âge', align: 'text-right' },
    { field: 'chantier', header: 'Chantier', sortField: 'chantier.code' }
  ]);
  readonly lazy = signal(false);
  readonly total = signal(0);
  readonly chargement = signal(false);
  readonly actionsVisibles = signal(true);
  readonly cliquable = signal<((ligne: Ligne) => boolean) | null>(null);
  readonly first = signal(0);
  readonly rows = signal(10);
  readonly tri = signal<string | null>(null);
  readonly sens = signal<1 | -1>(1);
  readonly chargements: TableLazyLoadEvent[] = [];
  readonly ordres: TableColumn[][] = [];
  readonly cliques: Ligne[] = [];
}

const LIGNES: Ligne[] = [
  { id: 1, nom: 'Zahra', age: 31, chantier: { code: 'C196' } },
  { id: 2, nom: 'Élodie', age: 45, chantier: { code: 'C057' } },
  { id: 3, nom: 'Ali', age: null, chantier: null },
  { id: 4, nom: 'Bilal', age: 22, chantier: { code: 'C168' } }
];

describe('TableComponent', () => {
  let fixture: ComponentFixture<TableauTestComponent>;
  let hote: TableauTestComponent;
  const racine = () => fixture.nativeElement as HTMLElement;

  function afficher(configurer?: (h: TableauTestComponent) => void): void {
    fixture = TestBed.createComponent(TableauTestComponent);
    hote = fixture.componentInstance;
    configurer?.(hote);
    fixture.detectChanges();
  }

  const noms = () => Array.from(racine().querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')?.textContent?.trim());
  const entete = (titre: string) => Array.from(racine().querySelectorAll('th')).find((th) => th.textContent?.includes(titre)) as HTMLElement;
  const bouton = (nom: string) => racine().querySelector<HTMLButtonElement>(`button[aria-label="${nom}"]`)!;

  describe('rendu', () => {
    beforeEach(() => afficher((h) => h.lignes.set(LIGNES)));

    it('présente des colonnes nommées, une région défilante atteignable au clavier et un tableau natif', () => {
      const region = racine().querySelector('[role="region"]') as HTMLElement;

      expect(region.getAttribute('aria-label')).toBe('Employés');
      expect(region.getAttribute('tabindex')).toBe('0');
      expect(Array.from(racine().querySelectorAll('thead th[scope="col"]')).map((th) => th.textContent?.trim())).toEqual(['Nom', 'Âge', 'Chantier', 'Actions']);
    });

    it('rend chaque cellule avec le gabarit fourni et la colonne d’actions de chaque ligne', () => {
      expect(noms()).toEqual(['Zahra', 'Élodie', 'Ali', 'Bilal']);
      expect(Array.from(racine().querySelectorAll('button.action')).map((b) => b.textContent?.trim())).toEqual(['Voir Zahra', 'Voir Élodie', 'Voir Ali', 'Voir Bilal']);
    });

    it('applique l’alignement d’une colonne à son en-tête et à ses cellules', () => {
      expect(entete('Âge').className).toContain('text-right');
      expect(racine().querySelector('tbody tr td:nth-child(2)')?.className).toContain('text-right');
    });

    it('masque la colonne d’actions quand l’utilisateur n’y a pas droit', () => {
      hote.actionsVisibles.set(false);
      fixture.detectChanges();

      expect(racine().querySelector('button.action')).toBeNull();
      expect(Array.from(racine().querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toEqual(['Nom', 'Âge', 'Chantier']);
    });

    it('affiche un pied avec une cellule par colonne', () => {
      expect(Array.from(racine().querySelectorAll('tfoot td')).map((td) => td.textContent?.trim())).toEqual(['Σ nom', 'Σ age', 'Σ chantier', '']);
    });
  });

  describe('vide et chargement', () => {
    it('annonce l’absence de données', () => {
      afficher();

      expect(racine().querySelector('.stp-table__empty')?.textContent).toBe('Aucun employé.');
      expect(racine().querySelector('.stp-table__report')?.textContent?.trim()).toBe('0 résultat');
    });

    it('annonce le chargement sans afficher le message « vide »', () => {
      afficher((h) => h.chargement.set(true));

      expect(racine().querySelector('[role="region"]')?.getAttribute('aria-busy')).toBe('true');
      expect(racine().querySelector('.stp-table__loader')?.textContent).toContain('Chargement…');
      expect(racine().querySelector('.stp-table__empty')).toBeNull();
    });
  });

  describe('tri en mémoire', () => {
    beforeEach(() => afficher((h) => h.lignes.set(LIGNES)));

    it('trie par texte sans tenir compte des accents ni de la casse, puis inverse au second clic', () => {
      entete('Nom').querySelector('button')!.click();
      fixture.detectChanges();
      expect(noms()).toEqual(['Ali', 'Bilal', 'Élodie', 'Zahra']);
      expect(entete('Nom').getAttribute('aria-sort')).toBe('ascending');

      entete('Nom').querySelector('button')!.click();
      fixture.detectChanges();
      expect(noms()).toEqual(['Zahra', 'Élodie', 'Bilal', 'Ali']);
      expect(entete('Nom').getAttribute('aria-sort')).toBe('descending');
    });

    it('trie les nombres par valeur, les valeurs absentes en premier', () => {
      entete('Âge').querySelector('button')!.click();
      fixture.detectChanges();

      expect(noms()).toEqual(['Ali', 'Bilal', 'Zahra', 'Élodie']);
    });

    it('trie une colonne sur le chemin de propriété qui lui est donné (`chantier.code`)', () => {
      entete('Chantier').querySelector('button')!.click();
      fixture.detectChanges();

      expect(noms()).toEqual(['Ali', 'Élodie', 'Bilal', 'Zahra']);
      expect(hote.tri()).toBe('chantier.code');
    });

    it('n’annonce un tri que sur la colonne triée', () => {
      entete('Nom').querySelector('button')!.click();
      fixture.detectChanges();

      expect(entete('Âge').getAttribute('aria-sort')).toBe('none');
    });
  });

  describe('pagination en mémoire', () => {
    const beaucoup = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, nom: `Employé ${String(i + 1).padStart(2, '0')}`, age: 20 + i }));

    beforeEach(() => afficher((h) => h.lignes.set(beaucoup)));

    it('découpe en pages de 10 et rapporte la position', () => {
      expect(noms()).toHaveLength(10);
      expect(racine().querySelector('.stp-table__report')?.textContent?.trim()).toBe('1 - 10 sur 25 — page 1/3');
      expect(bouton('Page précédente').disabled).toBe(true);
      expect(bouton('Première page').disabled).toBe(true);
    });

    it('passe à la page suivante puis à la dernière, plus courte', () => {
      bouton('Page suivante').click();
      fixture.detectChanges();
      expect(noms()[0]).toBe('Employé 11');
      expect(hote.first()).toBe(10);

      bouton('Dernière page').click();
      fixture.detectChanges();
      expect(noms()).toEqual(['Employé 21', 'Employé 22', 'Employé 23', 'Employé 24', 'Employé 25']);
      expect(racine().querySelector('.stp-table__report')?.textContent?.trim()).toBe('21 - 25 sur 25 — page 3/3');
      expect(bouton('Page suivante').disabled).toBe(true);
    });

    it('change la taille de page et revient à la première', () => {
      bouton('Page suivante').click();
      fixture.detectChanges();
      const choix = racine().querySelector('select') as HTMLSelectElement;

      choix.value = '20';
      choix.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(hote.rows()).toBe(20);
      expect(hote.first()).toBe(0);
      expect(noms()).toHaveLength(20);
    });

    it('un tri revient à la première page', () => {
      bouton('Page suivante').click();
      fixture.detectChanges();

      entete('Nom').querySelector('button')!.click();
      fixture.detectChanges();

      expect(hote.first()).toBe(0);
    });
  });

  describe('mode serveur', () => {
    it('demande lui-même sa première page dès qu’il est affiché', async () => {
      afficher((h) => h.lazy.set(true));
      await fixture.whenStable();

      expect(hote.chargements).toEqual([{ first: 0, rows: 10, sortField: null, sortOrder: 1 }]);
    });

    it('ne trie ni ne découpe : il affiche la page reçue et le total du serveur', async () => {
      afficher((h) => {
        h.lazy.set(true);
        h.lignes.set(LIGNES);
        h.total.set(95);
      });
      await fixture.whenStable();

      expect(noms()).toEqual(['Zahra', 'Élodie', 'Ali', 'Bilal']);
      expect(racine().querySelector('.stp-table__report')?.textContent?.trim()).toBe('1 - 10 sur 95 — page 1/10');
    });

    it('émet la page suivante, la taille et le tri demandés', async () => {
      afficher((h) => {
        h.lazy.set(true);
        h.lignes.set(LIGNES);
        h.total.set(95);
      });
      await fixture.whenStable();
      hote.chargements.length = 0;

      bouton('Page suivante').click();
      entete('Nom').querySelector('button')!.click();
      entete('Nom').querySelector('button')!.click();
      const choix = racine().querySelector('select') as HTMLSelectElement;
      choix.value = '50';
      choix.dispatchEvent(new Event('change'));

      expect(hote.chargements).toEqual([
        { first: 10, rows: 10, sortField: null, sortOrder: 1 },
        { first: 0, rows: 10, sortField: 'nom', sortOrder: 1 },
        { first: 0, rows: 10, sortField: 'nom', sortOrder: -1 },
        { first: 0, rows: 50, sortField: 'nom', sortOrder: -1 }
      ]);
    });

    it('ne dépasse jamais la dernière page', async () => {
      afficher((h) => {
        h.lazy.set(true);
        h.total.set(25);
      });
      await fixture.whenStable();

      bouton('Dernière page').click();
      fixture.detectChanges();
      bouton('Page suivante').click();

      expect(hote.first()).toBe(20);
    });
  });

  describe('lignes cliquables', () => {
    beforeEach(() => afficher((h) => {
      h.lignes.set(LIGNES);
      h.cliquable.set((ligne) => ligne.nom !== 'Ali');
    }));

    it('émet la ligne au clic et à Entrée, et la rend atteignable au clavier', () => {
      const lignes = racine().querySelectorAll<HTMLElement>('tbody tr');
      expect(lignes[0].getAttribute('tabindex')).toBe('0');

      lignes[0].click();
      lignes[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(hote.cliques.map((l) => l.nom)).toEqual(['Zahra', 'Élodie']);
    });

    it('n’émet rien pour une ligne que le parent refuse', () => {
      const ali = racine().querySelectorAll<HTMLElement>('tbody tr')[2];
      expect(ali.hasAttribute('tabindex')).toBe(false);

      ali.click();

      expect(hote.cliques).toEqual([]);
    });
  });

  describe('colonnes : redimensionnement et ordre', () => {
    beforeEach(() => afficher((h) => h.lignes.set(LIGNES)));

    const poignee = (titre: string) => entete(titre).querySelector<HTMLElement>('[role="separator"]')!;

    it('expose la largeur au clavier : flèche droite élargit, flèche gauche rétrécit, avec un minimum', () => {
      const avant = entete('Nom').offsetWidth;

      poignee('Nom').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      fixture.detectChanges();
      expect(Number(poignee('Nom').getAttribute('aria-valuenow'))).toBe(Math.round(avant + 12));

      for (let i = 0; i < 100; i++) {
        poignee('Nom').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        fixture.detectChanges();
      }
      expect(poignee('Nom').getAttribute('aria-valuenow')).toBe('60');
    });

    it('ignore les autres touches sur la poignée', () => {
      poignee('Nom').dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      fixture.detectChanges();

      expect(entete('Nom').style.width).toBe('');
    });

    it('déplace une colonne avec Alt + flèche, et la signale au parent', () => {
      entete('Nom').querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));

      expect(hote.ordres).toHaveLength(1);
      expect(hote.ordres[0].map((c) => c.field)).toEqual(['age', 'nom', 'chantier']);
    });

    it('ne déplace pas une colonne au-delà des bords', () => {
      entete('Nom').querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
      entete('Chantier').querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));

      expect(hote.ordres).toEqual([]);
    });

    it('déplace une colonne par glisser-déposer', () => {
      const transfert = new DataTransfer();
      entete('Chantier').dispatchEvent(new DragEvent('dragstart', { dataTransfer: transfert, bubbles: true }));
      entete('Nom').dispatchEvent(new DragEvent('dragover', { dataTransfer: transfert, bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(entete('Nom').className).toContain('stp-table__th--target');

      entete('Nom').dispatchEvent(new DragEvent('drop', { dataTransfer: transfert, bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(hote.ordres[0].map((c) => c.field)).toEqual(['chantier', 'nom', 'age']);
      expect(entete('Nom').className).not.toContain('stp-table__th--target');
    });
  });
});
