import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { saisir } from '../../../shared/testing/formulaire';
import { Chantier } from '../models/chantier.model';
import { ChantierService } from '../services/chantier.service';
import { ChantierListComponent } from './chantier-list.component';

const CHANTIERS: Chantier[] = [
  { id: 1, version: 0, code: 'C168', designation: 'Nador', nom: null, sourceErp: true, actif: true },
  { id: 2, version: 0, code: 'C196', designation: 'Marrakech', nom: 'Nord', sourceErp: false, actif: false }
];

const page = (content: Chantier[]) => ({ content, page: { size: 10, number: 0, totalElements: content.length, totalPages: 1 } });

const TOUTES = ['CHANTIER_READ', 'CHANTIER_WRITE', 'CHANTIER_DELETE', 'CHANTIER_SYNC'];

describe('ChantierListComponent', () => {
  let fixture: ComponentFixture<ChantierListComponent>;
  let service: { search: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; synchroniser: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement | null;

  async function afficher(permissions: string[] = TOUTES): Promise<void> {
    service = {
      search: vi.fn().mockReturnValue(of(page(CHANTIERS))),
      delete: vi.fn().mockReturnValue(of(undefined)),
      synchroniser: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: ChantierService, useValue: service }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ChantierListComponent);
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

  it('charge la première page, triée par code, et affiche code, nom, désignation, source et statut', async () => {
    await afficher();

    expect(pagination()).toEqual({ page: 0, size: 10, sort: 'code,asc' });
    const ligne = (i: number) => Array.from(racine().querySelectorAll('tbody tr')[i].querySelectorAll('td')).map((td) => td.textContent?.trim());
    expect(ligne(0).slice(0, 5)).toEqual(['C168', '-', 'Nador', 'ERP', 'Actif']);
    expect(ligne(1).slice(0, 5)).toEqual(['C196', 'Nord', 'Marrakech', 'Manuel', 'Inactif']);
    expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('2 chantiers');
  });

  it('colore le statut : succès pour actif, danger pour inactif', async () => {
    await afficher();

    expect(racine().querySelectorAll('stp-badge.stp-badge--success')).toHaveLength(1);
    expect(racine().querySelectorAll('stp-badge.stp-badge--danger')).toHaveLength(1);
  });

  describe('permissions', () => {
    it('propose synchronisation, création, modification et suppression à qui a tous les droits', async () => {
      await afficher();

      expect(racine().textContent).toContain('Synchroniser maintenant');
      expect(racine().textContent).toContain('Nouveau chantier');
      expect(bouton('Modifier le chantier C168')).not.toBeNull();
      expect(bouton('Supprimer le chantier C168')).not.toBeNull();
    });

    it('ne propose que la consultation à qui peut seulement lire', async () => {
      await afficher(['CHANTIER_READ']);

      expect(racine().textContent).not.toContain('Synchroniser maintenant');
      expect(racine().textContent).not.toContain('Nouveau chantier');
      expect(bouton('Modifier le chantier C168')).toBeNull();
      expect(bouton('Supprimer le chantier C168')).toBeNull();
      expect(bouton('Voir le chantier C168')).not.toBeNull();
    });

    it('distingue la permission de synchronisation de celle d’écriture', async () => {
      await afficher(['CHANTIER_READ', 'CHANTIER_SYNC']);

      expect(racine().textContent).toContain('Synchroniser maintenant');
      expect(racine().textContent).not.toContain('Nouveau chantier');
    });
  });

  describe('filtres', () => {
    it('cherche par code ou désignation après un court délai', async () => {
      await afficher();
      vi.useFakeTimers();
      service.search.mockClear();

      saisir(racine(), 'input[aria-label="Code"]', 'C19');
      saisir(racine(), 'input[aria-label="Désignation"]', 'mar');
      await vi.advanceTimersByTimeAsync(350);
      TestBed.tick();

      expect(service.search).toHaveBeenCalledTimes(1);
      expect(criteres()).toEqual({ code: 'C19', designation: 'mar', actif: undefined });
      expect(pagination().page).toBe(0);
    });

    it('filtre par statut immédiatement', async () => {
      await afficher();
      service.search.mockClear();

      fixture.componentInstance['filterForm'].actif().value.set(false);
      TestBed.tick();

      expect(criteres()).toEqual({ code: undefined, designation: undefined, actif: false });
    });

    it('« Réinitialiser » vide tous les filtres', async () => {
      await afficher();
      fixture.componentInstance['filterForm'].actif().value.set(true);
      TestBed.tick();
      service.search.mockClear();

      (Array.from(racine().querySelectorAll('button')).find((b) => b.textContent?.includes('Réinitialiser')) as HTMLButtonElement).click();
      TestBed.tick();

      expect(criteres()).toEqual({ code: undefined, designation: undefined, actif: undefined });
    });
  });

  describe('actions', () => {
    it('ouvre la consultation et la modification', async () => {
      await afficher();

      bouton('Voir le chantier C168')!.click();
      bouton('Modifier le chantier C196')!.click();

      expect(navigation).toHaveBeenNthCalledWith(1, ['/chantiers', 1]);
      expect(navigation).toHaveBeenNthCalledWith(2, ['/chantiers', 2, 'edit']);
    });

    it('supprime après confirmation, annonce le succès et recharge', async () => {
      await afficher();
      const confirmation = TestBed.inject(ConfirmDialogService);
      service.search.mockClear();

      bouton('Supprimer le chantier C168')!.click();
      expect(confirmation.request()?.message).toContain('C168');
      confirmation.request()!.accept!();

      expect(service.delete).toHaveBeenCalledWith(1);
      expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Chantier supprimé']);
      expect(service.search).toHaveBeenCalledTimes(1);
    });

    it('ne supprime rien si on renonce', async () => {
      await afficher();
      const confirmation = TestBed.inject(ConfirmDialogService);

      bouton('Supprimer le chantier C168')!.click();
      confirmation.request()!.reject?.();

      expect(service.delete).not.toHaveBeenCalled();
    });

    it('synchronise depuis l’ERP, annonce le bilan et recharge la liste', async () => {
      await afficher();
      service.synchroniser.mockReturnValue(of({ totalRecus: 12, crees: 3, dejaPresents: 8, ignores: 1 }));
      service.search.mockClear();

      (Array.from(racine().querySelectorAll('button')).find((b) => b.textContent?.includes('Synchroniser maintenant')) as HTMLButtonElement).click();

      expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({
        severity: 'success',
        summary: 'Synchronisation terminée',
        detail: '3 créé(s), 8 déjà présent(s), 1 ignoré(s)'
      });
      expect(service.search).toHaveBeenCalledTimes(1);
    });
  });
});
