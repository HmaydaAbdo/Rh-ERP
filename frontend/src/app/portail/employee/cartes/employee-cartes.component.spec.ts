import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { DimensionEmployes, Employee, EmployeeRegroupement } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { EmployeeCartesComponent } from './employee-cartes.component';

const GROUPES: Record<DimensionEmployes, EmployeeRegroupement[]> = {
  CHANTIER: [
    { id: 3, code: 'C168', libelle: 'Nador', effectif: 30, actifs: 27 },
    { id: 4, code: 'C059', libelle: 'Voirie', effectif: 10, actifs: 10 }
  ],
  EQUIPE: [
    { id: 5, code: 'OP', libelle: 'Opérateurs', effectif: 20, actifs: 18 },
    { id: 0, code: null, libelle: 'Sans équipe', effectif: 10, actifs: 9 }
  ],
  FONCTION: [{ id: 7, code: 'MACON', libelle: 'MACON', effectif: 20, actifs: 18 }]
};

const EMPLOYE: Employee = {
  id: 9, version: 0, nomPrenom: 'Ali Alaoui', cin: 'AB1', dateNaissance: '1990-01-01', dateEmbauche: '2020-01-01',
  fonction: { id: 7, libelle: 'MACON' }, chantier: { id: 3, code: 'C168' }, equipe: { id: 5, code: 'OP', libelle: 'Opérateurs' },
  salaire: null, typeSalaire: null, statut: 'ACTIF'
};

describe('EmployeeCartesComponent', () => {
  let harness: RouterTestingHarness;
  let service: { regrouper: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn> };
  const racine = () => harness.routeNativeElement as HTMLElement;
  const texte = (selecteur: string) => Array.from(racine().querySelectorAll(selecteur)).map((e) => e.textContent?.replace(/\s+/g, ' ').trim());
  const routeur = () => TestBed.inject(Router);

  async function afficher(url: string): Promise<void> {
    service = {
      regrouper: vi.fn().mockImplementation((_: unknown, dimension: DimensionEmployes) => of(GROUPES[dimension])),
      search: vi.fn().mockReturnValue(of({ content: [EMPLOYE], page: { size: 24, number: 0, totalElements: 1, totalPages: 1 } }))
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'employees/cartes', component: EmployeeCartesComponent }]),
        { provide: EmployeeService, useValue: service },
        { provide: ChantierReferenceService, useValue: { fetchById: () => of({ id: 3, code: 'C168' }) } },
        { provide: EquipeReferenceService, useValue: { fetchById: () => of({ id: 5, code: 'OP', libelle: 'Opérateurs' }) } },
        { provide: FunctionReferenceService, useValue: { fetchById: () => of({ id: 7, libelle: 'MACON' }) } }
      ]
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, EmployeeCartesComponent);
    harness.detectChanges();
  }

  async function stabiliser(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('commence par les chantiers, avec l’effectif et la part de chacun', async () => {
    await afficher('/employees/cartes');

    expect(service.regrouper).toHaveBeenLastCalledWith(expect.anything(), 'CHANTIER');
    expect(texte('.cartes-employes__resume')).toEqual(['40 employé(s) · 37 actif(s) · 2 chantier(s)']);
    expect(texte('.cartes-employes__code')).toEqual(['C168', 'C059']);
    expect(texte('.cartes-employes__detail')[0]).toBe('27 actif(s) · 3 inactif(s) · 75 %');
  });

  it('ouvrir un chantier en fait une étape du fil et descend aux équipes, « Sans équipe » compris', async () => {
    await afficher('/employees/cartes');

    (racine().querySelector('.cartes-employes__carte') as HTMLButtonElement).click();
    await stabiliser();

    expect(routeur().url).toBe('/employees/cartes?chantierIds=3');
    expect(service.regrouper).toHaveBeenLastCalledWith(expect.objectContaining({ chantierIds: [3] }), 'EQUIPE');
    expect(texte('.cartes-employes__etape')).toEqual(['Chantier C168']);
    expect(texte('.cartes-employes__code')).toEqual(['OP', 'Sans équipe']);
  });

  it('laisse choisir par quoi descendre, sauf une dimension déjà choisie', async () => {
    await afficher('/employees/cartes?chantierIds=3&par=fonction');

    expect(service.regrouper).toHaveBeenLastCalledWith(expect.anything(), 'FONCTION');
    const boutons = Array.from(racine().querySelectorAll<HTMLButtonElement>('.cartes-employes__choix button'));
    expect(boutons.map((b) => [b.textContent?.trim(), b.disabled, b.getAttribute('aria-pressed')])).toEqual([
      ['Chantier', true, 'false'],
      ['Équipe', false, 'false'],
      ['Fonction', false, 'true'],
      ['Employés', false, 'false']
    ]);

    boutons[1].click();
    await stabiliser();
    expect(routeur().url).toBe('/employees/cartes?chantierIds=3&par=equipe');
  });

  it('arrive aux employés quand tout est choisi, chacun ouvrant sa fiche', async () => {
    await afficher('/employees/cartes?chantierIds=3&equipeIds=0&fonctionIds=7');

    expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ chantierIds: [3], equipeIds: [0], fonctionIds: [7] }), { page: 0, size: 24, sort: 'nomPrenom,asc' });
    expect(texte('.cartes-employes__etape')).toEqual(['Chantier C168', 'Équipe Sans équipe', 'Fonction MACON']);
    expect(racine().querySelector('.cartes-employes__fiche')?.getAttribute('href')).toBe('/employees/9');
  });

  it('ouvre la liste sur le même périmètre, et retire une étape sans perdre les autres', async () => {
    await afficher('/employees/cartes?chantierIds=3&equipeIds=5&nom=ali');

    expect(racine().querySelector('a[href^="/employees?"]')?.getAttribute('href')).toBe('/employees?nom=ali&chantierIds=3&equipeIds=5');

    (racine().querySelector('button[aria-label="Retirer l’étape Chantier"]') as HTMLButtonElement).click();
    await stabiliser();
    expect(routeur().url).toBe('/employees/cartes?equipeIds=5&nom=ali');
  });
});
