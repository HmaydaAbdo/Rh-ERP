import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirSignalForms } from '../../../shared/forms/signal-forms.config';
import { fournirRoute } from '../../../shared/testing/ecrans';
import { saisir, soumettre } from '../../../shared/testing/formulaire';
import { FunctionService } from '../services/function.service';
import { FunctionFormComponent } from './function-form.component';

describe('FunctionFormComponent', () => {
  let fixture: ComponentFixture<FunctionFormComponent>;
  let service: { getById: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const champ = () => racine().querySelector('#libelle') as HTMLInputElement;
  const erreur = () => racine().querySelector('[role="alert"]')?.textContent;

  async function afficher(id?: string): Promise<void> {
    service = {
      getById: vi.fn().mockReturnValue(of({ id: 7, libelle: 'MACON' })),
      create: vi.fn().mockReturnValue(of({ id: 12, libelle: 'PLOMBIER' })),
      update: vi.fn().mockReturnValue(of({ id: 7, libelle: 'MACON SENIOR' }))
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirSignalForms(), fournirRoute(id ? { id } : {}), { provide: FunctionService, useValue: service }]
    });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(FunctionFormComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function envoyer(): Promise<void> {
    soumettre(racine());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('création', () => {
    it('présente un formulaire de création avec un champ obligatoire marqué', async () => {
      await afficher();

      expect(racine().querySelector('h1')?.textContent).toBe('Nouvelle fonction');
      expect(racine().querySelector('label[for="libelle"] .field__req')).not.toBeNull();
      expect(racine().querySelector('button[type="submit"]')?.textContent).toContain('Créer');
      expect(service.getById).not.toHaveBeenCalled();
    });

    it('présente les règles du libellé avant la saisie', async () => {
      await afficher();

      expect(champ().getAttribute('aria-describedby')).toBe('libelle-aide');
      expect(racine().querySelector('#libelle-aide')?.textContent).toContain('Obligatoire · 100 caractères maximum');
      expect(racine().querySelector('#libelle-aide')?.textContent).toContain('doit être unique');
    });

    it('refuse un libellé vide : aucun appel, message annoncé, focus sur le champ', async () => {
      await afficher();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(erreur()).toBe('Le libellé est obligatoire.');
      expect(document.activeElement).toBe(champ());
      expect(champ().className).toContain('ng-invalid');
    });

    it('n’affiche pas d’erreur tant que l’utilisateur n’a pas touché le champ', async () => {
      await afficher();

      expect(erreur()).toBeUndefined();
    });

    it('limite la saisie à 100 caractères', async () => {
      await afficher();

      expect(champ().getAttribute('maxlength')).toBe('100');
    });

    it('crée la fonction, annonce le succès et ouvre sa fiche', async () => {
      await afficher();
      saisir(racine(), '#libelle', 'PLOMBIER');

      await envoyer();

      expect(service.create).toHaveBeenCalledWith({ libelle: 'PLOMBIER' });
      expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({ severity: 'success', summary: 'Fonction créée' });
      expect(navigation).toHaveBeenCalledWith(['/functions', 12]);
    });

    it('remet le formulaire à l’état intact après l’enregistrement (aucune confirmation en quittant)', async () => {
      await afficher();
      saisir(racine(), '#libelle', 'PLOMBIER');
      expect(fixture.componentInstance['form']().dirty()).toBe(true);

      await envoyer();

      expect(fixture.componentInstance['form']().dirty()).toBe(false);
    });

    it('reste sur le formulaire, sans notification de succès, quand le serveur refuse', async () => {
      await afficher();
      service.create.mockReturnValue(throwError(() => new Error('409')));
      saisir(racine(), '#libelle', 'MACON');

      await envoyer();

      expect(navigation).not.toHaveBeenCalled();
      expect(TestBed.inject(NotificationService).notifications()).toEqual([]);
      expect(fixture.componentInstance['form']().dirty()).toBe(true);
      expect(champ().value).toBe('MACON');
    });

    it('indique l’envoi en cours sur le bouton et empêche un second envoi', async () => {
      await afficher();
      saisir(racine(), '#libelle', 'PLOMBIER');
      const reponse = new Subject<{ id: number; libelle: string }>();
      service.create.mockReturnValue(reponse);

      soumettre(racine());
      soumettre(racine());
      fixture.detectChanges();

      expect(service.create).toHaveBeenCalledTimes(1);
      expect(racine().querySelector('button[type="submit"]')?.getAttribute('aria-busy')).toBe('true');
      reponse.next({ id: 12, libelle: 'PLOMBIER' });
      reponse.complete();
      await fixture.whenStable();
    });
  });

  describe('modification', () => {
    it('charge la fonction de l’adresse dans le champ, sans marquer le formulaire modifié', async () => {
      await afficher('7');

      expect(service.getById).toHaveBeenCalledWith(7);
      expect(racine().querySelector('h1')?.textContent).toBe('Modifier la fonction');
      expect(champ().value).toBe('MACON');
      expect(racine().querySelector('button[type="submit"]')?.textContent).toContain('Enregistrer');
      expect(fixture.componentInstance['form']().dirty()).toBe(false);
    });

    it('enregistre la modification et ouvre la fiche', async () => {
      await afficher('7');
      saisir(racine(), '#libelle', 'MACON SENIOR');

      await envoyer();

      expect(service.update).toHaveBeenCalledWith(7, { libelle: 'MACON SENIOR' });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Fonction modifiée');
      expect(navigation).toHaveBeenCalledWith(['/functions', 7]);
    });

    it('refuse de vider le libellé existant', async () => {
      await afficher('7');
      saisir(racine(), '#libelle', '');

      await envoyer();

      expect(service.update).not.toHaveBeenCalled();
      expect(erreur()).toBe('Le libellé est obligatoire.');
    });
  });
});
