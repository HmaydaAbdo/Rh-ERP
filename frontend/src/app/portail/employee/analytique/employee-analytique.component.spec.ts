import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { PaieService } from '../../paie/services/paie.service';
import { EmployeeAnalytique } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { EmployeeAnalytiqueComponent, libelleTranche } from './employee-analytique.component';

registerLocaleData(localeFr);

const ANALYSE: EmployeeAnalytique = {
  effectif: 40,
  actifs: 30,
  inactifs: 10,
  ageMoyen: 37.4,
  ancienneteMoyenne: 5.2,
  embauchesDouzeMois: 6,
  parAge: [{ min: 0, max: 25, effectif: 4 }, { min: 25, max: 35, effectif: 12 }, { min: 55, max: null, effectif: 2 }],
  parAnciennete: [{ min: 0, max: 1, effectif: 6 }, { min: 1, max: 3, effectif: 10 }]
};

describe('libelleTranche', () => {
  it('écrit les âges borne haute incluse, l’ancienneté de borne à borne', () => {
    expect(libelleTranche({ min: 0, max: 25, effectif: 0 }, 'age')).toBe('moins de 25 ans');
    expect(libelleTranche({ min: 25, max: 35, effectif: 0 }, 'age')).toBe('25-34 ans');
    expect(libelleTranche({ min: 55, max: null, effectif: 0 }, 'age')).toBe('55 ans et plus');
    expect(libelleTranche({ min: 0, max: 1, effectif: 0 }, 'anciennete')).toBe('moins d’un an');
    expect(libelleTranche({ min: 1, max: 3, effectif: 0 }, 'anciennete')).toBe('1-3 ans');
  });
});

describe('EmployeeAnalytiqueComponent', () => {
  let harness: RouterTestingHarness;
  let employes: { analyser: ReturnType<typeof vi.fn>; regrouper: ReturnType<typeof vi.fn> };
  let paie: { effectifs: ReturnType<typeof vi.fn> };
  const racine = () => harness.routeNativeElement as HTMLElement;
  const texte = (selecteur: string) => Array.from(racine().querySelectorAll(selecteur)).map((e) => e.textContent?.replace(/\s+/g, ' ').trim());

  async function afficher(permissions: string[], url = '/employees/analytique'): Promise<void> {
    employes = {
      analyser: vi.fn().mockReturnValue(of(ANALYSE)),
      regrouper: vi.fn().mockReturnValue(of([{ id: 3, code: 'C168', libelle: 'Nador', effectif: 40, actifs: 30 }]))
    };
    paie = { effectifs: vi.fn().mockReturnValue(of([{ periode: '2026-08', effectif: 38, entrees: null, sorties: 1, mutations: null }, { periode: '2026-09', effectif: 40, entrees: 3, sorties: 1, mutations: 2 }])) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'employees/analytique', component: EmployeeAnalytiqueComponent }]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        fournirPermissions(permissions).providers,
        { provide: EmployeeService, useValue: employes },
        { provide: PaieService, useValue: paie }
      ]
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, EmployeeAnalytiqueComponent);
    harness.detectChanges();
  }

  it('montre les chiffres clés du périmètre de la barre', async () => {
    await afficher(['EMPLOYEE_READ'], '/employees/analytique?chantierIds=3');

    expect(employes.analyser).toHaveBeenCalledWith(expect.objectContaining({ chantierIds: [3] }));
    expect(texte('.analytique-employes__tuile strong')).toEqual(['40', '30', '10', '37,4 ans', '5,2 ans', '6']);
    expect(texte('.analytique-employes__tuile small')).toEqual(['75 % de l’effectif']);
  });

  it('répartit par chantier, puis par la dimension choisie', async () => {
    await afficher(['EMPLOYEE_READ']);
    expect(employes.regrouper).toHaveBeenLastCalledWith(expect.anything(), 'CHANTIER');

    (Array.from(racine().querySelectorAll('.analytique-employes__choix button')).find((b) => b.textContent?.trim() === 'Fonction') as HTMLButtonElement).click();
    harness.detectChanges();
    await harness.fixture.whenStable();

    expect(employes.regrouper).toHaveBeenLastCalledWith(expect.anything(), 'FONCTION');
  });

  it('ne montre les mouvements de la paie qu’à qui peut la lire', async () => {
    await afficher(['EMPLOYEE_READ']);
    expect(paie.effectifs).not.toHaveBeenCalled();
    expect(racine().textContent).not.toContain('Mouvements mois par mois');

    TestBed.resetTestingModule();
    await afficher(['EMPLOYEE_READ', 'PAIE_READ'], '/employees/analytique?chantierIds=3&nom=ali');
    expect(paie.effectifs).toHaveBeenCalledWith({ chantierIds: [3], fonctionIds: [], equipeIds: [] });
    expect(racine().textContent).toContain('Mouvements mois par mois');
    expect(racine().textContent).toContain('Le nom, le CIN et le statut de la barre ne s’appliquent pas ici.');
  });
});
