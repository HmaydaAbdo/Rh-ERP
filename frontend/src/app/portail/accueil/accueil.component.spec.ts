import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/services/auth.service';
import { EmployeeService } from '../employee/services/employee.service';
import { PaieService } from '../paie/services/paie.service';
import { AccueilComponent } from './accueil.component';
import { Accueil, AccueilService } from './services/accueil.service';

registerLocaleData(localeFr);

const ACCUEIL: Accueil = {
  version: null,
  personnalise: false,
  indicateurs: ['paie.masse', 'paie.effectif', 'employe.en-poste'],
  disponibles: [
    { code: 'paie.masse', libelle: 'Masse salariale', description: '' },
    { code: 'paie.effectif', libelle: 'Bulletins de paie', description: '' },
    { code: 'employe.en-poste', libelle: 'Employés en poste', description: '' }
  ]
};

const PAIE = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 3, coutMoyen: 1500, nombreChantiers: 1, stc: 0, stcMontant: 0 },
  moisPrecedent: { masse: 4000, effectif: 2, coutMoyen: 2000, nombreChantiers: 1, stc: 0, stcMontant: 0 }
};

describe('AccueilComponent', () => {
  function monter(accueil: Observable<Accueil> = of(ACCUEIL), periodes: Observable<{ periode: string }[]> = of([{ periode: '2026-08' }])) {
    const paieService = { listerPeriodes: vi.fn().mockReturnValue(periodes), analyser: vi.fn().mockReturnValue(of(PAIE)) };
    const employeeService = {
      analyser: vi.fn().mockReturnValue(of({ effectif: 4, actifs: 3, inactifs: 1, ageMoyen: 35, ancienneteMoyenne: 4, embauchesDouzeMois: 1, parAge: [], parAnciennete: [] }))
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        { provide: AccueilService, useValue: { lire: vi.fn().mockReturnValue(accueil) } },
        { provide: PaieService, useValue: paieService },
        { provide: EmployeeService, useValue: employeeService },
        { provide: AuthService, useValue: { user: () => ({ username: 'rh' }), hasPermission: () => true } }
      ]
    });
    const fixture = TestBed.createComponent(AccueilComponent);
    fixture.detectChanges();
    return { fixture, paieService, employeeService, racine: fixture.nativeElement as HTMLElement };
  }

  it('montre chaque indicateur choisi, dans l’ordre, avec sa valeur et sa variation sur le mois précédent', () => {
    const { racine, paieService } = monter();

    const tuiles = Array.from(racine.querySelectorAll('.app-kpi')).map((t) => Array.from(t.children).map((e) => e.textContent?.trim()).join(' | '));
    expect(tuiles[0]).toMatch(/^Masse salariale \| 4\s500,00 DH \| \+500,00 DH \(\+12,5 %\) sur le mois précédent$/);
    expect(tuiles[1]).toMatch(/^Bulletins de paie \| 3 bulletins \| \+1 bulletin \(\+50,0 %\) sur le mois précédent$/);
    expect(tuiles[2]).toMatch(/^Employés en poste \| 3 \| 75 % de l’effectif$/);
    expect(paieService.analyser).toHaveBeenCalledWith({ periode: '2026-08' });
  });

  it('ne charge que les sources dont un indicateur est affiché', () => {
    const { paieService, employeeService } = monter(of({ ...ACCUEIL, indicateurs: ['employe.en-poste'] }));

    expect(paieService.listerPeriodes).not.toHaveBeenCalled();
    expect(employeeService.analyser).toHaveBeenCalledTimes(1);
  });

  it('montre « — » quand il n’y a aucune paie', () => {
    const { racine } = monter(of({ ...ACCUEIL, indicateurs: ['paie.masse'] }), of([]));

    expect(racine.querySelector('.app-kpi strong')?.textContent?.trim()).toBe('—');
  });

  it('dit que l’accueil est vide, ou qu’aucun indicateur n’est autorisé', () => {
    expect(monter(of({ ...ACCUEIL, personnalise: true, indicateurs: [] })).racine.textContent).toContain('Votre accueil est vide');
    TestBed.resetTestingModule();
    expect(monter(of({ ...ACCUEIL, indicateurs: [], disponibles: [] })).racine.textContent).toContain('Aucun indicateur n’est disponible');
  });

  it('annonce une erreur de chargement avec un bouton Réessayer', () => {
    const { racine } = monter(throwError(() => new Error('panne')));

    expect(racine.querySelector('[role="alert"]')?.textContent).toContain('Impossible de charger l’accueil');
    expect(Array.from(racine.querySelectorAll('button')).some((b) => b.textContent?.includes('Réessayer'))).toBe(true);
  });
});
