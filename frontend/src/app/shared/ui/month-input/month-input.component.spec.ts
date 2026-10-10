import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { disabled, form, FormField, required } from '@angular/forms/signals';

import { MonthInputComponent } from './month-input.component';

@Component({
  selector: 'app-mois-test',
  imports: [MonthInputComponent, FormField],
  template: `<stp-month-input inputId="periode" ariaLabel="Période" placeholder="Choisir un mois" [formField]="formulaire.periode" />`
})
class MoisTestComponent {
  readonly modele = signal<{ periode: Date | null }>({ periode: null });
  readonly desactive = signal(false);
  readonly formulaire = form(this.modele, (chemin) => {
    required(chemin.periode, { message: 'La période est obligatoire.' });
    disabled(chemin.periode, () => this.desactive());
  });
}

describe('MonthInputComponent', () => {
  let fixture: ComponentFixture<MoisTestComponent>;
  let hote: MoisTestComponent;
  const declencheur = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  const panneau = () => document.querySelector('[role="dialog"][aria-label="Choisir un mois"]') as HTMLElement | null;

  async function afficher(configurer?: (h: MoisTestComponent) => void): Promise<void> {
    fixture = TestBed.createComponent(MoisTestComponent);
    hote = fixture.componentInstance;
    configurer?.(hote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function ouvrir(): Promise<void> {
    declencheur().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  it('affiche le placeholder tant qu’aucun mois n’est choisi', async () => {
    await afficher();

    expect(declencheur().textContent).toContain('Choisir un mois');
    expect(declencheur().id).toBe('periode');
    expect(declencheur().getAttribute('aria-haspopup')).toBe('dialog');
    expect(declencheur().getAttribute('aria-expanded')).toBe('false');
  });

  it('affiche le mois du formulaire sous la forme mm/aaaa', async () => {
    await afficher((h) => h.modele.set({ periode: new Date(2026, 7, 1) }));

    expect(declencheur().textContent).toContain('08/2026');
  });

  it('ouvre le sélecteur de mois dans une fenêtre flottante nommée', async () => {
    await afficher();

    await ouvrir();

    expect(panneau()).not.toBeNull();
    expect(declencheur().getAttribute('aria-expanded')).toBe('true');
  });

  it('écrit le premier jour du mois choisi, se referme et marque le champ touché', async () => {
    await afficher();
    await ouvrir();

    const mois = Array.from(panneau()!.querySelectorAll('button')).find((b) => /août/i.test(b.textContent ?? '')) as HTMLButtonElement;
    mois.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const date = hote.modele().periode!;
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(1);
    expect(panneau()).toBeNull();
    expect(hote.formulaire.periode().touched()).toBe(true);
  });

  it('se referme avec Échap', async () => {
    await afficher();
    await ouvrir();

    panneau()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(panneau()).toBeNull();
  });

  it('révèle la règle « obligatoire » une fois le sélecteur refermé sans choix', async () => {
    await afficher();
    await ouvrir();

    panneau()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(hote.formulaire.periode().errors()[0].message).toBe('La période est obligatoire.');
    expect(hote.formulaire.periode().touched()).toBe(true);
  });

  it('se désactive avec le formulaire et prend le focus sur demande', async () => {
    await afficher();
    hote.formulaire.periode().focusBoundControl();
    expect(document.activeElement).toBe(declencheur());

    hote.desactive.set(true);
    fixture.detectChanges();
    expect(declencheur().disabled).toBe(true);
  });
});
