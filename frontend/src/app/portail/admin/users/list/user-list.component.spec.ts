import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { saisir, soumettre } from '../../../../shared/testing/formulaire';
import { PolitiqueMotDePasseService } from '../../../../shared/validators/politique-mot-de-passe.service';
import { AdminUser } from '../../models/admin.model';
import { UserService } from '../../services/user.service';
import { UserListComponent } from './user-list.component';

const utilisateur = (id: number, username: string, actif: boolean, roles: string[]): AdminUser => ({
  id,
  username,
  email: `${username}@staport.ma`,
  actif,
  employee: null,
  roles: roles.map((nom, i) => ({ id: i + 1, nom })),
  permissionsRefusees: [],
  permissionsEffectives: []
});

const UTILISATEURS = [utilisateur(1, 'admin', true, ['SYSTEM_ADMIN']), utilisateur(2, 'rh.fatima', true, ['RH', 'Comptable']), utilisateur(3, 'ancien', false, [])];

describe('UserListComponent', () => {
  let fixture: ComponentFixture<UserListComponent>;
  let service: { search: ReturnType<typeof vi.fn>; resetPassword: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const bouton = (nom: string) => racine().querySelector(`button[aria-label="${nom}"]`) as HTMLButtonElement;
  const noms = () => Array.from(racine().querySelectorAll('tbody tr td:first-child')).map((td) => td.textContent?.trim());
  const dialogue = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

  async function afficher(): Promise<void> {
    service = {
      search: vi.fn((criteres: { username?: string; email?: string; actif?: boolean }) => {
        const resultat = UTILISATEURS.filter((u) => (!criteres.username || u.username.toLowerCase().includes(criteres.username.toLowerCase())) && (!criteres.email || u.email.toLowerCase().includes(criteres.email.toLowerCase())) && (criteres.actif === undefined || u.actif === criteres.actif));
        return of({ content: resultat, page: { size: 10, number: 0, totalElements: resultat.length, totalPages: 1 } });
      }),
      resetPassword: vi.fn().mockReturnValue(of(undefined))
    };
    const politique = { longueurMinimale: () => 10, regle: () => '10 caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.' };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: UserService, useValue: service }, { provide: PolitiqueMotDePasseService, useValue: politique }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(UserListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function stabiliser(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function filtrer(): Promise<void> {
    await vi.advanceTimersByTimeAsync(350);
    TestBed.tick();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
  });

  it('charge la première page et affiche identifiant, email, rôles et statut', async () => {
    await afficher();

    expect(noms()).toEqual(['admin', 'rh.fatima', 'ancien']);
    const ligne = (i: number) => Array.from(racine().querySelectorAll('tbody tr')[i].querySelectorAll('td')).slice(0, 4).map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
    expect(ligne(1)).toEqual(['rh.fatima', 'rh.fatima@staport.ma', 'RHComptable', 'Actif']);
    expect(Array.from(racine().querySelectorAll('tbody tr')[1].querySelectorAll('.user-list__role-tag')).map((r) => r.textContent?.trim())).toEqual(['RH', 'Comptable']);
    expect(ligne(2)[3]).toBe('Inactif');
    expect(racine().querySelector('.app-table-bar__total')?.textContent?.trim()).toBe('3 utilisateurs');
  });

  describe('filtres', () => {
  it('envoie les filtres identifiant et email au serveur après un court délai', async () => {
      await afficher();
      vi.useFakeTimers();

      saisir(racine(), 'input[aria-label="Username"]', 'RH');
      await filtrer();
      expect(noms()).toEqual(['rh.fatima']);
      expect(service.search).toHaveBeenLastCalledWith({ username: 'RH', email: undefined, actif: undefined }, { page: 0, size: 10, sort: 'username,asc' });

      saisir(racine(), 'input[aria-label="Username"]', '');
      saisir(racine(), 'input[aria-label="Email"]', 'ancien@');
      await filtrer();
      expect(noms()).toEqual(['ancien']);
      expect(service.search).toHaveBeenLastCalledWith({ username: undefined, email: 'ancien@', actif: undefined }, { page: 0, size: 10, sort: 'username,asc' });
    });

    it('filtre par statut immédiatement', async () => {
      await afficher();

      fixture.componentInstance['filterForm'].actif().value.set(false);
      await stabiliser();

      expect(noms()).toEqual(['ancien']);
    });

    it('« Réinitialiser » rend tous les utilisateurs', async () => {
      await afficher();
      fixture.componentInstance['filterForm'].actif().value.set(true);
      await stabiliser();
      expect(noms()).toHaveLength(2);

      (Array.from(racine().querySelectorAll('button')).find((b) => b.textContent?.includes('Réinitialiser')) as HTMLButtonElement).click();
      await stabiliser();

      expect(noms()).toHaveLength(3);
    });
  });

  it('ouvre la modification d’un utilisateur', async () => {
    await afficher();

    bouton('Modifier admin').click();

    expect(navigation).toHaveBeenCalledWith(['/admin/users', 1, 'edit']);
  });

  describe('réinitialisation du mot de passe', () => {
    async function ouvrir(): Promise<void> {
      bouton('Réinitialiser le mot de passe de rh.fatima').click();
      await stabiliser();
    }

    it('ouvre un dialogue qui nomme l’utilisateur concerné', async () => {
      await afficher();

      await ouvrir();

      expect(dialogue()?.textContent).toContain('rh.fatima');
      expect(dialogue()?.querySelector('input[type="password"]')).not.toBeNull();
    });

    it('refuse un mot de passe qui ne respecte pas la règle, en la rappelant, sans appeler l’API', async () => {
      await afficher();
      await ouvrir();

      saisir(dialogue()!, 'input', 'court');
      soumettre(dialogue()!);
      await stabiliser();

      expect(service.resetPassword).not.toHaveBeenCalled();
      expect(dialogue()?.querySelector('[role="alert"]')?.textContent).toContain('10 caractères minimum');
    });

    it('réinitialise avec un mot de passe conforme, annonce le succès et ferme le dialogue', async () => {
      await afficher();
      await ouvrir();

      saisir(dialogue()!, 'input', 'Nouveau2026Mdp');
      soumettre(dialogue()!);
      await stabiliser();

      expect(service.resetPassword).toHaveBeenCalledWith(2, { nouveauMotDePasse: 'Nouveau2026Mdp' });
      expect(TestBed.inject(NotificationService).notifications().map((n) => n.summary)).toEqual(['Mot de passe réinitialisé']);
      expect(dialogue()).toBeNull();
    });

    it('garde le dialogue ouvert si le serveur refuse', async () => {
      await afficher();
      service.resetPassword.mockReturnValue(throwError(() => new Error('422')));
      await ouvrir();

      saisir(dialogue()!, 'input', 'Nouveau2026Mdp');
      soumettre(dialogue()!);
      await stabiliser();

      expect(dialogue()).not.toBeNull();
      expect(TestBed.inject(NotificationService).notifications()).toEqual([]);
    });

    it('repart d’un champ vide à chaque ouverture', async () => {
      await afficher();
      await ouvrir();
      saisir(dialogue()!, 'input', 'Nouveau2026Mdp');
      (dialogue()!.querySelector('button[aria-label="Fermer"]') as HTMLButtonElement).click();
      await stabiliser();

      await ouvrir();

      expect((dialogue()!.querySelector('input') as HTMLInputElement).value).toBe('');
    });
  });
});
