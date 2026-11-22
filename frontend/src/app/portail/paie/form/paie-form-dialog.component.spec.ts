import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { fournirSignalForms } from '../../../shared/forms/signal-forms.config';
import { ConfirmDialogService } from '../../../shared/ui/feedback/feedback.service';
import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EmployeeReferenceService } from '../../../shared/reference-data/employee-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { fournirRoute } from '../../../shared/testing/ecrans';
import { PaieService } from '../services/paie.service';
import { PaieFormDialogComponent } from './paie-form-dialog.component';

@Component({
  imports: [PaieFormDialogComponent],
  template: `<app-paie-form-dialog [(ouvert)]="ouvert" [paieId]="paieId()" (enregistre)="enregistres.push($event.id)" />`
})
class HoteComponent {
  readonly ouvert = signal(false);
  readonly paieId = signal<number | null>(null);
  enregistres: number[] = [];
}

const referentiel = () => ({ fetchPage: () => of({ items: [], totalRecords: 0 }), fetchById: (id: number) => of({ id }) });

describe('PaieFormDialogComponent (KAN-310)', () => {
  let service: { getById: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let confirmation: ConfirmDialogService;

  function monter() {
    service = { getById: vi.fn(), create: vi.fn().mockReturnValue(of({ id: 40 })), update: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        fournirSignalForms(),
        fournirRoute({}),
        { provide: PaieService, useValue: service },
        { provide: EmployeeReferenceService, useValue: referentiel() },
        { provide: FunctionReferenceService, useValue: referentiel() },
        { provide: ChantierReferenceService, useValue: referentiel() },
        { provide: EquipeReferenceService, useValue: referentiel() }
      ]
    });
    confirmation = TestBed.inject(ConfirmDialogService);
    const fixture = TestBed.createComponent(HoteComponent);
    fixture.detectChanges();
    return fixture;
  }

  async function ouvrir(fixture: ReturnType<typeof monter>, paieId: number | null = null) {
    fixture.componentInstance.paieId.set(paieId);
    fixture.componentInstance.ouvert.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const fenetre = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const fermer = () => document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="Fermer"]')!.click();
  const attendre = () => new Promise((resolve) => setTimeout(resolve));

  function saisir(fixture: ReturnType<typeof monter>): void {
    const champ = fenetre()!.querySelector<HTMLInputElement>('#observation')!;
    champ.value = 'Saisie en cours';
    champ.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove());
    sessionStorage.clear();
  });

  it('ouvre le formulaire de la page en fenêtre modale titrée, et rien tant qu’elle est fermée', async () => {
    const fixture = monter();
    expect(fenetre()).toBeNull();

    await ouvrir(fixture);

    expect(fenetre()?.getAttribute('aria-modal')).toBe('true');
    expect(fenetre()?.querySelector('h2')?.textContent).toBe('Nouveau bulletin de paie');
    expect(fenetre()?.querySelector('form')).not.toBeNull();
    expect(fenetre()?.querySelector('h1')).toBeNull();
  });

  it('titre la fenêtre « Modifier le bulletin » pour un bulletin existant', async () => {
    const fixture = monter();
    service.getById.mockReturnValue(of({
        id: 8, version: 0, employee: { id: 9 }, periode: '2026-08', fonction: { id: 1 }, chantier: { id: 2 }, equipe: null,
        nombreJoursTravailles: 26, joursRecuperationOuvrable: null, joursRecuperationDimanche: null, salaireMensuel: 4000,
        primeRoulageOrdinaire: null, primeRoulageDimanche: null, salaireTotal: 4000, observation: null
      }));

    await ouvrir(fixture, 8);

    expect(fenetre()?.querySelector('h2')?.textContent).toBe('Modifier le bulletin');
    expect(service.getById).toHaveBeenCalledWith(8);
  });

  it('ferme sans question quand rien n’est saisi', async () => {
    const fixture = monter();
    await ouvrir(fixture);

    fermer();
    await attendre();
    fixture.detectChanges();

    expect(fenetre()).toBeNull();
    expect(fixture.componentInstance.ouvert()).toBe(false);
  });

  it('demande confirmation à la fermeture avec une saisie non enregistrée, et reste ouverte sur « Rester »', async () => {
    const fixture = monter();
    await ouvrir(fixture);
    saisir(fixture);

    fermer();
    await attendre();

    expect(confirmation.request()?.header).toBe('Fermer sans enregistrer ?');
    expect(confirmation.request()?.message).toContain('brouillon');
    confirmation.reject();
    await attendre();
    fixture.detectChanges();
    expect(fenetre()).not.toBeNull();
  });

  it('ferme après confirmation et garde le brouillon pour la prochaine ouverture', async () => {
    const fixture = monter();
    await ouvrir(fixture);
    saisir(fixture);

    fermer();
    await attendre();
    confirmation.accept();
    await attendre();
    fixture.detectChanges();

    expect(fenetre()).toBeNull();
    expect(sessionStorage.getItem('staport-paie-brouillon')).toContain('Saisie en cours');
  });

  it('ferme avec la touche Échap, avec la même garde', async () => {
    const fixture = monter();
    await ouvrir(fixture);

    fenetre()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await attendre();
    fixture.detectChanges();

    expect(fenetre()).toBeNull();
  });

  it('Échap avec une saisie demande aussi confirmation', async () => {
    const fixture = monter();
    await ouvrir(fixture);
    saisir(fixture);

    fenetre()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await attendre();

    expect(confirmation.request()).not.toBeNull();
    expect(fenetre()).not.toBeNull();
  });
});
