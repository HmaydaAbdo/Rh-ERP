import type { MockedObject } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaiePeriodeResume } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';
import { EquipeAnalytiqueComponent } from './equipe-analytique.component';

const EQUIPE: Equipe = { id: 1, version: 0, code: 'CH', libelle: 'Chauffeurs' };
const PERIODES: PaiePeriodeResume[] = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 1, stcMontant: 1000 }];
const ANALYSE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 1, stcMontant: 1000 },
  moisPrecedent: null,
  parChantier: [{ id: 3, code: 'C3', libelle: 'Nador', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  parEquipe: [{ id: 1, code: 'CH', libelle: 'Chauffeurs', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  parFonction: [], tranches: [],
  evolution: [
    { periode: '2026-07', masse: 4000, effectif: 1, stc: 0, stcMontant: 0 },
    { periode: '2026-08', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }
  ],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};

describe('EquipeAnalytiqueComponent', () => {
  let equipes: MockedObject<EquipeService>;
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/equipes/analytique'): Promise<EquipeAnalytiqueComponent> {
    return harness.navigateByUrl(url, EquipeAnalytiqueComponent);
  }

  beforeEach(async () => {
    permissions = (code) => ['EQUIPE_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    equipes = {
      search: vi.fn().mockReturnValue(of({ content: [EQUIPE], page: { size: 200, number: 0, totalElements: 1, totalPages: 1 } })),
      getById: vi.fn().mockReturnValue(of(EQUIPE))
    } as unknown as MockedObject<EquipeService>;
    employes = { regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 3, actifs: 3 }])) } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      analyser: vi.fn().mockReturnValue(of(ANALYSE))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'equipes/analytique', component: EquipeAnalytiqueComponent }]),
        { provide: EquipeService, useValue: equipes },
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } },
        { provide: ThemeService, useValue: { theme: signal('light') } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche les indicateurs et les deux mois d’historique pour une équipe', async () => {
    await ouvrir('/equipes/analytique?equipeId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).toContain('Effectif payé');
    expect(page.textContent).toContain('4 500,00 DH');
    expect(page.textContent).toContain('Évolution mensuelle de la masse');
    expect(page.querySelectorAll('table tbody tr')).toHaveLength(2);
    expect(vi.mocked(paie.analyser).mock.lastCall?.[0]).toEqual({ periode: '2026-08', equipeIds: [1] });
    expect(vi.mocked(equipes.getById)).toHaveBeenCalledWith(1);
  });

  it('garde la situation Employé et masque la Paie sans PAIE_READ', async () => {
    permissions = (code) => code === 'EQUIPE_READ' || code === 'EMPLOYEE_READ';
    await ouvrir('/equipes/analytique?equipeId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).toContain('3 employés');
    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).not.toContain('Effectif payé');
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('masque les données Employé pour les personnes qui n’ont pas EMPLOYEE_READ', async () => {
    permissions = (code) => code === 'EQUIPE_READ' || code === 'PAIE_READ';
    await ouvrir('/equipes/analytique?periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(page.textContent).not.toContain('Situation des fiches Employé');
    expect(page.textContent).not.toContain('Employés sur les fiches récentes');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(page.textContent).toContain('Répartition par équipe');
  });

  it('affiche la répartition catalogue quand le compte n’a pas accès à Employé ni à Paie', async () => {
    permissions = (code) => code === 'EQUIPE_READ';
    await ouvrir('/equipes/analytique');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('signale l’absence de période et ignore un mois invalide', async () => {
    paie.listerPeriodes.mockReturnValue(of([]));
    await ouvrir('/equipes/analytique?periode=2026-13');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucun mois de paie n’est disponible.');
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('met à jour la période dans l’URL et revient à toutes les équipes', async () => {
    const composant = await ouvrir('/equipes/analytique?equipeId=1&periode=2026-08');

    composant['changerPeriode']({ target: { value: '2026-07' } } as unknown as Event);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('periode=2026-07');
    composant['retourVueEnsemble']();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).not.toContain('equipeId=');
  });
});
