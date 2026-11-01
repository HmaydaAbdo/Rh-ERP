import { attendreGrille, lignesGrille } from '../../../shared/testing/grille';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditChamp } from '../models/audit.model';
import { AuditChampsComponent } from './audit-champs.component';

describe('AuditChampsComponent', () => {
  let fixture: ComponentFixture<AuditChampsComponent>;

  async function afficher(champs: AuditChamp[]): Promise<HTMLElement> {
    fixture.componentRef.setInput('champs', champs);
    fixture.detectChanges();
    await attendreGrille(fixture);
    return fixture.nativeElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AuditChampsComponent] });
    fixture = TestBed.createComponent(AuditChampsComponent);
  });

  it('dit qu’il n’y a aucun changement quand rien ne change', async () => {
    expect((await afficher([])).textContent).toContain('Aucun changement');
  });

  it('montre l’avant et l’après d’une valeur, sous le libellé du champ', async () => {
    const element = await afficher([{ champ: 'salaireTotal', avant: '3000.00', apres: '3500.00', ajoutes: null, retires: null }]);

    const ligne = lignesGrille(element)[0] as unknown as HTMLElement;
    expect(ligne.querySelector('.ag-cell')?.textContent).toContain('Salaire total');
    expect(ligne.querySelector('.audit-champs__retire')?.textContent).toContain('3000.00');
    expect(ligne.querySelector('.audit-champs__ajoute')?.textContent).toContain('3500.00');
  });

  it('montre « — » pour une valeur absente (ajout, suppression)', async () => {
    const element = await afficher([{ champ: 'observation', avant: null, apres: 'revu', ajoutes: null, retires: null }]);

    expect(element.querySelector('.audit-champs__retire')?.textContent).toContain('—');
  });

  it('montre les éléments ajoutés et retirés d’une collection de droits', async () => {
    const element = await afficher([{ champ: 'permissions', avant: null, apres: null, ajoutes: ['7 — PAIE_WRITE'], retires: ['3 — PAIE_READ'] }]);

    expect(element.querySelector('.audit-champs__ajoute')?.textContent).toContain('+ 7 — PAIE_WRITE');
    expect(element.querySelector('.audit-champs__retire')?.textContent).toContain('− 3 — PAIE_READ');
  });

  it('expose chaque colonne de détail dans le sélecteur et chaque valeur dans le tableau partagé', async () => {
    const element = await afficher([{ champ: 'observation', avant: 'ancien', apres: 'nouveau', ajoutes: null, retires: null }]);
    (element.querySelector('app-column-chooser input') as HTMLInputElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    await attendreGrille(fixture);
    fixture.detectChanges();

    expect(Array.from(element.querySelectorAll('.ag-header-cell')).map((header) => header.textContent?.trim())).toEqual(['Champ', 'Avant', 'Après']);
    expect(Array.from(document.querySelectorAll('.stp-select__option-label')).map((option) => option.textContent?.trim())).toEqual(['Champ', 'Avant', 'Après']);
  });
});
