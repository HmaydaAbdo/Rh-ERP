import type { MockedObject } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaiePeriodeResume } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';
import { FunctionAnalytiqueComponent } from './function-analytique.component';

const CHEF: Function = { id: 1, version: 0, libelle: 'CHEF CHANTIER' };
const CHAUFFEUR: Function = { id: 2, version: 0, libelle: 'CHAUFFEUR' };
const PERIODES: PaiePeriodeResume[] = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 1, stcMontant: 1000 }];
const ANALYSE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 1, stcMontant: 1000 },
  moisPrecedent: null,
  parChantier: [{ id: 3, code: 'C3', libelle: 'Nador', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  parEquipe: [],
  parFonction: [{ id: 1, libelle: 'CHEF CHANTIER', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  tranches: [],
  evolution: [
    { periode: '2026-07', masse: 4000, effectif: 1, stc: 0, stcMontant: 0 },
    { periode: '2026-08', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }
  ],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};
const ANALYSE_MOIS_VIDE: PaieAnalytique = {
  ...ANALYSE,
  kpis: { masse: 0, effectif: 0, coutMoyen: null, nombreChantiers: 0, stc: 0, stcMontant: 0 },
  parChantier: [],
  parFonction: []
};

describe('FunctionAnalytiqueComponent', () => {
  let fonctions: MockedObject<FunctionService>;
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/functions/analytique'): Promise<FunctionAnalytiqueComponent> {
    return harness.navigateByUrl(url, FunctionAnalytiqueComponent);
  }

  beforeEach(async () => {
    permissions = (code) => ['FUNCTION_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    fonctions = {
      search: vi.fn().mockReturnValue(of({ content: [CHAUFFEUR, CHEF], page: { size: 200, number: 0, totalElements: 2, totalPages: 1 } })),
      getById: vi.fn().mockReturnValue(of(CHEF))
    } as unknown as MockedObject<FunctionService>;
    employes = { regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'CHEF CHANTIER', libelle: 'CHEF CHANTIER', effectif: 3, actifs: 3 }])) } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      analyser: vi.fn().mockReturnValue(of(ANALYSE))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'functions/analytique', component: FunctionAnalytiqueComponent }]),
        { provide: FunctionService, useValue: fonctions },
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } },
        { provide: ThemeService, useValue: { theme: signal('light') } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche les indicateurs et les deux mois d’historique pour une fonction', async () => {
    await ouvrir('/functions/analytique?fonctionId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).toContain('3 employés');
    expect(page.textContent).toContain('Effectif payé');
    expect(page.textContent).toMatch(/4\s500,00\sDH/);
    expect(page.textContent).toContain('Évolution mensuelle de la masse');
    expect(page.querySelectorAll('table tbody tr')).toHaveLength(2);
    expect(vi.mocked(paie.analyser).mock.lastCall?.[0]).toEqual({ periode: '2026-08', fonctionIds: [1] });
    expect(vi.mocked(employes.regrouper).mock.lastCall).toEqual([{ fonctionIds: [1] }, 'FONCTION']);
    expect(vi.mocked(fonctions.getById)).toHaveBeenCalledWith(1);
  });

  it('répartit toutes les fonctions du catalogue, y compris celles sans bulletin sur le mois', async () => {
    await ouvrir('/functions/analytique?periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;
    const lignes = Array.from(page.querySelectorAll('table tbody tr')).map((ligne) => ligne.textContent ?? '');

    expect(page.textContent).toContain('Répartition par fonction');
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain('CHAUFFEUR');
    expect(lignes[1]).toContain('CHEF CHANTIER');
    expect(page.querySelector('a[href*="fonctionId=2"]')).not.toBeNull();
  });

  it('affiche les STC de chaque fonction dans la répartition, à zéro pour celles sans bulletin', async () => {
    await ouvrir('/functions/analytique?periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;
    const entetes = Array.from(page.querySelectorAll('table thead th')).map((th) => th.textContent?.trim());
    const lignes = Array.from(page.querySelectorAll('table tbody tr')).map((ligne) => ligne.textContent ?? '');

    expect(entetes).toContain('STC');
    expect(lignes[0]).toMatch(/CHAUFFEUR.*0\s·\s0,00\sDH/);
    expect(lignes[1]).toMatch(/CHEF CHANTIER.*1\s·\s1\s000,00\sDH/);
  });

  it('applique le filtre libellé de l’URL au catalogue, aux effectifs et à la Paie, comme les autres vues', async () => {
    fonctions.search.mockReturnValue(of({ content: [CHEF], page: { size: 200, number: 0, totalElements: 1, totalPages: 1 } }));
    await ouvrir('/functions/analytique?periode=2026-08&libelle=chef');
    const page = harness.routeNativeElement as HTMLElement;

    expect(vi.mocked(fonctions.search).mock.lastCall?.[0]).toEqual({ libelle: 'chef' });
    expect(vi.mocked(employes.regrouper).mock.lastCall).toEqual([{ fonctionIds: [1] }, 'FONCTION']);
    expect(vi.mocked(paie.analyser).mock.lastCall?.[0]).toEqual({ periode: '2026-08', fonctionIds: [1] });
    expect(page.textContent).toContain('fonctions filtrées');
    expect(page.querySelectorAll('table tbody tr')).toHaveLength(1);
  });

  it('n’interroge ni Employé ni Paie quand le filtre libellé ne correspond à aucune fonction', async () => {
    fonctions.search.mockReturnValue(of({ content: [], page: { size: 200, number: 0, totalElements: 0, totalPages: 0 } }));
    await ouvrir('/functions/analytique?periode=2026-08&libelle=zzz');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucune fonction ne correspond à ces critères.');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('garde l’historique et les indicateurs à zéro quand le mois choisi n’a aucun bulletin', async () => {
    paie.analyser.mockReturnValue(of({ ...ANALYSE_MOIS_VIDE, evolution: [ANALYSE.evolution[0]] }));
    await ouvrir('/functions/analytique?fonctionId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucun bulletin pour CHEF CHANTIER');
    expect(page.textContent).toContain('Effectif payé');
    expect(page.textContent).toContain('Évolution mensuelle de la masse');
    expect(page.querySelectorAll('table tbody tr')).toHaveLength(1);
  });

  it('garde la situation Employé et masque la Paie sans PAIE_READ', async () => {
    permissions = (code) => code === 'FUNCTION_READ' || code === 'EMPLOYEE_READ';
    await ouvrir('/functions/analytique?fonctionId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).toContain('3 employés');
    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).not.toContain('Effectif payé');
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('masque les données Employé pour les personnes qui n’ont pas EMPLOYEE_READ', async () => {
    permissions = (code) => code === 'FUNCTION_READ' || code === 'PAIE_READ';
    await ouvrir('/functions/analytique?periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(page.textContent).not.toContain('Situation des fiches Employé');
    expect(page.textContent).not.toContain('Employés sur les fiches récentes');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(page.textContent).toContain('Répartition par fonction');
  });

  it('n’appelle ni Employé ni Paie quand le compte n’a que FUNCTION_READ', async () => {
    permissions = (code) => code === 'FUNCTION_READ';
    await ouvrir('/functions/analytique');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('signale l’absence de période et ignore un mois invalide', async () => {
    paie.listerPeriodes.mockReturnValue(of([]));
    await ouvrir('/functions/analytique?periode=2026-13');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucun mois de paie n’est disponible.');
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('met à jour la période dans l’URL et revient à toutes les fonctions', async () => {
    const composant = await ouvrir('/functions/analytique?fonctionId=1&periode=2026-08');

    composant['changerPeriode']({ target: { value: '2026-07' } } as unknown as Event);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('periode=2026-07');
    composant['retourVueEnsemble']();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).not.toContain('fonctionId=');
  });
});
