import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { saisir } from '../../../shared/testing/formulaire';
import { Employee } from '../models/employee.model';
import { EmployeeService } from '../services/employee.service';
import { EmployeeListComponent } from './employee-list.component';

registerLocaleData(localeFr);

const EMPLOYES: Employee[] = [
  { id: 1, version: 0, nomPrenom: 'Ali Alaoui', cin: 'AB123', dateNaissance: '1990-03-07', dateEmbauche: '2020-11-02', fonction: { id: 1, libelle: 'MACON' }, chantier: { id: 2, code: 'C196' }, statut: 'ACTIF' },
  { id: 2, version: 0, nomPrenom: 'Zahra Idrissi', cin: 'CD456', dateNaissance: '1985-01-01', dateEmbauche: '2018-05-14', fonction: { id: 3, libelle: 'CHAUFFEUR' }, chantier: { id: 4, code: 'C168' }, statut: 'INACTIF' }
];

const page = (content: Employee[]) => ({ content, page: { size: 10, number: 0, totalElements: content.length, totalPages: 1 } });

const TOUTES = ['EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'EMPLOYEE_DELETE', 'EMPLOYEE_IMPORT'];
const REFERENTIEL = { fetchPage: () => of({ items: [], totalRecords: 0 }), fetchById: (id: number) => of({ id, code: 'C' + id, libelle: 'L' + id }) };

describe('EmployeeListComponent', () => {
  let fixture: ComponentFixture<EmployeeListComponent>;
  let service: { search: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; importer: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement | null;
  const criteres = () => service.search.mock.lastCall![0];

  async function afficher(permissions: string[] = TOUTES): Promise<void> {
    service = { search: vi.fn().mockReturnValue(of(page(EMPLOYES))), delete: vi.fn().mockReturnValue(of(undefined)), importer: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        fournirPermissions(permissions).providers,
        { provide: EmployeeService, useValue: service },
        { provide: FunctionReferenceService, useValue: REFERENTIEL },
        { provide: ChantierReferenceService, useValue: REFERENTIEL }
      ]
    });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EmployeeListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
  });

  it('charge la première page, triée par nom, et affiche l’identité, l’affectation, la date d’embauche et le statut', async () => {
    await afficher();

    expect(service.search.mock.lastCall![1]).toEqual({ page: 0, size: 10, sort: 'nomPrenom,asc' });
    const ligne = (i: number) => Array.from(racine().querySelectorAll('tbody tr')[i].querySelectorAll('td')).slice(0, 6).map((td) => td.textContent?.trim());
    expect(ligne(0)).toEqual(['Ali Alaoui', 'AB123', 'MACON', 'C196', '02/11/2020', 'Actif']);
    expect(ligne(1)).toEqual(['Zahra Idrissi', 'CD456', 'CHAUFFEUR', 'C168', '14/05/2018', 'Inactif']);
    expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('2 employés');
  });

  describe('permissions', () => {
    it('propose import, création, modification et suppression à qui a tous les droits', async () => {
      await afficher();

      expect(racine().querySelector('stp-split-button')).not.toBeNull();
      expect(racine().textContent).toContain('Nouvel employé');
      expect(bouton('Modifier l’employé Ali Alaoui')).not.toBeNull();
      expect(bouton('Supprimer l’employé Ali Alaoui')).not.toBeNull();
    });

    it('ne propose que la consultation à qui peut seulement lire', async () => {
      await afficher(['EMPLOYEE_READ']);

      expect(racine().querySelector('stp-split-button')).toBeNull();
      expect(racine().textContent).not.toContain('Nouvel employé');
      expect(bouton('Modifier l’employé Ali Alaoui')).toBeNull();
      expect(bouton('Supprimer l’employé Ali Alaoui')).toBeNull();
      expect(bouton('Voir l’employé Ali Alaoui')).not.toBeNull();
    });
  });

  describe('filtres', () => {
    it('cherche par nom et CIN après un court délai', async () => {
      await afficher();
      vi.useFakeTimers();
      service.search.mockClear();

      saisir(racine(), 'input[aria-label="Nom & prénom"]', 'ali');
      saisir(racine(), 'input[aria-label="CIN"]', 'AB1');
      await vi.advanceTimersByTimeAsync(350);
      TestBed.tick();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toMatchObject({ nomPrenom: 'ali', cin: 'AB1', fonctionIds: undefined, chantierIds: undefined, statut: undefined });
    });

    it('filtre par plusieurs fonctions et plusieurs chantiers, et par statut, sans attendre', async () => {
      await afficher();
      const formulaire = fixture.componentInstance['filterForm'];
      service.search.mockClear();

      formulaire.fonctionIds().value.set([1, 3]);
      formulaire.chantierIds().value.set([2]);
      formulaire.statut().value.set('INACTIF');
      TestBed.tick();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toMatchObject({ fonctionIds: [1, 3], chantierIds: [2], statut: 'INACTIF' });
    });

    it('« Réinitialiser » vide tous les filtres', async () => {
      await afficher();
      fixture.componentInstance['filterForm'].fonctionIds().value.set([1]);
      TestBed.tick();
      service.search.mockClear();

      (Array.from(racine().querySelectorAll('button')).find((b) => b.textContent?.includes('Réinitialiser')) as HTMLButtonElement).click();
      TestBed.tick();

      expect(criteres()).toMatchObject({ nomPrenom: undefined, cin: undefined, fonctionIds: undefined, chantierIds: undefined, statut: undefined });
    });
  });

  describe('actions', () => {
    it('ouvre la consultation et la modification', async () => {
      await afficher();

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

    it('importe le fichier choisi et annonce le bilan', async () => {
      await afficher();
      service.importer.mockReturnValue(of({ totalLignes: 5, crees: 4, ignores: 1, lignesIgnorees: [{ numeroLigne: 5, cin: 'AB1', raison: 'CIN déjà présent' }] }));
      const champ = racine().querySelector('input[type="file"]') as HTMLInputElement;
      const transfert = new DataTransfer();
      transfert.items.add(new File(['x'], 'employes.xlsx'));
      champ.files = transfert.files;

      champ.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(service.importer).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({ summary: 'Import terminé', detail: '4 créé(s) sur 5 ligne(s)' });
    });
  });
});
