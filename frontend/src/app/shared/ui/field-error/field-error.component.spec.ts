import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, maxLength, required } from '@angular/forms/signals';

import { FieldErrorComponent } from './field-error.component';

@Component({
  selector: 'app-champ-test',
  imports: [FormField, FieldErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input id="nom" [formField]="formulaire.nom" />
    <stp-field-error [field]="formulaire.nom" />
  `
})
class ChampTestComponent {
  readonly modele = signal({ nom: '' });
  readonly formulaire = form(this.modele, (chemin) => {
    required(chemin.nom, { message: 'Le nom est obligatoire.' });
    maxLength(chemin.nom, 5, { message: 'Le nom ne dépasse pas 5 caractères.' });
  });
}

describe('FieldErrorComponent', () => {
  function afficher() {
    const fixture = TestBed.createComponent(ChampTestComponent);
    fixture.detectChanges();
    return fixture;
  }

  const alerte = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.querySelector('[role="alert"]');

  it('ne dit rien d’un champ invalide tant qu’il n’a pas été touché', () => {
    const fixture = afficher();

    expect(alerte(fixture)).toBeNull();
  });

  it('annonce le message de la règle une fois le champ touché', () => {
    const fixture = afficher();

    fixture.componentInstance.formulaire.nom().markAsTouched();
    fixture.detectChanges();

    expect(alerte(fixture)?.textContent).toBe('Le nom est obligatoire.');
  });

  it('affiche le message de la règle en défaut quand il y en a plusieurs, puis disparaît quand le champ devient valide', () => {
    const fixture = afficher();
    const composant = fixture.componentInstance;
    composant.formulaire.nom().markAsTouched();
    composant.formulaire.nom().value.set('beaucoup trop long');
    fixture.detectChanges();
    expect(alerte(fixture)?.textContent).toBe('Le nom ne dépasse pas 5 caractères.');

    composant.formulaire.nom().value.set('Ali');
    fixture.detectChanges();

    expect(alerte(fixture)).toBeNull();
  });

  it('ne laisse pas d’élément visible sans erreur (pas d’écart dans la colonne du champ)', () => {
    const fixture = afficher();
    const hote = fixture.nativeElement.querySelector('stp-field-error') as HTMLElement;

    expect(hote.matches(':empty')).toBe(true);
    expect(getComputedStyle(hote).display).toBe('none');
  });
});
