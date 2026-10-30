import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Component, input, model, WritableSignal } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ConfirmDialogService } from '../../../shared/feedback/feedback.service';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { LazySelectComponent } from '../../../shared/components/lazy-select/lazy-select.component';
import { HeuresSupp } from '../models/heures-supp.model';
import { HeuresSuppService } from '../services/heures-supp.service';
import { HeuresSuppListComponent } from './heures-supp-list.component';

const LIGNE: HeuresSupp = {
  id: 1, version: 0, employeeId: 2, nomPrenom: 'Alaoui Salma', cin: 'AB123', fonction: 'Chauffeur', chantierId: 4,
  codeChantier: 'C4', chantier: 'Site', periode: '2026-10', salaireHoraireDh: 10, heuresSupplementaires: 2,
  montantDh: 20, stcOuSortie: false, stcDh: 0, forfaitDh: null, netAPayerDh: 20
};

@Component({ selector: 'app-lazy-select', standalone: true, template: '' })
class LazySelectStub {
  readonly ariaLabel = input<string | null>(null);
  readonly placeholder = input('');
  readonly optionLabel = input('');
  readonly inputId = input<string | null>(null);
  readonly source = input<unknown>();
  readonly value = model<unknown>(null);
}

describe('HeuresSuppListComponent', () => {
  let fixture: ComponentFixture<HeuresSuppListComponent>;
  let service: Record<string, ReturnType<typeof vi.fn>>;
  let confirmation: { confirm: ReturnType<typeof vi.fn> };
  let component: {
    charger(event: { first: number; rows: number; sortField: string | null; sortOrder: 1 | -1 }): void;
    lignes(): HeuresSupp[]; total(): number; chargement(): boolean; erreur(): string | null;
    nouvelEmploye: WritableSignal<unknown>; nouveauChantier: WritableSignal<unknown>;
    nouvellePeriode: WritableSignal<string>; nouvellesHeures: WritableSignal<number | null>; nouveauForfait: WritableSignal<number | null>;
    editionId(): number | null; heuresEdition(): number | null; forfaitEdition(): number | null;
    purgeNombre: WritableSignal<number | null>; purgeSaisie: WritableSignal<string>; criteres: { periode?: string };
    nouvelleSaisieValide(): boolean; ajouter(): void; editer(ligne: HeuresSupp): void; sauver(ligne: HeuresSupp): void;
    supprimer(ligne: HeuresSupp): void; preparerPurge(): void; purgerMois(): void;
    inputText(event: Event): string; numberValue(event: Event): number | null;
  };

  beforeEach(() => {
    service = {
      search: vi.fn().mockReturnValue(of({ content: [LIGNE], page: { totalElements: 1, number: 0, size: 20, totalPages: 1 } })),
      creer: vi.fn().mockReturnValue(of(LIGNE)), modifier: vi.fn().mockReturnValue(of(LIGNE)),
      supprimer: vi.fn().mockReturnValue(of(undefined)), supprimerMois: vi.fn().mockReturnValue(of(1))
    };
    confirmation = { confirm: vi.fn() };
    TestBed.configureTestingModule({
      imports: [HeuresSuppListComponent],
      providers: [provideRouter([]), { provide: HeuresSuppService, useValue: service },
        { provide: ConfirmDialogService, useValue: confirmation },
        { provide: AuthService, useValue: { hasPermission: () => true } },
        { provide: EmployeeReferenceService, useValue: {} }, { provide: ChantierReferenceService, useValue: {} },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ periode: '2026-10', chantierIds: '4,5', equipeIds: '0', fonctionIds: '8' })) } }]
    });
    TestBed.overrideComponent(HeuresSuppListComponent, {
      remove: { imports: [LazySelectComponent] }, add: { imports: [LazySelectStub] }
    });
    fixture = TestBed.createComponent(HeuresSuppListComponent);
    component = fixture.componentInstance as unknown as typeof component;
    fixture.detectChanges();
  });

  it('applique les filtres d’URL et pagine les résultats', () => {
    component.charger({ first: 40, rows: 20, sortField: 'periode', sortOrder: -1 });

    expect(service['search']).toHaveBeenCalledWith({ periode: '2026-10', chantierIds: [4, 5], equipeIds: [0], fonctionIds: [8] }, 2, 20);
    expect(component.lignes()).toEqual([LIGNE]);
    expect(component.total()).toBe(1);
    expect(component.chargement()).toBe(false);
    expect(component.erreur()).toBeNull();
  });

  it('affiche un message métier quand le chargement échoue', () => {
    service['search'].mockReturnValue(throwError(() => new Error('network')));

    component.charger({ first: 0, rows: 20, sortField: 'periode', sortOrder: -1 });

    expect(component.erreur()).toContain('n’ont pas pu être chargées');
    expect(component.chargement()).toBe(false);
  });

  it('valide et crée une saisie manuelle puis recharge la page courante', () => {
    component.charger({ first: 20, rows: 20, sortField: 'periode', sortOrder: -1 });
    component.nouvelEmploye.set(2); component.nouveauChantier.set(4); component.nouvellesHeures.set(1.5);
    expect(component.nouvelleSaisieValide()).toBe(true);
    component.ajouter();
    expect(service['creer']).toHaveBeenCalledWith({ employeeId: 2, chantierId: 4, periode: '2026-10', heuresSupplementaires: 1.5, forfaitDh: null });
    expect(service['search']).toHaveBeenLastCalledWith(expect.anything(), 1, 20);
    expect(component.nouvelEmploye()).toBeNull();
    expect(component.nouvellesHeures()).toBeNull();
  });

  it('refuse une saisie incomplète et expose les erreurs de création', () => {
    component.ajouter();
    expect(service['creer']).not.toHaveBeenCalled();
    component.nouvelEmploye.set(2); component.nouveauChantier.set(4); component.nouveauForfait.set(100);
    service['creer'].mockReturnValue(throwError(() => new Error('duplicate')));
    component.ajouter();
    expect(component.erreur()).toContain('La ligne n’a pas pu être ajoutée');
  });

  it('prépare, enregistre et annule la modification avec rechargement', () => {
    component.charger({ first: 0, rows: 20, sortField: 'periode', sortOrder: -1 });
    component.editer(LIGNE);
    expect(component.editionId()).toBe(1);
    expect(component.heuresEdition()).toBe(2);
    component.sauver(LIGNE);
    expect(service['modifier']).toHaveBeenCalledWith(1, { version: 0, heuresSupplementaires: 2, forfaitDh: null });
    expect(component.editionId()).toBeNull();
    service['modifier'].mockReturnValue(throwError(() => new Error('stale')));
    component.sauver(LIGNE);
    expect(component.erreur()).toContain('La ligne n’a pas pu être modifiée');
  });

  it('demande confirmation avant suppression unitaire et relaie les erreurs', () => {
    component.charger({ first: 0, rows: 20, sortField: 'periode', sortOrder: -1 });
    component.supprimer(LIGNE);
    expect(confirmation.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Alaoui Salma') }));
    const request = confirmation.confirm.mock.calls[0][0] as { accept: () => void };
    request.accept();
    expect(service['supprimer']).toHaveBeenCalledWith(1);
    service['supprimer'].mockReturnValue(throwError(() => new Error('failure')));
    component.supprimer(LIGNE);
    (confirmation.confirm.mock.calls[1][0] as { accept: () => void }).accept();
    expect(component.erreur()).toContain('La ligne n’a pas pu être supprimée');
  });

  it('confirme la purge de tout le mois par son nombre de lignes et traite les erreurs', () => {
    component.preparerPurge();
    expect(service['search']).toHaveBeenLastCalledWith({ periode: '2026-10' }, 0, 1);
    expect(component.purgeNombre()).toBe(1);
    component.purgerMois();
    expect(service['supprimerMois']).not.toHaveBeenCalled();
    component.purgeSaisie.set('1'); component.purgerMois();
    expect(service['supprimerMois']).toHaveBeenCalledWith('2026-10', 1);
    service['supprimerMois'].mockReturnValue(throwError(() => new Error('stale count')));
    component.preparerPurge();
    component.purgeSaisie.set('1'); component.purgerMois();
    expect(component.erreur()).toContain('Le mois a changé');
  });

  it('ignore une purge si le mois est absent et affiche les erreurs de comptage', () => {
    component.criteres = {};
    component.preparerPurge();
    expect(service['search']).toHaveBeenCalledTimes(1);
    component.criteres = { periode: '2026-10' };
    service['search'].mockReturnValueOnce(throwError(() => new Error('network')));
    component.preparerPurge();
    expect(component.erreur()).toContain('Le nombre de lignes du mois n’a pas pu être vérifié');
  });

  it('convertit les valeurs des champs et refuse les types de sélection non numériques', () => {
    component.nouvelEmploye.set('2'); component.nouveauChantier.set(4);
    expect(component.nouvelleSaisieValide()).toBe(false);
    expect(component.inputText({ target: { value: '12' } } as unknown as Event)).toBe('12');
    expect(component.numberValue({ target: { value: '' } } as unknown as Event)).toBeNull();
    expect(component.numberValue({ target: { value: '1.5' } } as unknown as Event)).toBe(1.5);
  });

  it('relie les boutons du formulaire, de modification et de purge aux actions de la liste', () => {
    component.charger({ first: 0, rows: 20, sortField: 'periode', sortOrder: -1 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Alaoui Salma');

    component.nouvelEmploye.set(2); component.nouveauChantier.set(4); component.nouvellesHeures.set(3);
    fixture.detectChanges();
    const boutonAjouter = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Ajouter')) as HTMLButtonElement;
    boutonAjouter.click();
    fixture.detectChanges();
    expect(service['creer']).toHaveBeenCalled();

    const boutonModifier = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Modifier')) as HTMLButtonElement;
    boutonModifier.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Heures supplémentaires"]')).not.toBeNull();
    const boutonEnregistrer = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Enregistrer')) as HTMLButtonElement;
    boutonEnregistrer.click();
    fixture.detectChanges();
    expect(service['modifier']).toHaveBeenCalled();

    const boutonPurge = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Supprimer tout le mois')) as HTMLButtonElement;
    boutonPurge.click();
    fixture.detectChanges();
    const saisiePurge = fixture.nativeElement.querySelector('.heures-supp-purge input') as HTMLInputElement;
    saisiePurge.value = '1';
    saisiePurge.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const boutonConfirmer = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) => button.textContent.includes('Confirmer la suppression')) as HTMLButtonElement;
    boutonConfirmer.click();
    fixture.detectChanges();
    expect(service['supprimerMois']).toHaveBeenCalledWith('2026-10', 1);
  });
});
