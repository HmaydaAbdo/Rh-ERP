import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { EmployeeListComponent } from './employee-list.component';

registerLocaleData(localeFr);

const EMPLOYES: Employee[] = [
  { id: 1, version: 0, nomPrenom: 'Ali Alaoui', cin: 'AB123', dateNaissance: '1990-03-07', dateEmbauche: '2020-11-02', fonction: { id: 1, libelle: 'MACON' }, chantier: { id: 2, code: 'C196' }, equipe: { id: 5, code: 'OP', libelle: 'Opérateurs' }, salaire: 4000, typeSalaire: 'MENSUEL', statut: 'ACTIF' },
  { id: 2, version: 0, nomPrenom: 'Zahra Idrissi', cin: 'CD456', dateNaissance: '1985-01-01', dateEmbauche: '2018-05-14', fonction: { id: 3, libelle: 'CHAUFFEUR' }, chantier: { id: 4, code: 'C168' }, equipe: null, salaire: 120, typeSalaire: 'JOURNALIER', statut: 'INACTIF' }
];

const page = (content: Employee[]) => ({ content, page: { size: 10, number: 0, totalElements: content.length, totalPages: 1 } });

const TOUTES = ['EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'EMPLOYEE_DELETE'];

describe('EmployeeListComponent', () => {
  let harness: RouterTestingHarness;
  let service: { search: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  const racine = () => harness.routeNativeElement as HTMLElement;
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement | null;
  const criteres = () => service.search.mock.lastCall![0];

  async function afficher(url = '/employees', permissions: string[] = TOUTES): Promise<void> {
    service = { search: vi.fn().mockReturnValue(of(page(EMPLOYES))), delete: vi.fn().mockReturnValue(of(undefined)) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'employees', component: EmployeeListComponent }]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        fournirPermissions(permissions).providers,
        { provide: EmployeeService, useValue: service }
      ]
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, EmployeeListComponent);
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  it('charge la première page, triée par nom, et affiche l’identité, l’affectation, la date d’embauche et le statut', async () => {
    await afficher();

    expect(service.search.mock.lastCall![1]).toEqual({ page: 0, size: 10, sort: 'nomPrenom,asc' });
    const ligne = (i: number) => Array.from(racine().querySelectorAll('tbody tr')[i].querySelectorAll('td')).slice(0, 7).map((td) => td.textContent?.trim());
    expect(ligne(0)).toEqual(['Ali Alaoui', 'AB123', 'MACON', 'C196', 'OP', '02/11/2020', 'En poste']);
    expect(ligne(1)).toEqual(['Zahra Idrissi', 'CD456', 'CHAUFFEUR', 'C168', '-', '14/05/2018', 'Sorti']);
    expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('2 employés');
  });

  it('montre le salaire et son unité à qui peut lire la paie, et seulement à lui', async () => {
    await afficher('/employees', [...TOUTES, 'PAIE_READ']);
    const salaires = () => Array.from(racine().querySelectorAll('tbody tr')).map((tr) => tr.querySelectorAll('td')[5].textContent?.replace(/\s+/g, ' ').trim());

    expect(Array.from(racine().querySelectorAll('thead th')).map((th) => th.textContent?.trim())).toContain('Salaire');
    expect(salaires()).toEqual(['4 000,00 / mois', '120,00 / jour']);

    TestBed.resetTestingModule();
    await afficher();
    expect(Array.from(racine().querySelectorAll('thead th')).map((th) => th.textContent?.trim())).not.toContain('Salaire');
  });

  describe('filtres de l’URL', () => {
    it('cherche avec les filtres de l’URL dès l’arrivée', async () => {
      await afficher('/employees?nom=ali&cin=AB1&fonctionIds=1,3&chantierIds=2&statut=INACTIF');

      expect(criteres()).toEqual({ nomPrenom: 'ali', cin: 'AB1', fonctionIds: [1, 3], chantierIds: [2], statut: 'INACTIF' });
    });

    it('relance la recherche, depuis la première page, quand les filtres de l’URL changent', async () => {
      await afficher();
      service.search.mockClear();

      await TestBed.inject(Router).navigateByUrl('/employees?chantierIds=4');
      await harness.fixture.whenStable();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toMatchObject({ chantierIds: [4] });
      expect(service.search.mock.lastCall![1]).toMatchObject({ page: 0 });
    });
  });

  describe('permissions', () => {
    it('propose modification et suppression à qui a tous les droits', async () => {
      await afficher();

      expect(bouton('Modifier l’employé Ali Alaoui')).not.toBeNull();
      expect(bouton('Supprimer l’employé Ali Alaoui')).not.toBeNull();
    });

    it('ne propose que la consultation à qui peut seulement lire', async () => {
      await afficher('/employees', ['EMPLOYEE_READ']);

      expect(bouton('Modifier l’employé Ali Alaoui')).toBeNull();
      expect(bouton('Supprimer l’employé Ali Alaoui')).toBeNull();
      expect(bouton('Voir l’employé Ali Alaoui')).not.toBeNull();
    });
  });

  describe('actions', () => {
    it('ouvre la consultation et la modification', async () => {
      await afficher();
      const navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      bouton('Voir l’employé Ali Alaoui')!.click();
      bouton('Modifier l’employé Zahra Idrissi')!.click();

      expect(navigation).toHaveBeenNthCalledWith(1, ['/employees', 1]);
      expect(navigation).toHaveBeenNthCalledWith(2, ['/employees', 2, 'edit']);
    });

    it('supprime après confirmation, annonce le succès et recharge', async () => {
      await afficher();
      const confirmation = TestBed.inject(ConfirmDialogService);
      service.search.mockClear();

      bouton('Supprimer l’employé Ali Alaoui')!.click();
      expect(confirmation.request()?.header).toBe('Supprimer cet employé');
      confirmation.request()!.accept!();

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Employé supprimé']);
      expect(service.search).toHaveBeenCalledTimes(1);
    });
  });
});
