import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirSignalForms } from '../../../shared/forms/signal-forms.config';
import { fournirRoute } from '../../../shared/testing/ecrans';
import { saisir, soumettre } from '../../../shared/testing/formulaire';
import { ChantierService } from '../services/chantier.service';
import { ChantierFormComponent } from './chantier-form.component';

describe('ChantierFormComponent', () => {
  let fixture: ComponentFixture<ChantierFormComponent>;
  let service: { getById: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const erreurs = () => Array.from(racine().querySelectorAll('[role="alert"]')).map((e) => e.textContent);

  async function afficher(id?: string, nom: string | null = 'Nord'): Promise<void> {
    service = {
      getById: vi.fn().mockReturnValue(of({ id: 3, code: 'C196', designation: 'Marrakech', nom, sourceErp: true, actif: true })),
      create: vi.fn().mockReturnValue(of({ id: 8 })),
      update: vi.fn().mockReturnValue(of({ id: 3 }))
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), fournirSignalForms(), fournirRoute(id ? { id } : {}), { provide: ChantierService, useValue: service }]
    });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ChantierFormComponent);
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

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  describe('création', () => {
    it('présente code et désignation obligatoires, nom facultatif, et pas de choix du statut', async () => {
      await afficher();

      expect(racine().querySelector('h1')?.textContent).toBe('Nouveau chantier');
      expect(racine().querySelector('label[for="code"] .field__req')).not.toBeNull();
      expect(racine().querySelector('label[for="designation"] .field__req')).not.toBeNull();
      expect(racine().querySelector('label[for="nom"] .field__req')).toBeNull();
      expect(racine().querySelector('#actif')).toBeNull();
    });

    it('présente les règles de chaque champ avant la saisie', async () => {
      await afficher();

      expect(racine().querySelector('#code')?.getAttribute('aria-describedby')).toBe('code-aide');
      expect(racine().querySelector('#code-aide')?.textContent).toContain('Obligatoire · 100 caractères maximum');
      expect(racine().querySelector('#code-aide')?.textContent).toContain('doit être unique');
      expect(racine().querySelector('#designation-aide')?.textContent).toContain('Obligatoire · 500 caractères maximum');
      expect(racine().querySelector('#nom-aide')?.textContent).toContain('Facultatif · 255 caractères maximum');
    });

    it('refuse un formulaire vide : code et désignation signalés, focus sur le code', async () => {
      await afficher();

      await envoyer();

      expect(service.create).not.toHaveBeenCalled();
      expect(erreurs()).toEqual(['Le code est obligatoire.', 'La désignation est obligatoire.']);
      expect(document.activeElement?.id).toBe('code');
    });

    it('limite les longueurs : code 100, désignation 500, nom 255', async () => {
      await afficher();

      expect(['code', 'designation', 'nom'].map((id) => racine().querySelector(`#${id}`)?.getAttribute('maxlength'))).toEqual(['100', '500', '255']);
    });

    it('crée le chantier : un nom vide est envoyé comme « aucun nom », le statut n’est pas envoyé', async () => {
      await afficher();
      saisir(racine(), '#code', 'C300');
      saisir(racine(), '#designation', 'Barrage');

      await envoyer();

      expect(service.create).toHaveBeenCalledWith({ code: 'C300', designation: 'Barrage', nom: null });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Chantier créé');
      expect(navigation).toHaveBeenCalledWith(['/chantiers', 8]);
      expect(fixture.componentInstance['form']().dirty()).toBe(false);
    });

    it('envoie le nom saisi', async () => {
      await afficher();
      saisir(racine(), '#code', 'C300');
      saisir(racine(), '#designation', 'Barrage');
      saisir(racine(), '#nom', 'Souss');

      await envoyer();

      expect(service.create).toHaveBeenCalledWith({ code: 'C300', designation: 'Barrage', nom: 'Souss' });
    });

    it('reste sur le formulaire quand le serveur refuse (code déjà utilisé)', async () => {
      await afficher();
      service.create.mockReturnValue(throwError(() => new Error('409')));
      saisir(racine(), '#code', 'C196');
      saisir(racine(), '#designation', 'Doublon');

      await envoyer();

      expect(navigation).not.toHaveBeenCalled();
      expect(fixture.componentInstance['form']().dirty()).toBe(true);
    });
  });

  describe('modification', () => {
    it('charge le chantier, propose le statut en cours/clôturé et enregistre', async () => {
      await afficher('3');

      expect(service.getById).toHaveBeenCalledWith(3);
      expect(racine().querySelector('h1')?.textContent).toBe('Modifier le chantier');
      expect((racine().querySelector('#code') as HTMLInputElement).value).toBe('C196');
      expect((racine().querySelector('#nom') as HTMLInputElement).value).toBe('Nord');
      expect((racine().querySelector('#actif') as HTMLInputElement).value).toBe('En cours');
      expect(fixture.componentInstance['form']().dirty()).toBe(false);

      fixture.componentInstance['form'].actif().value.set(false);
      saisir(racine(), '#designation', 'Marrakech centre');
      await envoyer();

      expect(service.update).toHaveBeenCalledWith(3, { code: 'C196', designation: 'Marrakech centre', nom: 'Nord', actif: false });
      expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Chantier modifié');
      expect(navigation).toHaveBeenCalledWith(['/chantiers', 3]);
    });

    it('charge un chantier sans nom comme un champ vide, et l’enregistre toujours sans nom', async () => {
      await afficher('3', null);
      expect((racine().querySelector('#nom') as HTMLInputElement).value).toBe('');

      await envoyer();

      expect(service.update).toHaveBeenCalledWith(3, { code: 'C196', designation: 'Marrakech', nom: null, actif: true });
    });
  });
});
