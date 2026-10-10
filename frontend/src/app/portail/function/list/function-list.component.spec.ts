import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { saisir } from '../../../shared/testing/formulaire';
import { FunctionService } from '../services/function.service';
import { FunctionListComponent } from './function-list.component';

const page = (content: { id: number; libelle: string }[], total = content.length) => ({
  content,
  page: { size: 10, number: 0, totalElements: total, totalPages: Math.ceil(total / 10) }
});

const TOUTES = ['FUNCTION_READ', 'FUNCTION_WRITE', 'FUNCTION_DELETE', 'FUNCTION_IMPORT'];

describe('FunctionListComponent', () => {
  let fixture: ComponentFixture<FunctionListComponent>;
  let service: { search: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; importer: ReturnType<typeof vi.fn>; telechargerModele: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const lignes = () => Array.from(racine().querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent?.trim());

  async function afficher(permissions: string[] = TOUTES): Promise<void> {
    service = {
      search: vi.fn().mockReturnValue(of(page([{ id: 1, libelle: 'MACON' }, { id: 2, libelle: 'PLOMBIER' }]))),
      delete: vi.fn().mockReturnValue(of(undefined)),
      importer: vi.fn(),
      telechargerModele: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: FunctionService, useValue: service }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(FunctionListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const criteres = () => service.search.mock.lastCall![0];
  const pagination = () => service.search.mock.lastCall![1];

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
  });

  describe('chargement', () => {
    it('charge la première page, triée par libellé, dès l’affichage', async () => {
      await afficher();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toEqual({ libelle: undefined });
      expect(pagination()).toEqual({ page: 0, size: 10, sort: 'libelle,asc' });
    });

    it('affiche les fonctions reçues et leur nombre', async () => {
      await afficher();

      expect(lignes()).toEqual(['MACON', 'PLOMBIER']);
      expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('2 fonctions');
    });

    it('accorde le singulier à une seule fonction', async () => {
      await afficher();
      service.search.mockReturnValue(of(page([{ id: 1, libelle: 'MACON' }])));

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
    it('propose création, import, modification et suppression à qui a tous les droits', async () => {
      await afficher();

      expect(racine().querySelector('a[href="/functions/new"]')).not.toBeNull();
      expect(racine().querySelector('stp-split-button')).not.toBeNull();
      expect(racine().querySelector('button[aria-label="Modifier la fonction MACON"]')).not.toBeNull();
      expect(racine().querySelector('button[aria-label="Supprimer la fonction MACON"]')).not.toBeNull();
    });

    it('ne propose que la consultation à qui peut seulement lire', async () => {
      await afficher(['FUNCTION_READ']);

      expect(racine().querySelector('a[href="/functions/new"]')).toBeNull();
      expect(racine().querySelector('stp-split-button')).toBeNull();
      expect(racine().querySelector('button[aria-label="Modifier la fonction MACON"]')).toBeNull();
      expect(racine().querySelector('button[aria-label="Supprimer la fonction MACON"]')).toBeNull();
      expect(racine().querySelector('button[aria-label="Voir la fonction MACON"]')).not.toBeNull();
    });
  });

  describe('recherche', () => {
    it('relance la recherche après 300 ms de pause dans le champ, en revenant à la première page', async () => {
      await afficher();
      vi.useFakeTimers();
      service.search.mockClear();

      saisir(racine(), 'input[aria-label="Libellé"]', 'mac');
      await vi.advanceTimersByTimeAsync(200);
      TestBed.tick();
      expect(service.search).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(150);
      TestBed.tick();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toEqual({ libelle: 'mac' });
      expect(pagination().page).toBe(0);
    });

    it('lance la recherche aussitôt à l’envoi du formulaire (touche Entrée)', async () => {
      await afficher();
      service.search.mockClear();

      racine().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

      expect(service.search).toHaveBeenCalledTimes(1);
    });

    it('« Réinitialiser » vide les filtres et relance la recherche', async () => {
      await afficher();
      vi.useFakeTimers();
      saisir(racine(), 'input[aria-label="Libellé"]', 'mac');
      await vi.advanceTimersByTimeAsync(400);
      TestBed.tick();
      service.search.mockClear();

      (Array.from(racine().querySelectorAll('button')).find((b) => b.textContent?.includes('Réinitialiser')) as HTMLButtonElement).click();
      TestBed.tick();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toEqual({ libelle: undefined });
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

      (racine().querySelector('button[aria-label="Voir la fonction MACON"]') as HTMLButtonElement).click();
      (racine().querySelector('button[aria-label="Modifier la fonction PLOMBIER"]') as HTMLButtonElement).click();

      expect(navigation).toHaveBeenNthCalledWith(1, ['/functions', 1]);
      expect(navigation).toHaveBeenNthCalledWith(2, ['/functions', 2, 'edit']);
    });

    it('demande confirmation avant de supprimer, et ne supprime rien si on renonce', async () => {
      await afficher();
      const confirmation = TestBed.inject(ConfirmDialogService);

      (racine().querySelector('button[aria-label="Supprimer la fonction MACON"]') as HTMLButtonElement).click();

      expect(confirmation.request()?.header).toBe('Supprimer cette fonction');
      expect(confirmation.request()?.message).toContain('MACON');
      confirmation.request()!.reject?.();
      expect(service.delete).not.toHaveBeenCalled();
    });

    it('supprime après confirmation, annonce le succès et recharge la liste', async () => {
      await afficher();
      const confirmation = TestBed.inject(ConfirmDialogService);
      service.search.mockClear();

      (racine().querySelector('button[aria-label="Supprimer la fonction MACON"]') as HTMLButtonElement).click();
      confirmation.request()!.accept!();

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Fonction supprimée']);
      expect(service.search).toHaveBeenCalledTimes(1);
    });
  });

  describe('import Excel', () => {
    const fichier = () => new File(['x'], 'fonctions.xlsx');

    function choisirFichier(): void {
      const champ = racine().querySelector('input[type="file"]') as HTMLInputElement;
      const transfert = new DataTransfer();
      transfert.items.add(fichier());
      champ.files = transfert.files;
      champ.dispatchEvent(new Event('change'));
    }

    it('importe le fichier choisi, annonce le bilan et recharge la liste', async () => {
      await afficher();
      service.importer.mockReturnValue(of({ totalLignes: 3, crees: 2, ignores: 1, lignesIgnorees: [{ numeroLigne: 3, libelle: 'MACON', raison: 'Déjà présente' }] }));
      service.search.mockClear();

      choisirFichier();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(service.importer).toHaveBeenCalledTimes(1);
      expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({ severity: 'success', summary: 'Import terminé', detail: '2 créée(s) sur 3 ligne(s)' });
      expect(service.search).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Déjà présente');
    });

    it('montre le détail des lignes refusées quand le serveur rejette tout le fichier', async () => {
      await afficher();
      const refus = new HttpErrorResponse({ status: 422, error: { totalLignes: 1, crees: 0, ignores: 1, lignesIgnorees: [{ numeroLigne: 2, libelle: '', raison: 'Libellé vide' }] } });
      service.importer.mockReturnValue(throwError(() => refus));

      choisirFichier();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Libellé vide');
      expect(TestBed.inject(NotificationService).notifications()).toEqual([]);
    });

    it('ne fait rien quand aucun fichier n’est choisi', async () => {
      await afficher();

      (racine().querySelector('input[type="file"]') as HTMLInputElement).dispatchEvent(new Event('change'));

      expect(service.importer).not.toHaveBeenCalled();
    });
  });
});
