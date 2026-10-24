import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { AUCUN_FILTRE } from '../filtres/employee-filtres';
import { EmployeeService } from '../services/employee.service';
import { EmployeeVuesComponent } from './employee-vues.component';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

const REFERENTIEL = { fetchPage: () => of({ items: [], totalRecords: 0 }), fetchById: (id: number) => of({ id, code: 'C' + id, libelle: 'L' + id }) };

describe('EmployeeVuesComponent', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'employees', component: EmployeeVuesComponent, children: [{ path: '', component: VueFactice }] }]),
        fournirPermissions(['EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'EMPLOYEE_IMPORT']).providers,
        { provide: EmployeeService, useValue: {} },
        { provide: FunctionReferenceService, useValue: REFERENTIEL },
        { provide: ChantierReferenceService, useValue: REFERENTIEL },
        { provide: EquipeReferenceService, useValue: REFERENTIEL }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  it("lit les filtres dans l'URL", async () => {
    const composant = await harness.navigateByUrl('/employees?nom=ali&chantierIds=3&statut=ACTIF', EmployeeVuesComponent);

    expect(composant['filtres']()).toEqual({ ...AUCUN_FILTRE, nomPrenom: 'ali', chantierIds: [3], statut: 'ACTIF' });
  });

  it("écrit les filtres de la barre dans l'URL et retire ceux qui sont vides", async () => {
    const composant = await harness.navigateByUrl('/employees?cin=AB1', EmployeeVuesComponent);

    composant['appliquer']({ ...AUCUN_FILTRE, fonctionIds: [2, 5], statut: 'INACTIF' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/employees?fonctionIds=2,5&statut=INACTIF');
  });

  it('garde le regroupement et le mois des Cartes quand un filtre de la barre change', async () => {
    const composant = await harness.navigateByUrl('/employees?periode=2026-08&chantierIds=3', EmployeeVuesComponent);

    composant['appliquer']({ ...AUCUN_FILTRE, chantierIds: [3], nomPrenom: 'ali' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/employees?periode=2026-08&chantierIds=3&nom=ali');
  });

  it("porte le titre, les trois onglets de vue et les actions dans l'en-tête, la barre de filtres au-dessus de la vue", async () => {
    await harness.navigateByUrl('/employees', EmployeeVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-vues__header h1')?.textContent).toBe('Employés');
    expect(Array.from(page.querySelectorAll('nav[aria-label="Vue des employés"] a')).map((a) => a.getAttribute('href'))).toEqual([
      '/employees',
      '/employees/cartes',
      '/employees/analytique'
    ]);
    expect(page.querySelector('.app-vues__header .app-vues__actions app-employee-actions')).not.toBeNull();
    expect(page.querySelector('app-employee-filtres')).not.toBeNull();
    expect(page.querySelector('app-collection-shell router-outlet')).not.toBeNull();
  });

  it('recrée la vue affichée après un import', async () => {
    const composant = await harness.navigateByUrl('/employees', EmployeeVuesComponent);
    vi.useFakeTimers();

    composant['rafraichirVue']();
    expect(composant['vueAffichee']()).toBe(false);
    vi.runAllTimers();
    expect(composant['vueAffichee']()).toBe(true);
    vi.useRealTimers();
  });
});
