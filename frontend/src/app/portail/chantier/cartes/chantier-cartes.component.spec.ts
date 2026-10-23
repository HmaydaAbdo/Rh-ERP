import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique, PaiePeriodeResume } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';
import { ChantierCartesComponent } from './chantier-cartes.component';

const CHANTIERS: Chantier[] = [
  { id: 1, version: 0, code: 'C168', designation: 'Route de Nador', nom: null, sourceErp: true, actif: true },
  { id: 2, version: 0, code: 'C196', designation: 'Marrakech', nom: 'Nord', sourceErp: false, actif: false }
];
const PERIODES: PaiePeriodeResume[] = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 0, stcMontant: 0 }];
const ANALYTIQUE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 0, stcMontant: 0 },
  moisPrecedent: null,
  parChantier: [{ id: 1, code: 'C168', libelle: 'Route de Nador', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }],
  parEquipe: [], parFonction: [], tranches: [],
  evolution: [{ periode: '2026-08', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};

describe('ChantierCartesComponent', () => {
  let chantiers: MockedObject<ChantierService>;
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/chantiers/cartes'): Promise<ChantierCartesComponent> {
    return harness.navigateByUrl(url, ChantierCartesComponent);
  }

  beforeEach(async () => {
    permissions = (code) => ['CHANTIER_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    chantiers = { search: vi.fn().mockReturnValue(of({ content: CHANTIERS, page: { size: 12, number: 0, totalElements: 2, totalPages: 1 } })) } as unknown as MockedObject<ChantierService>;
    employes = { regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'C168', libelle: 'Route de Nador', effectif: 3, actifs: 3 }])) } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of(PERIODES)),
      analyser: vi.fn().mockReturnValue(of(ANALYTIQUE))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'chantiers/cartes', component: ChantierCartesComponent }]),
        { provide: ChantierService, useValue: chantiers },
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche statut, fiches Employé et indicateurs du dernier mois de Paie', async () => {
    await ouvrir('/chantiers/cartes?code=C1');
    const page = harness.routeNativeElement as HTMLElement;
    const cartes = page.querySelectorAll('.chantier-carte');

    expect(cartes).toHaveLength(2);
    expect(cartes[0].textContent).toContain('C168');
    expect(cartes[0].textContent).toContain('En cours');
    expect(cartes[0].textContent).toContain('Employés sur les fiches récentes');
    expect(cartes[0].textContent).toContain('Payés · août 2026');
    expect(cartes[0].textContent).toMatch(/4[, ]500\.00 DH/);
    expect(cartes[1].textContent).toContain('Clôturé');
    expect(cartes[1].textContent).toContain('Nord');
    expect(cartes[1].textContent).toContain('Marrakech');
    expect(cartes[1].textContent).toMatch(/0\.00 DH/);
    expect(employes.regrouper).toHaveBeenCalledWith({}, 'CHANTIER');
    expect(paie.analyser).toHaveBeenCalledWith({ periode: '2026-08' });
    expect(page.querySelector('a[href^="/chantiers/analytique?chantierId=1"]')).not.toBeNull();
  });

  it('masque les données et les appels Paie/Employé quand les droits manquent', async () => {
    permissions = (code) => code === 'CHANTIER_READ';
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

  it('transmet code, désignation et statut de l’URL à la recherche et borne la pagination', async () => {
    const composant = await ouvrir('/chantiers/cartes?code=C1&designation=route&actif=false');
    composant['total'].set(13);
    const recherche = vi.mocked(chantiers.search);
    expect(recherche.mock.lastCall?.[0]).toEqual({ code: 'C1', designation: 'route', actif: false });
    recherche.mockReturnValue(of({ content: CHANTIERS.slice(0, 1), page: { size: 12, number: 1, totalElements: 13, totalPages: 2 } }));

    composant['changerPage'](1);
    await harness.fixture.whenStable();

    expect(recherche.mock.calls.some(([, requete]) => requete.page === 1 && requete.size === 12)).toBe(true);
    expect(TestBed.inject(Router).url).toContain('page=1');
    const nombreAppels = recherche.mock.calls.length;
    composant['changerPage'](2);
    composant['changerPage'](-1);
    expect(recherche.mock.calls).toHaveLength(nombreAppels);
  });
});
