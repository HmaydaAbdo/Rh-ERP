import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { Function } from '../models/function.model';
import { FunctionService } from '../services/function.service';
import { FunctionListComponent } from './function-list.component';

const FONCTIONS: Function[] = [
  { id: 1, version: 0, libelle: 'MACON' },
  { id: 2, version: 0, libelle: 'PLOMBIER' }
];

const page = (content: Function[], total = content.length) => ({
  content,
  page: { size: 10, number: 0, totalElements: total, totalPages: Math.ceil(total / 10) }
});

const TOUTES = ['FUNCTION_READ', 'FUNCTION_WRITE', 'FUNCTION_DELETE'];

describe('FunctionListComponent', () => {
  let fixture: ComponentFixture<FunctionListComponent>;
  let service: { search: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const lignes = () => Array.from(racine().querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent?.trim());
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement | null;

  async function afficher(permissions: string[] = TOUTES): Promise<void> {
    service = { search: vi.fn().mockReturnValue(of(page(FONCTIONS))), delete: vi.fn().mockReturnValue(of(undefined)) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: FunctionService, useValue: service }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(FunctionListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const criteres = () => service.search.mock.lastCall![0];
  const pagination = () => service.search.mock.lastCall![1];

  describe('chargement', () => {
    it('charge la première page, triée par libellé, sans filtre quand l’URL n’en porte pas', async () => {
      await afficher();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toEqual({ libelle: undefined });
      expect(pagination()).toEqual({ page: 0, size: 10, sort: 'libelle,asc' });
    });

    it('affiche les fonctions reçues et leur nombre', async () => {
      await afficher();

      expect(lignes()).toEqual(['MACON', 'PLOMBIER']);
      expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('2 fonctions');
      expect(racine().querySelector('app-collection-table stp-table')).not.toBeNull();
    });

    it('accorde le singulier à une seule fonction', async () => {
      await afficher();
      service.search.mockReturnValue(of(page([FONCTIONS[0]])));

      fixture.componentInstance['onSearch']();
      fixture.detectChanges();

      expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('1 fonction');
    });

    it('annonce l’absence de résultat', async () => {
      await afficher();
      service.search.mockReturnValue(of(page([])));

      fixture.componentInstance['onSearch']();
      fixture.detectChanges();

      expect(racine().querySelector('.stp-table__empty')?.textContent).toBe('Aucune fonction ne correspond à ces critères.');
    });
  });

  describe('permissions', () => {
    it('propose modification et suppression à qui a les droits, la seule consultation sinon', async () => {
      await afficher();
      expect(bouton('Modifier la fonction MACON')).not.toBeNull();
      expect(bouton('Supprimer la fonction MACON')).not.toBeNull();
      TestBed.resetTestingModule();

      await afficher(['FUNCTION_READ']);
      expect(bouton('Modifier la fonction MACON')).toBeNull();
      expect(bouton('Supprimer la fonction MACON')).toBeNull();
      expect(bouton('Voir la fonction MACON')).not.toBeNull();
    });

    it('ne porte ni création ni import : ils vivent dans l’en-tête commun aux trois vues', async () => {
      await afficher();

      expect(racine().querySelector('a[href="/functions/new"]')).toBeNull();
      expect(racine().querySelector('stp-split-button')).toBeNull();
    });
  });

  describe('tri et pagination', () => {
    it('relaie le tri demandé par l’en-tête de colonne au serveur', async () => {
      await afficher();
      service.search.mockClear();

      fixture.componentInstance['onLazyLoad']({ first: 20, rows: 10, sortField: 'libelle', sortOrder: -1 });

      expect(pagination()).toEqual({ page: 2, size: 10, sort: 'libelle,desc' });
    });
  });

  describe('actions sur une ligne', () => {
    it('ouvre la consultation et la modification', async () => {
      await afficher();

      bouton('Voir la fonction MACON')!.click();
      bouton('Modifier la fonction PLOMBIER')!.click();

      expect(navigation).toHaveBeenNthCalledWith(1, ['/functions', 1]);
      expect(navigation).toHaveBeenNthCalledWith(2, ['/functions', 2, 'edit']);
    });

    it('demande confirmation avant de supprimer, et ne supprime rien si on renonce', async () => {
      await afficher();
      const confirmation = TestBed.inject(ConfirmDialogService);

      bouton('Supprimer la fonction MACON')!.click();

      expect(confirmation.request()?.header).toBe('Supprimer cette fonction');
      expect(confirmation.request()?.message).toContain('MACON');
      confirmation.request()!.reject?.();
      expect(service.delete).not.toHaveBeenCalled();
    });

    it('supprime après confirmation, annonce le succès et recharge la liste', async () => {
      await afficher();
      const confirmation = TestBed.inject(ConfirmDialogService);
      service.search.mockClear();

      bouton('Supprimer la fonction MACON')!.click();
      confirmation.request()!.accept!();

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Fonction supprimée']);
      expect(service.search).toHaveBeenCalledTimes(1);
    });
  });
});
