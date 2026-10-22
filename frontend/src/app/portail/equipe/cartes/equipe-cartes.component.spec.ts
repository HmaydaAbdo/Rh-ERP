import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaiePeriodeResume } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';
import { EquipeCartesComponent } from './equipe-cartes.component';

const EQUIPES: Equipe[] = [
  { id: 1, version: 0, code: 'CH', libelle: 'Chauffeurs' },
  { id: 2, version: 0, code: 'OP', libelle: 'Opérateurs' }
];
const PERIODES: PaiePeriodeResume[] = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 0, stcMontant: 0 }];
const ANALYTIQUE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 0, stcMontant: 0 },
  moisPrecedent: null,
  parChantier: [],
  parEquipe: [
    { id: 1, code: 'CH', libelle: 'Chauffeurs', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 },
    { id: 2, code: 'OP', libelle: 'Opérateurs', masse: 0, effectif: 0, stc: 0, stcMontant: 0 }
  ],
  parFonction: [], tranches: [],
  evolution: [{ periode: '2026-08', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};

describe('EquipeCartesComponent', () => {
  let equipes: MockedObject<EquipeService>;
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/equipes/cartes'): Promise<EquipeCartesComponent> {
    return harness.navigateByUrl(url, EquipeCartesComponent);
  }

  beforeEach(async () => {
    permissions = (code) => ['EQUIPE_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    equipes = { search: vi.fn().mockReturnValue(of({ content: EQUIPES, page: { size: 12, number: 0, totalElements: 2, totalPages: 1 } })) } as unknown as MockedObject<EquipeService>;
    employes = { regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 3, actifs: 3 }])) } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      analyser: vi.fn().mockReturnValue(of(ANALYTIQUE))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'equipes/cartes', component: EquipeCartesComponent }]),
        { provide: EquipeService, useValue: equipes },
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche les fiches Employé et les indicateurs du dernier mois de Paie', async () => {
    await ouvrir('/equipes/cartes?code=CH');
    const page = harness.routeNativeElement as HTMLElement;
    const cartes = page.querySelectorAll('.equipe-carte');

    expect(cartes).toHaveLength(2);
    expect(cartes[0].textContent).toContain('Chauffeurs');
    expect(cartes[0].textContent).toContain('Employés sur les fiches récentes');
    expect(cartes[0].textContent).toContain('Payés · août 2026');
    expect(cartes[0].textContent).toMatch(/4[, ]500\.00 DH/);
    expect(employes.regrouper).toHaveBeenCalledWith({}, 'EQUIPE');
    expect(paie.analyser).toHaveBeenCalledWith({ periode: '2026-08' });
    expect(page.querySelector('a[href^="/equipes/analytique?equipeId=1"]')).not.toBeNull();
  });

  it('masque les données et les appels Paie/Employé quand les droits manquent', async () => {
    permissions = (code) => code === 'EQUIPE_READ';
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

  it('conserve les filtres dans le lien vers l’historique et borne la pagination', async () => {
    const composant = await ouvrir('/equipes/cartes?code=CH');
    composant['total'].set(13);
    const recherche = vi.mocked(equipes.search);
    recherche.mockReturnValue(of({ content: EQUIPES.slice(0, 1), page: { size: 12, number: 1, totalElements: 13, totalPages: 2 } }));

    composant['changerPage'](1);
    await harness.fixture.whenStable();

    expect(recherche.mock.lastCall?.[0]).toEqual({ code: 'CH', libelle: '' });
    expect(recherche.mock.calls.some(([, requete]) => requete.page === 1 && requete.size === 12)).toBe(true);
    expect(TestBed.inject(Router).url).toContain('page=1');
    const nombreAppels = recherche.mock.calls.length;
    composant['changerPage'](2);
    composant['changerPage'](-1);
    expect(recherche.mock.calls).toHaveLength(nombreAppels);
  });
});
