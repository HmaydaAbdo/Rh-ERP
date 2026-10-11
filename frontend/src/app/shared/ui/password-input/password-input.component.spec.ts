import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { disabled, form, FormField, required } from '@angular/forms/signals';

import { PolitiqueMotDePasseService } from '../../validators/politique-mot-de-passe.service';
import { motDePasseConforme } from '../../validators/mot-de-passe.validator';
import { PasswordInputComponent } from './password-input.component';

@Component({
  selector: 'app-mdp-test',
  imports: [PasswordInputComponent, FormField],
  template: `<stp-password-input inputId="mdp" autocomplete="new-password" ariaLabel="Mot de passe" [formField]="formulaire.motDePasse" />`
})
class MotDePasseTestComponent {
  readonly modele = signal({ motDePasse: '' });
  readonly desactive = signal(false);
  readonly formulaire = form(this.modele, (chemin) => {
    required(chemin.motDePasse, { message: 'Obligatoire.' });
    motDePasseConforme(chemin.motDePasse);
    disabled(chemin.motDePasse, () => this.desactive());
  });
}

describe('PasswordInputComponent', () => {
  let fixture: ComponentFixture<MotDePasseTestComponent>;
  let hote: MotDePasseTestComponent;
  const champ = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;
  const bascule = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: PolitiqueMotDePasseService, useValue: { longueurMinimale: () => 10, regle: () => '10 caractères minimum, avec au moins une lettre et un chiffre, différent de l’identifiant.' } }] });
  });

  async function afficher(configurer?: (h: MotDePasseTestComponent) => void): Promise<void> {
    fixture = TestBed.createComponent(MotDePasseTestComponent);
    hote = fixture.componentInstance;
    configurer?.(hote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function taper(texte: string): void {
    champ().value = texte;
    champ().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  it('masque la saisie et transmet l’aide à la saisie du navigateur', async () => {
    await afficher();

    expect(champ().type).toBe('password');
    expect(champ().id).toBe('mdp');
    expect(champ().getAttribute('autocomplete')).toBe('new-password');
    expect(champ().getAttribute('aria-label')).toBe('Mot de passe');
  });

  it('écrit ce que l’on tape dans le formulaire', async () => {
    await afficher();

    taper('Secret2026!');

    expect(hote.modele().motDePasse).toBe('Secret2026!');
  });

  it('affiche la valeur écrite par le formulaire', async () => {
    await afficher((h) => h.modele.set({ motDePasse: 'DejaSaisi1234' }));

    expect(champ().value).toBe('DejaSaisi1234');
  });

  it('affiche puis masque le mot de passe, en annonçant l’état, sans perdre la valeur', async () => {
    await afficher();
    taper('Secret2026!');

    bascule().click();
    fixture.detectChanges();
    expect(champ().type).toBe('text');
    expect(bascule().getAttribute('aria-pressed')).toBe('true');
    expect(bascule().getAttribute('aria-label')).toBe('Masquer le mot de passe');
    expect(champ().value).toBe('Secret2026!');

    bascule().click();
    fixture.detectChanges();
    expect(champ().type).toBe('password');
    expect(bascule().getAttribute('aria-label')).toBe('Afficher le mot de passe');
  });

  it('applique la règle de mot de passe du formulaire', async () => {
    await afficher();

    taper('court');
    expect(hote.formulaire.motDePasse().errors()[0].kind).toBe('motDePasse');

    taper('assezlong1');
    expect(hote.formulaire.motDePasse().valid()).toBe(true);
  });

  it('marque le champ « touché » en le quittant', async () => {
    await afficher();

    champ().dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(hote.formulaire.motDePasse().touched()).toBe(true);
  });

  it('désactive le champ et sa bascule avec le formulaire', async () => {
    await afficher((h) => h.desactive.set(true));

    expect(champ().disabled).toBe(true);
    expect(bascule().disabled).toBe(true);
  });

  it('donne le focus au champ', async () => {
    await afficher();

    hote.formulaire.motDePasse().focusBoundControl();

    expect(document.activeElement).toBe(champ());
  });
});
