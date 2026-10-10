import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, required } from '@angular/forms/signals';

import { DateInputComponent } from '../ui/date-input/date-input.component';
import { focaliserPremiereErreur } from './focus-first-error';

@Component({
  selector: 'app-formulaire-test',
  imports: [FormField, DateInputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form>
      <input id="a" [formField]="formulaire.a" />
      <input id="b" [formField]="formulaire.b" />
      <stp-date-input inputId="date" [formField]="formulaire.date" />
      <input id="c" [formField]="formulaire.c" />
    </form>
  `
})
class FormulaireTestComponent {
  readonly modele = signal<{ a: string; b: string; date: Date | null; c: string }>({ a: 'ok', b: '', date: null, c: '' });
  readonly formulaire = form(this.modele, (chemin) => {
    required(chemin.a);
    required(chemin.b);
    required(chemin.date);
    required(chemin.c);
  });
}

describe('focaliserPremiereErreur', () => {
  function afficher() {
    const fixture = TestBed.createComponent(FormulaireTestComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => document.body.querySelector('app-formulaire-test')?.remove());

  it('donne le focus au premier champ invalide', () => {
    const fixture = afficher();

    focaliserPremiereErreur(fixture.componentInstance.formulaire);

    expect(document.activeElement?.id).toBe('b');
  });

  it("donne le focus au champ interactif d'un champ composé", () => {
    const fixture = afficher();
    fixture.componentInstance.modele.update((m) => ({ ...m, b: 'ok' }));
    fixture.detectChanges();

    focaliserPremiereErreur(fixture.componentInstance.formulaire);

    expect(document.activeElement?.id).toBe('date');
  });

  it("ne fait rien quand aucun champ n'est invalide", () => {
    const fixture = afficher();
    fixture.componentInstance.modele.set({ a: 'ok', b: 'ok', date: new Date(2026, 0, 1), c: 'ok' });
    fixture.detectChanges();
    (document.activeElement as HTMLElement | null)?.blur();

    expect(() => focaliserPremiereErreur(fixture.componentInstance.formulaire)).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });
});
