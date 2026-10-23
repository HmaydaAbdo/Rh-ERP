import type { MockedObject } from 'vitest';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { EmployeeService } from '../../employee/services/employee.service';
import { PaieAnalytique } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { critereEmployesDe, criterePaieDe } from '../perimetre';
import { ModulePerimetre } from '../perimetre-module';
import { AnalytiquePerimetreComponent } from './analytique-perimetre.component';

const ITEMS = [
  { id: 1, code: 'C168', libelle: 'Nador', detail: null, statut: null },
  { id: 2, code: 'C196', libelle: 'Marrakech', detail: null, statut: null }
];

const ANALYSE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 1, stcMontant: 1000 },
  moisPrecedent: { masse: 4000, effectif: 1, coutMoyen: 4000, nombreChantiers: 1, stc: 0, stcMontant: 0 },
  parChantier: [{ id: 1, code: 'C168', libelle: 'Nador', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  parEquipe: [{ id: 5, code: 'CH', libelle: 'Chauffeurs', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  parFonction: [{ id: 7, libelle: 'MACON', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  tranches: [{ min: 0, max: 5000, effectif: 1 }, { min: 5000, max: null, effectif: 0 }],
  evolution: [
    { periode: '2026-07', masse: 4000, effectif: 1, stc: 0, stcMontant: 0 },
    { periode: '2026-08', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }
  ],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};

const FICHES = {
  effectif: 3, actifs: 2, inactifs: 1, ageMoyen: 35.5, ancienneteMoyenne: 4.2, embauchesDouzeMois: 1,
  parAge: [{ min: 0, max: 25, effectif: 1 }, { min: 25, max: null, effectif: 2 }],
  parAnciennete: [{ min: 0, max: 1, effectif: 1 }, { min: 1, max: null, effectif: 2 }]
};

function module(): ModulePerimetre {
  return {
    cle: 'chantier',
    libellePluriel: 'chantiers',
    libelleRacine: 'Tous les chantiers',
    dimension: 'CHANTIER',
    ordre: ['CHANTIER', 'EQUIPE', 'FONCTION'],
    route: '/chantiers',
    permission: 'CHANTIER_READ',
    parametresListe: () => ({}),
    critereEmployes: (_params, portee) => critereEmployesDe(portee),
    criterePaie: (_params, portee, periode) => criterePaieDe(portee, periode),
    noteMouvements: (params) => (params.get('code') ? 'Le code ne s’applique pas ici.' : null),
    catalogue: {
      filtreActif: (params) => params.get('code') !== null,
      charger: vi.fn().mockImplementation((params) => of(params.get('code') === 'zzz' ? [] : params.get('code') ? ITEMS.slice(0, 1) : ITEMS)),
      lien: (id) => ['/chantiers', id]
    }
  };
}

@Component({
  selector: 'app-hote',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HoteComponent {
  module = module();
}

@Component({
  selector: 'app-hote-paie',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HotePaieComponent {
  module: ModulePerimetre = { ...module(), cle: 'paie', dimension: null, catalogue: undefined, niveauPeriode: true, route: '/paie' };
}

@Component({
  selector: 'app-hote-equipe',
  imports: [AnalytiquePerimetreComponent],
  template: '<app-analytique-perimetre [module]="module" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HoteEquipeComponent {
  module: ModulePerimetre = {
    ...module(), cle: 'equipe', libellePluriel: 'équipes', libelleRacine: 'Toutes les équipes', dimension: 'EQUIPE',
    ordre: ['EQUIPE', 'CHANTIER', 'FONCTION'], ordreAnalytique: ['EMPLOYEE', 'PAIE'],
    libelleSectionEmployes: 'Effectifs et organisation', libelleRepartitionPrincipale: 'Effectifs par équipe',
    catalogue: undefined, route: '/equipes'
  };
}

describe('AnalytiquePerimetreComponent', () => {
  let employes: MockedObject<EmployeeService>;
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let permissions: (code: string) => boolean;

  async function ouvrir(url = '/chantiers/analytique'): Promise<HTMLElement> {
    await harness.navigateByUrl(url, HoteComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  beforeEach(async () => {
    permissions = (code) => ['CHANTIER_READ', 'EMPLOYEE_READ', 'PAIE_READ'].includes(code);
    employes = {
      regrouper: vi.fn().mockReturnValue(of([{ id: 1, code: 'C168', libelle: 'Nador', effectif: 3, actifs: 2 }])),
      analyser: vi.fn().mockReturnValue(of(FICHES))
    } as unknown as MockedObject<EmployeeService>;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of([{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 1, stcMontant: 1000 }])),
      analyser: vi.fn().mockReturnValue(of(ANALYSE)),
      effectifs: vi.fn().mockReturnValue(of([
        { periode: '2026-07', effectif: 1, entrees: null, sorties: 0, mutations: null },
        { periode: '2026-08', effectif: 2, entrees: 1, sorties: 0, mutations: 0 }
      ]))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'chantiers/analytique', component: HoteComponent },
          { path: 'equipes/analytique', component: HoteEquipeComponent },
          { path: 'paie/analytique', component: HotePaieComponent }
        ]),
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions(code) } },
        { provide: ThemeService, useValue: { theme: signal('light') } },
        { provide: ChantierReferenceService, useValue: { fetchById: () => of({ id: 1, code: 'C168' }) } },
        { provide: EquipeReferenceService, useValue: { fetchById: () => of({ id: 5, code: 'CH' }) } },
        { provide: FunctionReferenceService, useValue: { fetchById: () => of({ id: 7, libelle: 'MACON' }) } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche les chiffres de la paie avec leur variation et des graphiques accompagnés de leur tableau de données', async () => {
    const page = await ouvrir();
    const tuiles = Array.from(page.querySelectorAll('.perimetre-analytique__tuile')).map((t) => t.textContent ?? '');

    expect(page.textContent).toContain('Paie · août 2026');
    expect(tuiles[0]).toMatch(/Masse salariale\s*4\s500,00\sDH\s*\+12,5 % sur le mois précédent/);
    expect(tuiles.some((t) => t.includes('Chantiers concernés'))).toBe(true);
    expect(page.querySelectorAll('stp-chart').length).toBeGreaterThanOrEqual(5);
    expect(page.querySelectorAll('details').length).toBeGreaterThanOrEqual(5);
    expect(page.querySelectorAll('.perimetre-analytique__section--exportable > app-pdf-export-button').length).toBeGreaterThanOrEqual(4);
    expect(page.querySelector('.perimetre-analytique__section--exportable app-pdf-export-button button[aria-label="Exporter l’évolution mensuelle en PDF"]')).not.toBeNull();
    expect(page.querySelector('a.stp-button[href="/chantiers/cartes"]')).not.toBeNull();
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08', chantierIds: undefined }));
  });

  it('place les effectifs et leur répartition par équipe avant les indicateurs Paie selon la configuration du domaine', async () => {
    await harness.navigateByUrl('/equipes/analytique', HoteEquipeComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const page = harness.routeNativeElement as HTMLElement;
    const titres = Array.from(page.querySelectorAll('.perimetre-analytique__titre')).map((element) => element.textContent?.trim());

    expect(titres[0]).toBe('Effectifs et organisation');
    expect(titres[1]).toBe('Paie · août 2026');
    expect(page.textContent).toContain('Effectifs par équipe');
    expect(employes.regrouper).toHaveBeenLastCalledWith({ chantierIds: undefined, equipeIds: undefined, fonctionIds: undefined }, 'EQUIPE');
  });

  it('change la mesure de l’évolution et celle de la répartition', async () => {
    const page = await ouvrir();
    const bouton = (nom: string) => Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.trim() === nom) as HTMLButtonElement;

    expect(bouton('Masse (DH)').getAttribute('aria-pressed')).toBe('true');
    bouton('STC (personnes)').click();
    harness.fixture.detectChanges();
    expect(bouton('STC (personnes)').getAttribute('aria-pressed')).toBe('true');
    bouton('Effectif payé').click();
    harness.fixture.detectChanges();
    expect(bouton('Effectif payé').getAttribute('aria-pressed')).toBe('true');
  });

  it('répartit par une autre dimension sans relancer la paie, STC compris dans le tableau', async () => {
    const page = await ouvrir();
    const appelsPaie = paie.analyser.mock.calls.length;
    const bouton = Array.from(page.querySelectorAll('.perimetre-analytique__choix button')).find((b) => b.textContent?.trim() === 'Fonction') as HTMLButtonElement;
    bouton.click();
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();

    expect(paie.analyser.mock.calls.length).toBe(appelsPaie);
    expect(page.textContent).toContain('Répartition par fonction');
    expect(page.textContent).toMatch(/MACON.*1\s·\s1\s000,00\sDH/);
    expect(employes.regrouper).toHaveBeenLastCalledWith({ chantierIds: undefined, equipeIds: undefined, fonctionIds: undefined }, 'FONCTION');
  });

  it('approfondit le périmètre depuis le tableau de la répartition et masque le nombre de chantiers', async () => {
    const page = await ouvrir();
    (page.querySelector('button[aria-label="Approfondir C168"]') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();

    expect(TestBed.inject(Router).url).toContain('chantierIds=1');
    expect(page.querySelector('.perimetre-analytique__etape')?.textContent).toContain('C168');
    expect(paie.analyser).toHaveBeenLastCalledWith(expect.objectContaining({ chantierIds: [1] }));
    const tuiles = Array.from(page.querySelectorAll('.perimetre-analytique__tuile')).map((t) => t.textContent ?? '');
    expect(tuiles.some((t) => t.includes('Chantiers concernés'))).toBe(false);
  });

  it('applique les filtres du module au périmètre, aux effectifs et à la paie', async () => {
    const page = await ouvrir('/chantiers/analytique?code=C1');

    expect(employes.analyser).toHaveBeenLastCalledWith({ chantierIds: [1], equipeIds: undefined, fonctionIds: undefined });
    expect(paie.analyser).toHaveBeenLastCalledWith(expect.objectContaining({ periode: '2026-08', chantierIds: [1] }));
    expect(paie.effectifs).toHaveBeenLastCalledWith({ chantierIds: [1], equipeIds: undefined, fonctionIds: undefined });
    expect(page.textContent).toContain('Le code ne s’applique pas ici.');
  });

  it('n’interroge ni Employé ni Paie quand les filtres ne correspondent à aucun élément', async () => {
    const page = await ouvrir('/chantiers/analytique?code=zzz');

    expect(page.textContent).toContain('Aucun élément ne correspond à ces critères.');
    expect(employes.analyser).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('garde les indicateurs à zéro et l’historique quand le mois choisi n’a aucun bulletin', async () => {
    paie.analyser.mockReturnValue(of({ ...ANALYSE, kpis: { masse: 0, effectif: 0, coutMoyen: null, nombreChantiers: 0, stc: 0, stcMontant: 0 }, moisPrecedent: null, parChantier: [], parEquipe: [], parFonction: [], evolution: [ANALYSE.evolution[0]] }));
    const page = await ouvrir('/chantiers/analytique?chantierIds=1&periode=2026-08');

    expect(page.textContent).toContain('Aucun bulletin sur ce périmètre en août 2026');
    expect(page.textContent).toContain('Effectif payé');
    expect(page.textContent).toContain('Évolution mensuelle');
  });

  it('montre la pyramide des âges, l’ancienneté et la répartition en poste / sortis des fiches Employé', async () => {
    const page = await ouvrir();

    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).toContain('Pyramide des âges');
    expect(page.textContent).toContain('Ancienneté');
    expect(page.textContent).toContain('Employés par chantier');
    expect(page.textContent).toContain('moins de 25 ans');
  });

  it('affiche les mouvements mois par mois tirés de la paie', async () => {
    const page = await ouvrir();

    expect(page.textContent).toContain('Mouvements mois par mois');
    expect(page.textContent).toMatch(/août 2026\s*2\s*1\s*0\s*0/);
  });

  it('garde les fiches Employé et masque la paie sans PAIE_READ', async () => {
    permissions = (code) => code === 'CHANTIER_READ' || code === 'EMPLOYEE_READ';
    const page = await ouvrir();

    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).toContain('Situation des fiches Employé');
    expect(page.textContent).not.toContain('Masse salariale');
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
    expect(paie.effectifs).not.toHaveBeenCalled();
  });

  it('garde la paie et masque les fiches sans EMPLOYEE_READ', async () => {
    permissions = (code) => code === 'CHANTIER_READ' || code === 'PAIE_READ';
    const page = await ouvrir();

    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(page.textContent).toContain('Masse salariale');
    expect(employes.analyser).not.toHaveBeenCalled();
    expect(employes.regrouper).not.toHaveBeenCalled();
  });

  it('n’appelle aucune source avec le seul droit sur le module', async () => {
    permissions = (code) => code === 'CHANTIER_READ';
    const page = await ouvrir();

    expect(page.textContent).toContain('Les indicateurs de paie ne sont pas disponibles pour votre compte.');
    expect(page.textContent).toContain('Les effectifs des fiches Employé ne sont pas disponibles pour votre compte.');
    expect(employes.analyser).not.toHaveBeenCalled();
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('signale l’absence de mois de paie', async () => {
    paie.listerPeriodes.mockReturnValue(of([]));
    const page = await ouvrir();

    expect(page.textContent).toContain('Aucun mois de paie n’est disponible.');
    expect(paie.analyser).not.toHaveBeenCalled();
  });

  it('module Paie : ouvre le mois le plus récent en l’inscrivant dans l’URL, et laisse la barre choisir le mois', async () => {
    await harness.navigateByUrl('/paie/analytique', HotePaieComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    const page = harness.routeNativeElement as HTMLElement;

    expect(TestBed.inject(Router).url).toContain('periode=2026-08');
    expect(page.querySelector('select')).toBeNull();
    expect(paie.analyser).toHaveBeenCalledWith(expect.objectContaining({ periode: '2026-08' }));
  });

  it('signale la qualité des données de la paie', async () => {
    paie.analyser.mockReturnValue(of({ ...ANALYSE, qualite: { sansEquipe: 5, sansObservation: 2 } }));
    const page = await ouvrir();

    expect(page.textContent).toContain('Qualité des données : 5 bulletin(s) sans équipe, 2 sans observation.');
  });

  it('met à jour le mois dans l’URL et retire une étape', async () => {
    const page = await ouvrir('/chantiers/analytique?chantierIds=1&periode=2026-08');
    const select = page.querySelector('select') as HTMLSelectElement;
    select.value = '2026-08';
    select.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('periode=2026-08');

    (page.querySelector('button[aria-label="Retirer l’étape Chantier"]') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).not.toContain('chantierIds');
  });
});
