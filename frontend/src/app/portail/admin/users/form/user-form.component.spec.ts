import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { fournirSignalForms } from '../../../../shared/forms/signal-forms.config';
import { EmployeeReferenceService } from '../../../../shared/reference-data/employee-reference.service';
import { fournirRoute } from '../../../../shared/testing/ecrans';
import { saisir, soumettre } from '../../../../shared/testing/formulaire';
import { PolitiqueMotDePasseService } from '../../../../shared/validators/politique-mot-de-passe.service';
import { AdminUser, PermissionSummary, Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';
import { UserService } from '../../services/user.service';
import { UserFormComponent } from './user-form.component';

const PAIE_READ: PermissionSummary = { id: 1, version: 0, code: 'PAIE_READ', description: 'Lire la paie' };
const PAIE_WRITE: PermissionSummary = { id: 2, version: 0, code: 'PAIE_WRITE', description: 'Modifier la paie' };
const EMPLOYEE_READ: PermissionSummary = { id: 3, version: 0, code: 'EMPLOYEE_READ', description: 'Lire les employés' };

const ROLES: Role[] = [
  { id: 10, version: 0, nom: 'Comptable', description: null, permissions: [PAIE_READ, PAIE_WRITE], protege: false },
  { id: 11, version: 0, nom: 'RH', description: null, permissions: [EMPLOYEE_READ, PAIE_READ], protege: false }
];

const UTILISATEUR: AdminUser = {
  id: 4,
  version: 0,
  username: 'fatima',
  email: 'fatima@staport.ma',
  actif: true,
  employee: { id: 9, nomPrenom: 'Fatima Zahra', cin: 'AB1' },
  roles: [{ id: 10, nom: 'Comptable' }],
  permissionsRefusees: [PAIE_WRITE],
  permissionsEffectives: ['PAIE_READ']
};

const EMPLOYES = { fetchPage: () => of({ items: [], totalRecords: 0 }), fetchById: (id: number) => of({ id, nomPrenom: 'Fatima Zahra', cin: 'AB1', displayLabel: 'Fatima Zahra — AB1' }) };

describe('UserFormComponent', () => {
  let fixture: ComponentFixture<UserFormComponent>;
  let users: { findById: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; updateDeniedPermissions: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const erreurs = () => Array.from(racine().querySelectorAll('[role="alert"]')).map((e) => e.textContent);
  const formulaire = () => fixture.componentInstance['form'];
  const refus = (code: string) => racine().querySelector(`input[aria-label="Refuser ${code}"]`) as HTMLInputElement | null;

  async function stabiliser(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function afficher(id?: string): Promise<void> {
    users = {
      findById: vi.fn().mockReturnValue(of(UTILISATEUR)),
      create: vi.fn().mockReturnValue(of({ id: 30 })),
      update: vi.fn().mockReturnValue(of({ id: 4, version: 1 })),
      updateDeniedPermissions: vi.fn().mockReturnValue(of({ id: 4 }))
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirSignalForms(),
        fournirRoute(id ? { id } : {}),
        { provide: UserService, useValue: users },
        { provide: RoleService, useValue: { findEvery: () => of(ROLES) } },
        { provide: PolitiqueMotDePasseService, useValue: { longueurMinimale: () => 10, regle: () => '10 caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.' } },
        { provide: EmployeeReferenceService, useValue: EMPLOYES }
      ]
    });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(UserFormComponent);
    await stabiliser();
  }

  async function envoyer(): Promise<void> {
    soumettre(racine());
    await stabiliser();
  }

  async function remplirCreation(): Promise<void> {
    saisir(racine(), '#username', 'nouveau');
    saisir(racine(), '#email', 'nouveau@staport.ma');
    saisir(racine(), '#motDePasse', 'MotDePasse2026');
    await stabiliser();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  describe('création', () => {
    it('présente identifiant, email et mot de passe, sans l’interrupteur « compte actif »', async () => {
      await afficher();

      expect(racine().querySelector('h1')?.textContent).toBe('Nouvel utilisateur');
      expect(racine().querySelector('#username')).not.toBeNull();
      expect(racine().querySelector('input#motDePasse')).not.toBeNull();
      expect(racine().querySelector('#actif')).toBeNull();
    });

    it('refuse un formulaire vide : identifiant, email et mot de passe sont signalés, focus sur le premier', async () => {
      await afficher();

      await envoyer();

      expect(users.create).not.toHaveBeenCalled();
      expect(erreurs()).toEqual(["Le nom d'utilisateur est obligatoire.", "L'email est obligatoire.", 'Le mot de passe est obligatoire.']);
      expect(document.activeElement?.id).toBe('username');
    });

    it('refuse un identifiant trop court, un email invalide et un mot de passe non conforme', async () => {
      await afficher();
      saisir(racine(), '#username', 'ab');
      saisir(racine(), '#email', 'pas-un-email');
      saisir(racine(), '#motDePasse', 'court');

      await envoyer();

      expect(users.create).not.toHaveBeenCalled();
      expect(erreurs()).toEqual(['3 à 50 caractères.', 'Email invalide.', '10 caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.']);
    });

    it('limite l’identifiant à 50 caractères', async () => {
      await afficher();

      expect(racine().querySelector('#username')?.getAttribute('maxlength')).toBe('50');
    });

    it('crée l’utilisateur avec ses rôles et annonce le succès', async () => {
      await afficher();
      await remplirCreation();
      formulaire().roleIds().value.set([10, 11]);

      await envoyer();

      expect(users.create).toHaveBeenCalledWith({ username: 'nouveau', email: 'nouveau@staport.ma', motDePasse: 'MotDePasse2026', employeeId: null, roleIds: [10, 11] });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Utilisateur créé');
      expect(navigation).toHaveBeenCalledWith(['/admin/users']);
      expect(formulaire()().dirty()).toBe(false);
    });

    it('lie l’utilisateur à un employé quand on en choisit un', async () => {
      await afficher();
      await remplirCreation();
      formulaire().employeeId().value.set(9);

      await envoyer();

      expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 9 }));
    });

    it('reste sur le formulaire quand le serveur refuse (identifiant déjà pris)', async () => {
      await afficher();
      users.create.mockReturnValue(throwError(() => new Error('409')));
      await remplirCreation();

      await envoyer();

      expect(navigation).not.toHaveBeenCalled();
      expect(formulaire()().dirty()).toBe(true);
    });
  });

  describe('modification', () => {
    it('charge l’utilisateur ; l’identifiant n’est pas modifiable et le mot de passe n’est pas demandé', async () => {
      await afficher('4');

      expect(users.findById).toHaveBeenCalledWith(4);
      expect(racine().querySelector('h1')?.textContent).toBe("Modifier l'utilisateur");
      expect((racine().querySelector('#username') as HTMLInputElement).value).toBe('fatima');
      expect((racine().querySelector('#username') as HTMLInputElement).disabled).toBe(true);
      expect((racine().querySelector('#email') as HTMLInputElement).value).toBe('fatima@staport.ma');
      expect(racine().querySelector('input#motDePasse')).toBeNull();
      expect((racine().querySelector('#actif') as HTMLInputElement).checked).toBe(true);
      expect(formulaire()().dirty()).toBe(false);
    });

    it('propose de refuser une à une les permissions des rôles de l’utilisateur, celles déjà refusées étant cochées', async () => {
      await afficher('4');

      expect(Array.from(racine().querySelectorAll('.user-form__code')).map((c) => c.textContent)).toEqual(['PAIE_READ', 'PAIE_WRITE']);
      expect(refus('PAIE_READ')!.checked).toBe(false);
      expect(refus('PAIE_WRITE')!.checked).toBe(true);
    });

    it('recalcule les permissions refusables quand les rôles changent, et oublie le refus d’une permission qui disparaît', async () => {
      await afficher('4');

      formulaire().roleIds().value.set([11]);
      await stabiliser();

      expect(Array.from(racine().querySelectorAll('.user-form__code')).map((c) => c.textContent)).toEqual(['EMPLOYEE_READ', 'PAIE_READ']);
      formulaire().roleIds().value.set([10, 11]);
      await stabiliser();
      expect(refus('PAIE_WRITE')!.checked).toBe(false);
    });

    it('enregistre l’utilisateur puis ses permissions refusées', async () => {
      await afficher('4');
      saisir(racine(), '#email', 'fatima.zahra@staport.ma');
      formulaire().actif().value.set(false);
      refus('PAIE_READ')!.checked = true;
      refus('PAIE_READ')!.dispatchEvent(new Event('change', { bubbles: true }));
      await stabiliser();

      await envoyer();

      expect(users.update).toHaveBeenCalledWith(4, { version: 0, email: 'fatima.zahra@staport.ma', actif: false, employeeId: 9, roleIds: [10] });
      expect(users.updateDeniedPermissions).toHaveBeenCalledWith(4, { version: 1, permissionIds: [2, 1] });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Utilisateur modifié');
      expect(navigation).toHaveBeenCalledWith(['/admin/users']);
    });

    it('marque le formulaire modifié quand on change un refus de permission', async () => {
      await afficher('4');
      expect(formulaire()().dirty()).toBe(false);

      refus('PAIE_READ')!.checked = true;
      refus('PAIE_READ')!.dispatchEvent(new Event('change', { bubbles: true }));
      await stabiliser();

      expect(formulaire()().dirty()).toBe(true);
    });

    it('ne valide pas le mot de passe en modification', async () => {
      await afficher('4');

      await envoyer();

      expect(users.update).toHaveBeenCalledTimes(1);
      expect(erreurs()).toEqual([]);
    });
  });
});
