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
import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';
import { ChantierAnalytiqueComponent } from './chantier-analytique.component';

const NADOR: Chantier = { id: 1, version: 0, code: 'C168', designation: 'Route de Nador', nom: null, sourceErp: true, actif: true };
const MARRAKECH: Chantier = { id: 2, version: 0, code: 'C196', designation: 'Marrakech', nom: 'Nord', sourceErp: false, actif: false };
const PERIODES: PaiePeriodeResume[] = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 1, stcMontant: 1000 }];
const ANALYSE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 1, stcMontant: 1000 },
  moisPrecedent: null,
  parChantier: [{ id: 1, code: 'C168', libelle: 'Route de Nador', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  parEquipe: [], parFonction: [], tranches: [],
  evolution: [
    { periode: '2026-07', masse: 4000, effectif: 1, stc: 0, stcMontant: 0 },
    { periode: '2026-08', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }
  ],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};
const ANALYSE_MOIS_VIDE: PaieAnalytique = {
  ...ANALYSE,
  kpis: { masse: 0, effectif: 0, coutMoyen: null, nombreChantiers: 0, stc: 0, stcMontant: 0 },
  parChantier: []
};

const pageDe = (content: Chantier[]) => ({ content, page: { size: 200, number: 0, totalElements: content.length, totalPages: content.length ? 1 : 0 } });

describe('ChantierAnalytiqueComponent', () => {
  let chantiers: MockedObject<ChantierService>;
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/chantiers/analytique'): Promise<ChantierAnalytiqueComponent> {
    return harness.navigateByUrl(url, ChantierAnalytiqueComponent);
  }

  beforeEach(async () => {
    permissions = (code) => ['CHANTIER_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    chantiers = {
      search: vi.fn().mockReturnValue(of(pageDe([NADOR, MARRAKECH]))),
      getById: vi.fn().mockReturnValue(of(NADOR))
    } as unknown as MockedObject<ChantierService>;
    employes = { regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'C168', libelle: 'Route de Nador', effectif: 3, actifs: 3 }])) } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      analyser: vi.fn().mockReturnValue(of(ANALYSE))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'chantiers/analytique', component: ChantierAnalytiqueComponent }]),
        { provide: ChantierService, useValue: chantiers },
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } },
        { provide: ThemeService, useValue: { theme: signal('light') } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche les indicateurs et les deux mois d’historique pour un chantier, sans compter les chantiers', async () => {
    await ouvrir('/chantiers/analytique?chantierId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).toContain('3 employés');
    expect(page.textContent).toContain('Effectif payé');
    expect(page.textContent).toMatch(/4\s500,00\sDH/);
    expect(page.textContent).not.toContain('Chantiers concernés');
    expect(page.textContent).toContain('Évolution mensuelle de la masse');
    expect(page.querySelectorAll('table tbody tr')).toHaveLength(2);
    expect(vi.mocked(paie.analyser).mock.lastCall?.[0]).toEqual({ periode: '2026-08', chantierIds: [1] });
    expect(vi.mocked(employes.regrouper).mock.lastCall).toEqual([{ chantierIds: [1] }, 'CHANTIER']);
    expect(vi.mocked(chantiers.getById)).toHaveBeenCalledWith(1);
  });

  it('répartit tous les chantiers du catalogue, STC compris, y compris ceux sans bulletin sur le mois', async () => {
    await ouvrir('/chantiers/analytique?periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;
    const entetes = Array.from(page.querySelectorAll('table thead th')).map((th) => th.textContent?.trim());
    const lignes = Array.from(page.querySelectorAll('table tbody tr')).map((ligne) => ligne.textContent ?? '');

    expect(page.textContent).toContain('Répartition par chantier');
    expect(page.textContent).toContain('Chantiers concernés');
    expect(entetes).toContain('STC');
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatch(/C168.*1\s·\s1\s000,00\sDH/);
    expect(lignes[1]).toMatch(/C196.*0\s·\s0,00\sDH/);
    expect(page.querySelector('a[href*="chantierId=2"]')).not.toBeNull();
  });

  it('applique les filtres de l’URL au catalogue, aux effectifs et à la Paie, comme les autres vues', async () => {
    chantiers.search.mockReturnValue(of(pageDe([MARRAKECH])));
    paie.analyser.mockReturnValue(of({ ...ANALYSE, parChantier: [{ id: 2, code: 'C196', libelle: 'Nord', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }] }));
    await ouvrir('/chantiers/analytique?periode=2026-08&code=C196&actif=false');
    const page = harness.routeNativeElement as HTMLElement;

    expect(vi.mocked(chantiers.search).mock.lastCall?.[0]).toEqual({ code: 'C196', designation: undefined, actif: false });
    expect(vi.mocked(employes.regrouper).mock.lastCall).toEqual([{ chantierIds: [2] }, 'CHANTIER']);
    expect(vi.mocked(paie.analyser).mock.lastCall?.[0]).toEqual({ periode: '2026-08', chantierIds: [2] });
    expect(page.textContent).toContain('chantiers filtrés');
    expect(page.querySelectorAll('table tbody tr')).toHaveLength(1);
  });

  it('n’interroge ni Employé ni Paie quand les filtres ne correspondent à aucun chantier', async () => {
    chantiers.search.mockReturnValue(of(pageDe([])));
    await ouvrir('/chantiers/analytique?periode=2026-08&code=zzz');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucun chantier ne correspond à ces critères.');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('garde l’historique et les indicateurs à zéro quand le mois choisi n’a aucun bulletin', async () => {
    paie.analyser.mockReturnValue(of({ ...ANALYSE_MOIS_VIDE, evolution: [ANALYSE.evolution[0]] }));
    await ouvrir('/chantiers/analytique?chantierId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucun bulletin pour C168');
    expect(page.textContent).toContain('Effectif payé');
    expect(page.textContent).toContain('Évolution mensuelle de la masse');
    expect(page.querySelectorAll('table tbody tr')).toHaveLength(1);
  });

  it('garde la situation Employé et masque la Paie sans PAIE_READ', async () => {
    permissions = (code) => code === 'CHANTIER_READ' || code === 'EMPLOYEE_READ';
    await ouvrir('/chantiers/analytique?chantierId=1&periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).toContain('3 employés');
    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).not.toContain('Effectif payé');
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('masque les données Employé pour les personnes qui n’ont pas EMPLOYEE_READ', async () => {
    permissions = (code) => code === 'CHANTIER_READ' || code === 'PAIE_READ';
    await ouvrir('/chantiers/analytique?periode=2026-08');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(page.textContent).not.toContain('Situation des fiches Employé');
    expect(page.textContent).not.toContain('Employés sur les fiches récentes');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(page.textContent).toContain('Répartition par chantier');
  });

  it('n’appelle ni Employé ni Paie quand le compte n’a que CHANTIER_READ', async () => {
    permissions = (code) => code === 'CHANTIER_READ';
    await ouvrir('/chantiers/analytique');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('signale l’absence de période et ignore un mois invalide', async () => {
    paie.listerPeriodes.mockReturnValue(of([]));
    await ouvrir('/chantiers/analytique?periode=2026-13');
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.textContent).toContain('Aucun mois de paie n’est disponible.');
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('met à jour la période dans l’URL et revient à tous les chantiers', async () => {
    const composant = await ouvrir('/chantiers/analytique?chantierId=1&periode=2026-08');

    composant['changerPeriode']({ target: { value: '2026-07' } } as unknown as Event);
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('periode=2026-07');
    composant['retourVueEnsemble']();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).not.toContain('chantierId=');
  });
});
