import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditChamp } from '../models/audit.model';
import { AuditChampsComponent } from './audit-champs.component';

describe('AuditChampsComponent', () => {
  let fixture: ComponentFixture<AuditChampsComponent>;

  function afficher(champs: AuditChamp[]): HTMLElement {
    fixture.componentRef.setInput('champs', champs);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AuditChampsComponent] });
    fixture = TestBed.createComponent(AuditChampsComponent);
  });

  it('dit qu’il n’y a aucun changement quand rien ne change', () => {
    expect(afficher([]).textContent).toContain('Aucun changement');
  });

  it('montre l’avant et l’après d’une valeur, sous le libellé du champ', () => {
    const element = afficher([{ champ: 'salaireTotal', avant: '3000.00', apres: '3500.00', ajoutes: null, retires: null }]);

    const ligne = element.querySelector('tbody tr') as HTMLElement;
    expect(ligne.querySelector('th')?.textContent).toContain('Salaire total');
    expect(ligne.querySelector('.audit-champs__retire')?.textContent).toContain('3000.00');
    expect(ligne.querySelector('.audit-champs__ajoute')?.textContent).toContain('3500.00');
  });

  it('montre « — » pour une valeur absente (ajout, suppression)', () => {
    const element = afficher([{ champ: 'observation', avant: null, apres: 'revu', ajoutes: null, retires: null }]);

    expect(element.querySelector('.audit-champs__retire')?.textContent).toContain('—');
  });

  it('montre les éléments ajoutés et retirés d’une collection de droits', () => {
    const element = afficher([{ champ: 'permissions', avant: null, apres: null, ajoutes: ['7 — PAIE_WRITE'], retires: ['3 — PAIE_READ'] }]);

    expect(element.querySelector('.audit-champs__ajoute')?.textContent).toContain('+ 7 — PAIE_WRITE');
    expect(element.querySelector('.audit-champs__retire')?.textContent).toContain('− 3 — PAIE_READ');
  });
});
