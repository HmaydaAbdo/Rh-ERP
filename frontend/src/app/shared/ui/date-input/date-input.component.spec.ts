import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { disabled, form, FormField, required } from '@angular/forms/signals';

import { DateInputComponent } from './date-input.component';

@Component({
  selector: 'app-date-test',
  imports: [DateInputComponent, FormField],
  template: `<stp-date-input inputId="naissance" ariaLabel="Date de naissance" [formField]="formulaire.naissance" />`
})
class DateTestComponent {
  readonly modele = signal<{ naissance: Date | null }>({ naissance: null });
  readonly desactive = signal(false);
  readonly formulaire = form(this.modele, (chemin) => {
    required(chemin.naissance, { message: 'La date est obligatoire.' });
    disabled(chemin.naissance, () => this.desactive());
  });
}

describe('DateInputComponent', () => {
  let fixture: ComponentFixture<DateTestComponent>;
  let hote: DateTestComponent;
  const champ = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;

  async function afficher(configurer?: (h: DateTestComponent) => void): Promise<void> {
    fixture = TestBed.createComponent(DateTestComponent);
    hote = fixture.componentInstance;
    configurer?.(hote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('utilise le sélecteur de date natif, nommé et relié à son libellé', async () => {
    await afficher();

    expect(champ().type).toBe('date');
    expect(champ().id).toBe('naissance');
    expect(champ().getAttribute('aria-label')).toBe('Date de naissance');
  });

  it('affiche la date du formulaire au format ISO attendu par le champ natif', async () => {
    await afficher((h) => h.modele.set({ naissance: new Date(1988, 2, 7) }));

    expect(champ().value).toBe('1988-03-07');
  });

  it('écrit une date à minuit, heure locale, sans décalage de fuseau', async () => {
    await afficher();

    champ().value = '2026-08-31';
    champ().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const date = hote.modele().naissance!;
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 7, 31, 0]);
  });

  it('vider le champ remet « aucune date »', async () => {
    await afficher((h) => h.modele.set({ naissance: new Date(2026, 0, 1) }));

    champ().value = '';
    champ().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(hote.modele().naissance).toBeNull();
  });

  it('suit une date écrite après coup par le formulaire', async () => {
    await afficher();

    hote.modele.set({ naissance: new Date(2000, 11, 25) });
    fixture.detectChanges();

    expect(champ().value).toBe('2000-12-25');
  });

  it('marque le champ « touché » en le quittant, ce qui révèle la règle « obligatoire »', async () => {
    await afficher();

    champ().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(hote.formulaire.naissance().touched()).toBe(true);
    expect(hote.formulaire.naissance().errors()[0].message).toBe('La date est obligatoire.');
  });

  it('se désactive avec le formulaire et prend le focus sur demande', async () => {
    await afficher();
    hote.formulaire.naissance().focusBoundControl();
    expect(document.activeElement).toBe(champ());

    hote.desactive.set(true);
    fixture.detectChanges();
    expect(champ().disabled).toBe(true);
  });
});
