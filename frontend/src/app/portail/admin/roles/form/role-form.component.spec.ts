import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../../shared/feedback/feedback.service';
import { fournirSignalForms } from '../../../../shared/forms/signal-forms.config';
import { fournirRoute } from '../../../../shared/testing/ecrans';
import { saisir, soumettre } from '../../../../shared/testing/formulaire';
import { PermissionSummary, Role } from '../../models/admin.model';
import { RoleService } from '../../services/role.service';
import { RoleFormComponent } from './role-form.component';

const PERMISSIONS: PermissionSummary[] = [
  { id: 1, code: 'EMPLOYEE_READ', description: 'Lire les employés' },
  { id: 2, code: 'EMPLOYEE_WRITE', description: 'Modifier les employés' },
  { id: 3, code: 'PAIE_READ', description: 'Lire la paie' },
  { id: 4, code: 'PAIE_WRITE', description: 'Modifier la paie' }
];

const ROLE: Role = { id: 6, nom: 'Comptable', description: 'Équipe comptabilité', permissions: [PERMISSIONS[2]], protege: false };

describe('RoleFormComponent', () => {
  let fixture: ComponentFixture<RoleFormComponent>;
  let service: { findAllPermissions: ReturnType<typeof vi.fn>; findById: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const case_ = (code: string) => racine().querySelector(`input[aria-label="${code}"]`) as HTMLInputElement;
  const groupe = (domaine: string) => racine().querySelector(`input[aria-label="Tout sélectionner : ${domaine}"]`) as HTMLInputElement;
  const formulaire = () => fixture.componentInstance['form'];

  async function stabiliser(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function afficher(id?: string, role: Role = ROLE): Promise<void> {
    service = {
      findAllPermissions: vi.fn().mockReturnValue(of(PERMISSIONS)),
      findById: vi.fn().mockReturnValue(of(role)),
      create: vi.fn().mockReturnValue(of({ id: 20 })),
      update: vi.fn().mockReturnValue(of({ id: 6 }))
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), fournirSignalForms(), fournirRoute(id ? { id } : {}), { provide: RoleService, useValue: service }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(RoleFormComponent);
    await stabiliser();
  }

  async function envoyer(): Promise<void> {
    soumettre(racine());
    await stabiliser();
  }

  async function cocher(element: HTMLInputElement, coche: boolean): Promise<void> {
    element.checked = coche;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await stabiliser();
  }

  describe('création', () => {
    it('regroupe les permissions par domaine, dans l’ordre alphabétique, toutes décochées', async () => {
      await afficher();

      expect(racine().querySelector('h1')?.textContent).toBe('Nouveau rôle');
      expect(Array.from(racine().querySelectorAll('.role-form__group-header strong')).map((e) => e.textContent)).toEqual(['EMPLOYEE', 'PAIE']);
      expect(Array.from(racine().querySelectorAll('.role-form__code')).map((e) => e.textContent)).toEqual(['EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'PAIE_READ', 'PAIE_WRITE']);
      expect(Array.from(racine().querySelectorAll('input[type="checkbox"]')).every((c) => !(c as HTMLInputElement).checked)).toBe(true);
    });

    it('refuse un rôle sans nom', async () => {
      await afficher();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(racine().querySelector('[role="alert"]')?.textContent).toBe('Le nom est obligatoire.');
      expect(document.activeElement?.id).toBe('nom');
    });

    it('limite le nom à 50 caractères', async () => {
      await afficher();

      expect(racine().querySelector('#nom')?.getAttribute('maxlength')).toBe('50');
    });

    it('coche une permission, tout un domaine, puis décoche le domaine', async () => {
      await afficher();

      await cocher(case_('PAIE_READ'), true);
      expect(case_('PAIE_READ').checked).toBe(true);
      expect(groupe('PAIE').checked).toBe(false);

      await cocher(groupe('PAIE'), true);
      expect(case_('PAIE_WRITE').checked).toBe(true);
      expect(groupe('PAIE').checked).toBe(true);
      expect(case_('EMPLOYEE_READ').checked).toBe(false);

      await cocher(groupe('PAIE'), false);
      expect(case_('PAIE_READ').checked).toBe(false);
      expect(case_('PAIE_WRITE').checked).toBe(false);
    });

    it('marque le formulaire modifié dès qu’une permission est cochée (confirmation en quittant)', async () => {
      await afficher();
      expect(formulaire()().dirty()).toBe(false);

      await cocher(case_('PAIE_READ'), true);

      expect(formulaire()().dirty()).toBe(true);
    });

    it('crée le rôle avec ses permissions, une description vide devenant « aucune »', async () => {
      await afficher();
      saisir(racine(), '#nom', 'RH');
      await cocher(case_('EMPLOYEE_READ'), true);
      await cocher(groupe('PAIE'), true);

      await envoyer();

      expect(service.create).toHaveBeenCalledWith({ nom: 'RH', description: null, permissionIds: [1, 3, 4] });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Rôle créé');
      expect(navigation).toHaveBeenCalledWith(['/admin/roles']);
      expect(formulaire()().dirty()).toBe(false);
    });

    it('reste sur le formulaire quand le serveur refuse (nom déjà utilisé)', async () => {
      await afficher();
      service.create.mockReturnValue(throwError(() => new Error('409')));
      saisir(racine(), '#nom', 'RH');

      await envoyer();

      expect(navigation).not.toHaveBeenCalled();
      expect(formulaire()().dirty()).toBe(true);
    });
  });

  describe('modification', () => {
    it('charge le rôle et coche ses permissions', async () => {
      await afficher('6');

      expect(service.findById).toHaveBeenCalledWith(6);
      expect(racine().querySelector('h1')?.textContent).toBe('Modifier le rôle');
      expect((racine().querySelector('#nom') as HTMLInputElement).value).toBe('Comptable');
      expect((racine().querySelector('#description') as HTMLInputElement).value).toBe('Équipe comptabilité');
      expect(case_('PAIE_READ').checked).toBe(true);
      expect(case_('PAIE_WRITE').checked).toBe(false);
      expect(formulaire()().dirty()).toBe(false);
    });

    it('enregistre le nom, la description et les permissions modifiés', async () => {
      await afficher('6');
      saisir(racine(), '#description', 'Comptabilité et paie');
      await cocher(case_('PAIE_WRITE'), true);

      await envoyer();

      expect(service.update).toHaveBeenCalledWith(6, { nom: 'Comptable', description: 'Comptabilité et paie', permissionIds: [3, 4] });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Rôle modifié');
    });
  });

  describe('rôle d’administration (protégé)', () => {
    const PROTEGE: Role = { ...ROLE, id: 1, nom: 'SYSTEM_ADMIN', protege: true, permissions: PERMISSIONS };

    it('verrouille le nom et les permissions, et l’explique', async () => {
      await afficher('1', PROTEGE);

      expect((racine().querySelector('#nom') as HTMLInputElement).disabled).toBe(true);
      expect(case_('PAIE_READ').disabled).toBe(true);
      expect(groupe('PAIE').disabled).toBe(true);
      expect(racine().querySelector('.role-form__protege')?.textContent).toContain('Seule sa description peut être modifiée');
    });

    it('ne change pas les permissions même si une case est actionnée', async () => {
      await afficher('1', PROTEGE);

      await cocher(case_('PAIE_READ'), false);
      await envoyer();

      expect(service.update).toHaveBeenCalledWith(1, { nom: 'SYSTEM_ADMIN', description: 'Équipe comptabilité', permissionIds: [1, 2, 3, 4] });
    });

    it('permet de modifier la description', async () => {
      await afficher('1', PROTEGE);
      saisir(racine(), '#description', 'Administration complète');

      await envoyer();

      expect(service.update).toHaveBeenCalledWith(1, expect.objectContaining({ description: 'Administration complète' }));
    });
  });
});
