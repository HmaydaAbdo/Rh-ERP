import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { ConfirmDialogService, NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { Equipe } from '../models/equipe.model';
import { EquipeService } from '../services/equipe.service';
import { EquipeListComponent } from './equipe-list.component';

const EQUIPES: Equipe[] = [
  { id: 1, version: 0, code: 'CH', libelle: 'Chauffeurs' },
  { id: 2, version: 0, code: 'OP', libelle: 'Opérateurs' }
];

const page = (content: Equipe[]) => ({ content, page: { size: 10, number: 0, totalElements: content.length, totalPages: 1 } });

describe('EquipeListComponent', () => {
  let fixture: ComponentFixture<EquipeListComponent>;
  let service: { search: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement | null;

  async function afficher(permissions = ['EQUIPE_READ', 'EQUIPE_WRITE', 'EQUIPE_DELETE']): Promise<void> {
    service = { search: vi.fn().mockReturnValue(of(page(EQUIPES))), delete: vi.fn().mockReturnValue(of(undefined)) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), fournirPermissions(permissions).providers, { provide: EquipeService, useValue: service }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EquipeListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const criteres = () => service.search.mock.lastCall![0];

  afterEach(() => vi.useRealTimers());

  it('charge la première page, triée par code, et affiche code et libellé', async () => {
    await afficher();

    expect(service.search.mock.lastCall![1]).toEqual({ page: 0, size: 10, sort: 'code,asc' });
    expect(Array.from(racine().querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).slice(0, 2).map((td) => td.textContent?.trim()))).toEqual([
      ['CH', 'Chauffeurs'],
      ['OP', 'Opérateurs']
    ]);
    expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('2 équipes');
    expect(racine().querySelector('app-collection-table stp-table')).not.toBeNull();
    const exporteur = racine().querySelector('app-pdf-export-button[table-export]');
    expect(exporteur?.parentElement?.classList.contains('app-table-bar__tools')).toBe(true);
    expect(exporteur?.querySelector('button[aria-label="Exporter les équipes filtrées en PDF"]')).not.toBeNull();
  });

  it('propose modification et suppression à qui a les droits, la seule consultation sinon', async () => {
    await afficher();
    expect(bouton('Modifier l’équipe CH')).not.toBeNull();
    expect(bouton('Supprimer l’équipe CH')).not.toBeNull();
    TestBed.resetTestingModule();

    await afficher(['EQUIPE_READ']);
    expect(bouton('Modifier l’équipe CH')).toBeNull();
    expect(bouton('Supprimer l’équipe CH')).toBeNull();
    expect(bouton('Voir l’équipe CH')).not.toBeNull();
  });

  it('charge sans filtre quand la vue est ouverte sans critères dans l’URL', async () => {
    await afficher();
    expect(criteres()).toEqual({ code: undefined, libelle: undefined });
  });

  it('ouvre la consultation et la modification', async () => {
    await afficher();

    bouton('Voir l’équipe CH')!.click();
    bouton('Modifier l’équipe OP')!.click();

    expect(navigation).toHaveBeenNthCalledWith(1, ['/equipes', 1]);
    expect(navigation).toHaveBeenNthCalledWith(2, ['/equipes', 2, 'edit']);
  });

  it('supprime après confirmation, annonce le succès et recharge', async () => {
    await afficher();
    const confirmation = TestBed.inject(ConfirmDialogService);
    service.search.mockClear();

    bouton('Supprimer l’équipe CH')!.click();
    expect(confirmation.request()?.header).toBe('Supprimer cette équipe');
    confirmation.request()!.accept!();

    expect(service.delete).toHaveBeenCalledWith(1);
    expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Équipe supprimée']);
    expect(service.search).toHaveBeenCalledTimes(1);
  });

  it('ne supprime rien si on renonce', async () => {
    await afficher();

    bouton('Supprimer l’équipe CH')!.click();
    TestBed.inject(ConfirmDialogService).request()!.reject?.();

    expect(service.delete).not.toHaveBeenCalled();
  });
});
