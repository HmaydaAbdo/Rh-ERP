import type { MockedObject } from 'vitest';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { critereEmployesDe, criterePaieDe } from '../perimetre';
import { ModulePerimetre } from '../perimetre-module';
import { CartesPerimetreComponent } from './cartes-perimetre.component';

const ITEMS = [
  { id: 1, code: 'C168', libelle: 'Nador', detail: 'Route de Nador', statut: { libelle: 'En cours', severite: 'success' as const } },
  { id: 2, code: 'C196', libelle: 'Marrakech', detail: null, statut: { libelle: 'Clôturé', severite: 'neutral' as const } }
];

function analyse(parChantier: PaieAnalytique['parChantier'], parEquipe: PaieAnalytique['parEquipe'] = [], parFonction: PaieAnalytique['parFonction'] = []): PaieAnalytique {
  return {
    periode: '2026-08',
    kpis: { masse: 0, effectif: 0, coutMoyen: null, nombreChantiers: 0, stc: 0, stcMontant: 0 },
    moisPrecedent: null, parChantier, parEquipe, parFonction, tranches: [], evolution: [], qualite: { sansEquipe: 0, sansObservation: 0 }
  };
}

function module(avecCatalogue = true): ModulePerimetre {
  return {
    cle: 'chantier',
    libellePluriel: 'chantiers',
    libelleRacine: 'Tous les chantiers',
    dimension: avecCatalogue ? 'CHANTIER' : null,
    ordre: ['CHANTIER', 'EQUIPE', 'FONCTION'],
    route: '/chantiers',
    permission: 'CHANTIER_READ',
    parametresListe: (params) => ({ code: params.get('code') }),
    critereEmployes: (_params, portee) => critereEmployesDe(portee),
    criterePaie: (_params, portee, periode) => criterePaieDe(portee, periode),
    catalogue: avecCatalogue
      ? {
          filtreActif: (params) => params.get('code') !== null,
          charger: vi.fn().mockImplementation((params) => of(params.get('code') ? ITEMS.slice(0, 1) : ITEMS)),
          lien: (id) => ['/chantiers', id]
        }
      : undefined
  };
}

@Component({
  selector: 'app-hote',
  imports: [CartesPerimetreComponent],
  template: '<app-cartes-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HoteComponent {
  module = module();
}

@Component({
  selector: 'app-hote-equipe',
  imports: [CartesPerimetreComponent],
  template: '<app-cartes-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HoteEquipeComponent {
  module: ModulePerimetre = {
    ...module(), cle: 'equipe', libellePluriel: 'équipes', libelleRacine: 'Toutes les équipes', dimension: 'EQUIPE',
    ordre: ['EQUIPE', 'CHANTIER', 'FONCTION'], route: '/equipes', periodePaieRecenteFixe: true,
    sansRaccourciListe: true, sansLienEmployes: true
  };
}

describe('CartesPerimetreComponent', () => {
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/chantiers/cartes'): Promise<HTMLElement> {
    await harness.navigateByUrl(url, HoteComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  beforeEach(async () => {
    permissions = (code) => ['CHANTIER_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    employes = {
      regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'C168', libelle: 'Nador', effectif: 3, actifs: 2 }])),
      search: vi.fn().mockReturnValue(of({ content: [], page: { size: 24, number: 0, totalElements: 0, totalPages: 0 } }))
    } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of([
        { periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 0, stcMontant: 0 },
        { periode: '2026-07', nombreBulletins: 1, nombreChantiers: 1, masse: 4000, stc: 0, stcMontant: 0 }
      ])),
      analyser: vi.fn().mockImplementation((criteres: { periode: string }) =>
        of(criteres.periode === '2026-08'
          ? analyse([{ id: 1, code: 'C168', libelle: 'Nador', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }])
          : analyse([{ id: 1, code: 'C168', libelle: 'Nador', masse: 4000, effectif: 1, stc: 0, stcMontant: 0 }])))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'chantiers/cartes', component: HoteComponent }, { path: 'equipes/cartes', component: HoteEquipeComponent }]),
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } },
        { provide: ChantierReferenceService, useValue: { fetchById: () => of({ id: 1, code: 'C168' }) } },
        { provide: EquipeReferenceService, useValue: { fetchById: () => of({ id: 5, code: 'CH' }) } },
        { provide: FunctionReferenceService, useValue: { fetchById: () => of({ id: 7, libelle: 'MACON' }) } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche toutes les entrées du référentiel, avec statut, fiches Employé, paie du mois et variation', async () => {
    const page = await ouvrir();
    const cartes = page.querySelectorAll('.perimetre-carte');

    expect(cartes).toHaveLength(2);
    expect(cartes[0].textContent).toContain('C168');
    expect(cartes[0].textContent).toContain('En cours');
    expect(cartes[0].textContent).toContain('Route de Nador');
    expect(cartes[0].textContent).toContain('Employés sur les fiches récentes');
    expect(cartes[0].textContent).toContain('2 en poste');
    expect(cartes[0].textContent).toContain('Payés · août 2026');
    expect(cartes[0].textContent).toMatch(/4[, ]500\.00 DH/);
    expect(cartes[0].textContent).toContain('+12,5 %');
    expect(cartes[1].textContent).toContain('Clôturé');
    expect(cartes[1].textContent).toMatch(/0\.00 DH/);
    expect(page.textContent).toContain('2 chantiers');
    expect(employes.regrouper).toHaveBeenCalledWith({ chantierIds: undefined, equipeIds: undefined, fonctionIds: undefined }, 'CHANTIER');
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08' }));
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-07' }));
    expect(page.querySelector('a[href="/chantiers/1"]')).not.toBeNull();
    expect(page.querySelector('a[href^="/chantiers/analytique?chantierIds=1"]')).not.toBeNull();
    expect(page.querySelector('.perimetre-cartes__resultats-entete app-pdf-export-button button[aria-label="Exporter les résultats de ce périmètre en PDF"]')).not.toBeNull();
    expect(page.querySelector('.perimetre-cartes__resultats-entete app-pdf-export-button button[title]')).not.toBeNull();
    expect(page.textContent).not.toContain('Étape 1 sur 4');
    expect(page.textContent).not.toContain('Le parcours suit l’organisation définie');
  });

  it('ouvrir une carte l’ajoute au fil et descend à la dimension suivante dans le périmètre choisi', async () => {
    const page = await ouvrir();
    (page.querySelector('button[aria-label="Ouvrir C168"]') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(TestBed.inject(Router).url).toContain('chantierIds=1');
    expect(page.querySelector('.perimetre-cartes__etape')?.textContent).toContain('C168');
    expect(employes.regrouper).toHaveBeenLastCalledWith({ chantierIds: [1], equipeIds: undefined, fonctionIds: undefined }, 'EQUIPE');
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08', chantierIds: [1] }));
    expect(page.querySelector('.perimetre-cartes__niveau h2')?.textContent).toContain('Équipe');
  });

  it('suit la hiérarchie du domaine et ignore le regroupement demandé par une ancienne URL', async () => {
    const page = await ouvrir('/chantiers/cartes?chantierIds=1&par=fonction');

    expect(employes.regrouper).toHaveBeenLastCalledWith({ chantierIds: [1], equipeIds: undefined, fonctionIds: undefined }, 'EQUIPE');
    expect(page.querySelector('.perimetre-cartes__niveau h2')?.textContent).toContain('Équipe');
    expect(page.querySelector('.perimetre-cartes__choix')).toBeNull();
  });

  it('retire une étape du fil sans toucher aux filtres du module', async () => {
    const page = await ouvrir('/chantiers/cartes?code=C1&chantierIds=1&equipeIds=5');
    (page.querySelector('button[aria-label="Retirer l’étape Chantier"]') as HTMLButtonElement).click();
    await harness.fixture.whenStable();

    const url = TestBed.inject(Router).url;
    expect(url).toContain('code=C1');
    expect(url).toContain('equipeIds=5');
    expect(url).not.toContain('chantierIds');
  });

  it('applique le filtre du module au périmètre des niveaux suivants', async () => {
    await ouvrir('/chantiers/cartes?code=C1');

    expect(employes.regrouper).toHaveBeenLastCalledWith({ chantierIds: [1], equipeIds: undefined, fonctionIds: undefined }, 'CHANTIER');
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ chantierIds: [1] }));
  });

  it('ne garde que les groupes existants quand une autre dimension restreint le périmètre', async () => {
    employes.regrouper.mockReturnValue(of([{ id: 1, code: 'C168', libelle: 'Nador', effectif: 3, actifs: 3 }]));
    const page = await ouvrir('/chantiers/cartes?equipeIds=5&par=chantier');

    // C196 est dans le référentiel mais n'a ni fiche ni bulletin dans cette équipe : aucune carte à zéro n'est inventée.
    expect(page.querySelectorAll('.perimetre-carte')).toHaveLength(1);
    expect(page.querySelector('.perimetre-carte')?.textContent).toContain('C168');
  });

  it('montre les fiches des employés au dernier niveau et pagine', async () => {
    employes.search.mockReturnValue(of({
      content: [{ id: 9, nomPrenom: 'Zahra Idrissi', cin: 'CD456', fonction: { id: 1, libelle: 'MACON' }, chantier: { id: 1, code: 'C168' }, equipe: null, statut: 'ACTIF' }],
      page: { size: 24, number: 0, totalElements: 30, totalPages: 2 }
    }) as never);
    const page = await ouvrir('/chantiers/cartes?chantierIds=1&equipeIds=5&fonctionIds=7');

    expect(employes.search).toHaveBeenCalledWith({ chantierIds: [1], equipeIds: [5], fonctionIds: [7] }, { page: 0, size: 24, sort: 'nomPrenom,asc' });
    expect(page.textContent).toContain('Zahra Idrissi');
    expect(page.textContent).toContain('Afficher plus (29 restants)');
  });

  it('masque fiches et paie sans les droits et n’appelle ni Employé ni Paie', async () => {
    permissions = (code) => code === 'CHANTIER_READ';
    const page = await ouvrir();

    expect(page.querySelectorAll('.perimetre-carte')).toHaveLength(2);
    expect(page.textContent).not.toContain('Employés sur les fiches récentes');
    expect(page.textContent).not.toContain('Payés');
    expect(employes.regrouper).not.toHaveBeenCalled();
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
    expect(page.querySelector('.perimetre-cartes__niveau')).not.toBeNull();
  });

  it('signale l’absence de mois de paie sans inventer d’indicateurs', async () => {
    paie.listerPeriodes.mockReturnValue(of([]));
    const page = await ouvrir();

    expect(page.textContent).toContain('Aucun mois disponible');
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('change le mois de paie dans l’URL', async () => {
    const page = await ouvrir();
    const select = page.querySelector('select') as HTMLSelectElement;
    select.value = '2026-08';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toContain('periode=2026-08');
  });

  it('garde le mois Paie le plus récent et exporte chaque carte Équipe séparément', async () => {
    await harness.navigateByUrl('/equipes/cartes?periode=2026-07&code=CH', HoteEquipeComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('select')).toBeNull();
    expect(page.textContent).toContain('Paie · août 2026');
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08' }));
    expect(page.querySelector('a[href="/equipes"]')).toBeNull();
    expect(page.querySelector('a[href^="/employees"]')).toBeNull();
    expect(page.querySelectorAll('.perimetre-carte > app-pdf-export-button')).toHaveLength(1);
    expect(page.querySelector('.perimetre-carte app-pdf-export-button button[aria-label="Exporter Nador en PDF"]')).not.toBeNull();
  });

  it('renvoie à la vue Tabulaire avec les filtres du module, et aux employés avec le périmètre', async () => {
    const page = await ouvrir('/chantiers/cartes?code=C1&equipeIds=5&periode=2026-08');

    expect(page.querySelector('a[href="/chantiers?code=C1"]')).not.toBeNull();
    expect(page.querySelector('a[href="/employees?equipeIds=5"]')).not.toBeNull();
  });
});
