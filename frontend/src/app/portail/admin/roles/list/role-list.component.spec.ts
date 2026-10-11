import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';

import { ConfirmDialogService, NotificationService } from '../../../../shared/feedback/feedback.service';
import { saisir } from '../../../../shared/testing/formulaire';
import { Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';
import { RoleListComponent } from './role-list.component';

const ROLES: Role[] = [
  { id: 1, nom: 'SYSTEM_ADMIN', description: 'Administration', permissions: [{ id: 1, code: 'PAIE_READ', description: 'Lire' }], protege: true },
  { id: 2, nom: 'RH', description: null, permissions: [], protege: false },
  { id: 3, nom: 'Comptable', description: 'Équipe comptabilité', permissions: [{ id: 1, code: 'PAIE_READ', description: 'Lire' }, { id: 2, code: 'PAIE_WRITE', description: 'Écrire' }], protege: false }
];

describe('RoleListComponent', () => {
  let fixture: ComponentFixture<RoleListComponent>;
  let service: { search: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement;
  const noms = () => Array.from(racine().querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent?.trim());

  async function afficher(): Promise<void> {
    service = {
      search: vi.fn((criteres: { nom?: string; description?: string }) => {
        const inclut = (texte: string | null, filtre?: string) => !filtre || (texte ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(filtre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
        const resultat = ROLES.filter((role) => inclut(role.nom, criteres.nom) && inclut(role.description, criteres.description));
        return of({ content: resultat, page: { size: 10, number: 0, totalElements: resultat.length, totalPages: 1 } });
      }),
      delete: vi.fn().mockReturnValue(of(undefined))
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: RoleService, useValue: service }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(RoleListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function filtrer(): Promise<void> {
    await vi.advanceTimersByTimeAsync(350);
    TestBed.tick();
    fixture.detectChanges();
  }

  afterEach(() => vi.useRealTimers());

  it('charge la première page et affiche nom, description et nombre de permissions', async () => {
    await afficher();

    expect(service.search).toHaveBeenCalledWith({}, { page: 0, size: 10, sort: 'nom,asc' });
    expect(noms()).toEqual(['SYSTEM_ADMIN', 'RH', 'Comptable']);
    const ligne = (i: number) => Array.from(racine().querySelectorAll('tbody tr')[i].querySelectorAll('td')).slice(0, 3).map((td) => td.textContent?.trim());
    expect(ligne(0)).toEqual(['SYSTEM_ADMIN', 'Administration', '1 permission(s)']);
    expect(ligne(1)).toEqual(['RH', '—', '0 permission(s)']);
    expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('3 rôles');
  });

  it('envoie le filtre de nom au serveur après un court délai', async () => {
    await afficher();
    vi.useFakeTimers();

    saisir(racine(), 'input[aria-label="Nom"]', 'COMPTA');
    await filtrer();

    expect(noms()).toEqual(['Comptable']);
    expect(service.search).toHaveBeenLastCalledWith({ nom: 'COMPTA', description: undefined }, { page: 0, size: 10, sort: 'nom,asc' });
    expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('1 rôle');
  });

  it('filtre par description', async () => {
    await afficher();
    vi.useFakeTimers();

    saisir(racine(), 'input[aria-label="Description"]', 'equipe');
    await filtrer();

    expect(noms()).toEqual(['Comptable']);
  });

  it('« Réinitialiser » relance la recherche sans filtre', async () => {
    await afficher();
    vi.useFakeTimers();
    saisir(racine(), 'input[aria-label="Nom"]', 'RH');
    await filtrer();
    expect(noms()).toEqual(['RH']);

    (Array.from(racine().querySelectorAll('button')).find((b) => b.textContent?.includes('Réinitialiser')) as HTMLButtonElement).click();
    await filtrer();

    expect(noms()).toHaveLength(3);
    expect(service.search).toHaveBeenLastCalledWith({}, { page: 0, size: 10, sort: 'nom,asc' });
  });

  it('annonce l’absence de résultat', async () => {
    await afficher();
    vi.useFakeTimers();

    saisir(racine(), 'input[aria-label="Nom"]', 'zzz');
    await filtrer();

    expect(racine().querySelector('.stp-table__empty')?.textContent).toBe('Aucun rôle ne correspond à ces critères.');
  });

  it('ouvre la modification d’un rôle', async () => {
    await afficher();

    bouton('Modifier le rôle RH').click();

    expect(navigation).toHaveBeenCalledWith(['/admin/roles', 2, 'edit']);
  });

  it('interdit la suppression du rôle d’administration et la justifie', async () => {
    await afficher();

    expect(bouton('Supprimer le rôle SYSTEM_ADMIN').getAttribute('aria-disabled')).toBeDefined();
    expect(bouton('Supprimer le rôle SYSTEM_ADMIN').disabled).toBe(true);
    expect(bouton('Supprimer le rôle SYSTEM_ADMIN').title).toBe('Rôle d’administration : non supprimable');
    expect(bouton('Supprimer le rôle RH').disabled).toBe(false);
  });

  it('demande confirmation (en prévenant qu’un rôle attribué ne peut être supprimé) puis supprime et recharge', async () => {
    await afficher();
    const confirmation = TestBed.inject(ConfirmDialogService);
    service.search.mockClear();

    bouton('Supprimer le rôle RH').click();
    expect(confirmation.request()?.header).toBe('Supprimer ce rôle');
    expect(confirmation.request()?.message).toContain('encore attribué');
    confirmation.request()!.accept!();

    expect(service.delete).toHaveBeenCalledWith(2);
    expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Rôle supprimé']);
    expect(service.search).toHaveBeenCalledTimes(1);
  });

  it('ne supprime rien si on renonce', async () => {
    await afficher();

    bouton('Supprimer le rôle RH').click();
    TestBed.inject(ConfirmDialogService).request()!.reject?.();

    expect(service.delete).not.toHaveBeenCalled();
  });
});
