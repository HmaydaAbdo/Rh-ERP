import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NotificationService } from '../../../shared/feedback/feedback.service';
import { fournirRoute } from '../../../shared/testing/ecrans';
import { saisir, soumettre } from '../../../shared/testing/formulaire';
import { EquipeService } from '../services/equipe.service';
import { EquipeFormComponent } from './equipe-form.component';

describe('EquipeFormComponent', () => {
  let fixture: ComponentFixture<EquipeFormComponent>;
  let service: { getById: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let navigation: ReturnType<typeof vi.spyOn>;
  const racine = () => fixture.nativeElement as HTMLElement;
  const erreurs = () => Array.from(racine().querySelectorAll('[role="alert"]')).map((e) => e.textContent);

  async function afficher(id?: string): Promise<void> {
    service = {
      getById: vi.fn().mockReturnValue(of({ id: 2, code: 'CH', libelle: 'Chauffeurs' })),
      create: vi.fn().mockReturnValue(of({ id: 5, code: 'OP', libelle: 'Opérateurs' })),
      update: vi.fn().mockReturnValue(of({ id: 2, code: 'CH', libelle: 'Chauffeurs PL' }))
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), fournirRoute(id ? { id } : {}), { provide: EquipeService, useValue: service }] });
    navigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(EquipeFormComponent);
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

  it('présente le formulaire de création et rappelle que le code est enregistré en majuscules', async () => {
    await afficher();

    expect(racine().querySelector('h1')?.textContent).toBe('Nouvelle équipe');
    expect(racine().textContent).toContain('Enregistré en majuscules');
  });

  it('refuse un formulaire vide : les deux champs sont signalés, le focus va au premier', async () => {
    await afficher();

    await envoyer();

    expect(service.create).not.toHaveBeenCalled();
    expect(erreurs()).toEqual(['Le code est obligatoire.', 'Le libellé est obligatoire.']);
    expect(document.activeElement?.id).toBe('code');
  });

  it('limite le code à 50 caractères et le libellé à 100', async () => {
    await afficher();

    expect(racine().querySelector('#code')?.getAttribute('maxlength')).toBe('50');
    expect(racine().querySelector('#libelle')?.getAttribute('maxlength')).toBe('100');
  });

  it('crée l’équipe avec son code et son libellé, annonce le succès et ouvre sa fiche', async () => {
    await afficher();
    saisir(racine(), '#code', 'OP');
    saisir(racine(), '#libelle', 'Opérateurs');

    await envoyer();

    expect(service.create).toHaveBeenCalledWith({ code: 'OP', libelle: 'Opérateurs' });
    expect(TestBed.inject(NotificationService).notifications()[0]).toMatchObject({ summary: 'Équipe créée' });
    expect(navigation).toHaveBeenCalledWith(['/equipes', 5]);
    expect(fixture.componentInstance['form']().dirty()).toBe(false);
  });

  it('reste sur le formulaire quand le serveur refuse (code déjà utilisé)', async () => {
    await afficher();
    service.create.mockReturnValue(throwError(() => new Error('409')));
    saisir(racine(), '#code', 'CH');
    saisir(racine(), '#libelle', 'Chauffeurs');

    await envoyer();

    expect(navigation).not.toHaveBeenCalled();
    expect(fixture.componentInstance['form']().dirty()).toBe(true);
  });

  it('charge l’équipe à modifier, puis enregistre la modification', async () => {
    await afficher('2');
    expect(service.getById).toHaveBeenCalledWith(2);
    expect((racine().querySelector('#code') as HTMLInputElement).value).toBe('CH');
    expect((racine().querySelector('#libelle') as HTMLInputElement).value).toBe('Chauffeurs');
    expect(racine().querySelector('h1')?.textContent).toBe("Modifier l'équipe");
    expect(fixture.componentInstance['form']().dirty()).toBe(false);

    saisir(racine(), '#libelle', 'Chauffeurs PL');
    await envoyer();

    expect(service.update).toHaveBeenCalledWith(2, { code: 'CH', libelle: 'Chauffeurs PL' });
    expect(TestBed.inject(NotificationService).notifications()[0].summary).toBe('Équipe modifiée');
    expect(navigation).toHaveBeenCalledWith(['/equipes', 2]);
  });
});
