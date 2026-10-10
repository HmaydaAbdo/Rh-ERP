import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ButtonComponent, ButtonVariant } from './button.directive';

@Component({
  selector: 'app-bouton-test',
  imports: [ButtonComponent],
  template: `
    <button id="b" stp-button [variant]="variant()" [icon]="icone()" [loading]="chargement()" [iconOnly]="seule()" (click)="clics.update((n) => n + 1)">
      Enregistrer
    </button>
    <a id="a" stp-button variant="secondary" href="/ailleurs">Lien</a>
  `
})
class BoutonTestComponent {
  readonly variant = signal<ButtonVariant>('primary');
  readonly icone = signal<string | null>(null);
  readonly chargement = signal(false);
  readonly seule = signal(false);
  readonly clics = signal(0);
}

describe('ButtonComponent', () => {
  function afficher() {
    const fixture = TestBed.createComponent(BoutonTestComponent);
    fixture.detectChanges();
    const bouton = fixture.nativeElement.querySelector('#b') as HTMLButtonElement;
    return { fixture, hote: fixture.componentInstance, bouton };
  }

  it('habille un vrai <button> selon sa variante', () => {
    const { fixture, hote, bouton } = afficher();
    expect(bouton.className).toContain('stp-button--primary');

    for (const variante of ['secondary', 'text', 'danger', 'danger-text'] as const) {
      hote.variant.set(variante);
      fixture.detectChanges();
      expect(bouton.className).toContain(`stp-button--${variante}`);
    }
    expect(bouton.tagName).toBe('BUTTON');
  });

  it('habille aussi un lien', () => {
    const { fixture } = afficher();
    const lien = fixture.nativeElement.querySelector('#a') as HTMLAnchorElement;

    expect(lien.className).toContain('stp-button--secondary');
    expect(lien.getAttribute('href')).toBe('/ailleurs');
  });

  it('affiche l’icône demandée avant le libellé', () => {
    const { fixture, hote, bouton } = afficher();
    expect(bouton.querySelector('stp-icon')).toBeNull();

    hote.icone.set('download');
    fixture.detectChanges();

    expect(bouton.querySelector('stp-icon svg')).not.toBeNull();
    expect(bouton.textContent).toContain('Enregistrer');
  });

  it('marque un bouton sans libellé (icône seule)', () => {
    const { fixture, hote, bouton } = afficher();

    hote.seule.set(true);
    fixture.detectChanges();

    expect(bouton.className).toContain('stp-button--icon-only');
  });

  it('en chargement : annonce l’état, remplace l’icône par un indicateur et ignore le clic sans quitter le parcours clavier', () => {
    const { fixture, hote, bouton } = afficher();
    hote.icone.set('download');
    bouton.click();
    expect(hote.clics()).toBe(1);

    hote.chargement.set(true);
    fixture.detectChanges();
    bouton.click();

    expect(hote.clics()).toBe(1);
    expect(bouton.getAttribute('aria-busy')).toBe('true');
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
    expect(bouton.disabled).toBe(false);
    expect(bouton.querySelector('stp-icon')?.classList).toContain('stp-spin');

    hote.chargement.set(false);
    fixture.detectChanges();
    expect(bouton.hasAttribute('aria-busy')).toBe(false);
    bouton.click();
    expect(hote.clics()).toBe(2);
  });
});
