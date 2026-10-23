import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaiePeriodeResume } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';
import { FunctionCartesComponent } from './function-cartes.component';

const FONCTIONS: Function[] = [
  { id: 1, version: 0, libelle: 'CHEF CHANTIER' },
  { id: 2, version: 0, libelle: 'CHAUFFEUR' }
];
const PERIODES: PaiePeriodeResume[] = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 0, stcMontant: 0 }];
const ANALYTIQUE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 0, stcMontant: 0 },
  moisPrecedent: null,
  parChantier: [],
  parEquipe: [],
  parFonction: [{ id: 1, libelle: 'CHEF CHANTIER', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }],
  tranches: [],
  evolution: [{ periode: '2026-08', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};

describe('FunctionCartesComponent', () => {
  let fonctions: MockedObject<FunctionService>;
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/functions/cartes'): Promise<FunctionCartesComponent> {
    return harness.navigateByUrl(url, FunctionCartesComponent);
  }

  beforeEach(async () => {
    permissions = (code) => ['FUNCTION_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    fonctions = { search: vi.fn().mockReturnValue(of({ content: FONCTIONS, page: { size: 12, number: 0, totalElements: 2, totalPages: 1 } })) } as unknown as MockedObject<FunctionService>;
    employes = { regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'CHEF CHANTIER', libelle: 'CHEF CHANTIER', effectif: 3, actifs: 3 }])) } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      analyser: vi.fn().mockReturnValue(of(ANALYTIQUE))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'functions/cartes', component: FunctionCartesComponent }]),
        { provide: FunctionService, useValue: fonctions },
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche les fiches Employé et les indicateurs du dernier mois de Paie', async () => {
    await ouvrir('/functions/cartes?libelle=CHEF');
    const page = harness.routeNativeElement as HTMLElement;
    const cartes = page.querySelectorAll('.function-carte');

    expect(cartes).toHaveLength(2);
    expect(cartes[0].textContent).toContain('CHEF CHANTIER');
    expect(cartes[0].textContent).toContain('Employés sur les fiches récentes');
    expect(cartes[0].textContent).toContain('Payés · août 2026');
    expect(cartes[0].textContent).toMatch(/4[, ]500\.00 DH/);
    expect(cartes[1].textContent).toContain('Masse · août 2026');
    expect(cartes[1].textContent).toMatch(/0\.00 DH/);
    expect(employes.regrouper).toHaveBeenCalledWith({}, 'FONCTION');
    expect(paie.analyser).toHaveBeenCalledWith({ periode: '2026-08' });
    expect(page.querySelector('a[href^="/functions/analytique?fonctionId=1"]')).not.toBeNull();
  });

  it('masque les données et les appels Paie/Employé quand les droits manquent', async () => {
    permissions = (code) => code === 'FUNCTION_READ';
    await ouvrir();
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).not.toContain('Employés sur les fiches récentes');
    expect(page.textContent).not.toContain('Payés');
    expect(page.textContent).not.toContain('Masse');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('signale l’absence de période Paie sans inventer d’indicateurs', async () => {
    paie.listerPeriodes.mockReturnValue(of([]));
    await ouvrir();
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucun mois disponible');
    expect(page.textContent).not.toContain('Payés ·');
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('transmet le filtre à la recherche et borne la pagination', async () => {
    const composant = await ouvrir('/functions/cartes?libelle=CHEF');
    composant['total'].set(13);
    const recherche = vi.mocked(fonctions.search);
    recherche.mockReturnValue(of({ content: FONCTIONS.slice(0, 1), page: { size: 12, number: 1, totalElements: 13, totalPages: 2 } }));

    composant['changerPage'](1);
    await harness.fixture.whenStable();

    expect(recherche.mock.lastCall?.[0]).toEqual({ libelle: 'CHEF' });
    expect(recherche.mock.calls.some(([, requete]) => requete.page === 1 && requete.size === 12)).toBe(true);
    expect(TestBed.inject(Router).url).toContain('page=1');
    const nombreAppels = recherche.mock.calls.length;
    composant['changerPage'](2);
    composant['changerPage'](-1);
    expect(recherche.mock.calls).toHaveLength(nombreAppels);
  });
});
