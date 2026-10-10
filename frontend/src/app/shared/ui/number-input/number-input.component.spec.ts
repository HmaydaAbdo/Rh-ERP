import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { disabled, form, FormField, max, min, required } from '@angular/forms/signals';

import { NumberInputComponent } from './number-input.component';

@Component({
  selector: 'app-minimum-seul-test',
  imports: [NumberInputComponent, FormField],
  template: `<stp-number-input inputId="quantite" [formField]="formulaire.quantite" />`
})
class MinimumSeulTestComponent {
  readonly modele = signal<{ quantite: number | null }>({ quantite: null });
  readonly formulaire = form(this.modele, (chemin) => min(chemin.quantite, 0));
}

@Component({
  selector: 'app-nombre-test',
  imports: [NumberInputComponent, FormField],
  template: `<stp-number-input inputId="montant" ariaLabel="Montant" [formField]="formulaire.montant" [minFractionDigits]="decimales()" [maxFractionDigits]="maxDecimales()" />`
})
class NombreTestComponent {
  readonly modele = signal<{ montant: number | null }>({ montant: null });
  readonly decimales = signal(0);
  readonly maxDecimales = signal<number | null>(null);
  readonly desactive = signal(false);
  readonly formulaire = form(this.modele, (chemin) => {
    required(chemin.montant, { message: 'Le montant est obligatoire.' });
    min(chemin.montant, 0, { message: 'Positif.' });
    max(chemin.montant, 10000);
    disabled(chemin.montant, () => this.desactive());
  });
}

describe('NumberInputComponent', () => {
  let fixture: ComponentFixture<NombreTestComponent>;
  let hote: NombreTestComponent;
  const champ = () => fixture.nativeElement.querySelector('input') as HTMLInputElement;

  async function afficher(configurer?: (h: NombreTestComponent) => void): Promise<void> {
    fixture = TestBed.createComponent(NombreTestComponent);
    hote = fixture.componentInstance;
    configurer?.(hote);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function taper(texte: string): Promise<void> {
    champ().dispatchEvent(new Event('focus'));
    champ().value = texte;
    champ().dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function quitter(): Promise<void> {
    champ().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('relie le champ à son libellé par l’identifiant demandé, avec un clavier numérique', async () => {
    await afficher();

    expect(champ().id).toBe('montant');
    expect(champ().getAttribute('inputmode')).toBe('decimal');
    expect(champ().getAttribute('aria-label')).toBe('Montant');
  });

  it('n’attribue pas d’identifiant quand aucun n’est demandé', async () => {
    const seul = TestBed.createComponent(NumberInputComponent);
    seul.detectChanges();

    expect(seul.nativeElement.querySelector('input').hasAttribute('id')).toBe(false);
  });

  it('affiche la valeur du formulaire au format français', async () => {
    await afficher((h) => {
      h.decimales.set(2);
      h.modele.set({ montant: 1234.5 });
    });

    expect(champ().value.replace(/\s/g, ' ')).toBe('1 234,50');
  });

  it('reformate une valeur écrite après coup (chargement d’un enregistrement)', async () => {
    await afficher((h) => h.decimales.set(2));

    hote.modele.set({ montant: 5500 });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(champ().value.replace(/\s/g, ' ')).toBe('5 500,00');
  });

  it('écrit un nombre dans le formulaire à la frappe, avec la virgule française', async () => {
    await afficher();

    await taper('12,75');

    expect(hote.modele().montant).toBe(12.75);
  });

  it('accepte les espaces de milliers (normaux, insécables, fines)', async () => {
    await afficher();

    await taper('1 234 567');

    expect(hote.modele().montant).toBe(1234567);
  });

  it('laisse le texte brut pendant la saisie, le met en forme en quittant le champ', async () => {
    await afficher((h) => h.decimales.set(2));

    await taper('1234,5');
    expect(champ().value).toBe('1234,5');

    await quitter();
    expect(champ().value.replace(/\s/g, ' ')).toBe('1 234,50');
  });

  it('une saisie vide ou illisible vaut « aucune valeur »', async () => {
    await afficher((h) => h.modele.set({ montant: 8 }));

    await taper('');
    expect(hote.modele().montant).toBeNull();

    await taper('abc');
    expect(hote.modele().montant).toBeNull();
  });

  it('revient à la borne minimale en quittant le champ, et affiche la valeur bornée', async () => {
    await afficher((h) => h.modele.set({ montant: 3 }));

    await taper('-5');
    await quitter();

    expect(hote.modele().montant).toBe(0);
    expect(champ().value).toBe('0');
  });

  it('une borne minimale seule suffit : une valeur sous le minimum y est ramenée', async () => {
    const seul = TestBed.createComponent(MinimumSeulTestComponent);
    seul.detectChanges();
    await seul.whenStable();
    seul.detectChanges();
    const saisie = seul.nativeElement.querySelector('input') as HTMLInputElement;

    saisie.dispatchEvent(new Event('focus'));
    saisie.value = '-50';
    saisie.dispatchEvent(new Event('input', { bubbles: true }));
    saisie.dispatchEvent(new Event('blur'));
    seul.detectChanges();

    expect(seul.componentInstance.modele().quantite).toBe(0);
    expect(saisie.value).toBe('0');
  });

  it('plafonne à la borne maximale en quittant le champ', async () => {
    await afficher();

    await taper('99999');
    await quitter();

    expect(hote.modele().montant).toBe(10000);
  });

  it('limite le nombre de décimales affichées', async () => {
    await afficher((h) => {
      h.maxDecimales.set(2);
      h.modele.set({ montant: 3.14159 });
    });

    expect(champ().value).toBe('3,14');
  });

  it('marque le champ « touché » en le quittant, ce qui révèle la règle « obligatoire »', async () => {
    await afficher();
    expect(hote.formulaire.montant().touched()).toBe(false);

    await quitter();

    expect(hote.formulaire.montant().touched()).toBe(true);
    expect(hote.formulaire.montant().errors()[0].message).toBe('Le montant est obligatoire.');
  });

  it('se désactive avec le formulaire', async () => {
    await afficher((h) => h.desactive.set(true));

    expect(champ().disabled).toBe(true);
  });

  it('donne le focus au champ', async () => {
    await afficher();

    hote.formulaire.montant().focusBoundControl();

    expect(document.activeElement).toBe(champ());
  });
});
