import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuAction, MenuButtonComponent } from './menu-button.component';

@Component({
  selector: 'app-menu-test',
  imports: [MenuButtonComponent],
  template: `<stp-menu-button [label]="libelle()" [ariaLabel]="nom()" icon="ellipsis" [items]="actions()" [disabled]="desactive()" />`
})
class MenuTestComponent {
  readonly appels: string[] = [];
  readonly libelle = signal<string | null>('Actions');
  readonly nom = signal<string | null>(null);
  readonly desactive = signal(false);
  readonly actions = signal<MenuAction[]>([
    { label: 'Télécharger le modèle', icon: 'download', command: () => this.appels.push('modele') },
    { label: 'Supprimer', icon: 'trash-2', command: () => this.appels.push('supprimer') },
    { label: 'Verrouillée', disabled: true, command: () => this.appels.push('verrouillee') }
  ]);
}

describe('MenuButtonComponent', () => {
  let fixture: ComponentFixture<MenuTestComponent>;
  let hote: MenuTestComponent;
  const declencheur = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  const menu = () => fixture.nativeElement.querySelector('[role="menu"]') as HTMLElement;
  const entrees = () => Array.from(fixture.nativeElement.querySelectorAll('[role="menuitem"]')) as HTMLElement[];

  async function afficher(configurer?: (h: MenuTestComponent) => void): Promise<void> {
    fixture = TestBed.createComponent(MenuTestComponent);
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

  it('montre le libellé du bouton et un menu fermé', async () => {
    await afficher();

    expect(declencheur().textContent).toContain('Actions');
    expect(declencheur().getAttribute('aria-haspopup')).toBe('true');
    expect(declencheur().getAttribute('aria-expanded')).toBe('false');
    expect(entrees()).toEqual([]);
  });

  it('s’ouvre au clic sur le bouton et liste ses actions comme des éléments de menu', async () => {
    await afficher();

    await ouvrir();

    expect(declencheur().getAttribute('aria-expanded')).toBe('true');
    expect(menu().getAttribute('data-visible')).toBe('true');
    expect(entrees().map((e) => e.textContent?.trim())).toEqual(['Télécharger le modèle', 'Supprimer', 'Verrouillée']);
  });

  it('exécute l’action choisie', async () => {
    await afficher();
    await ouvrir();

    entrees()[1].click();
    fixture.detectChanges();

    expect(hote.appels).toEqual(['supprimer']);
  });

  it('n’exécute pas une action désactivée et l’annonce comme telle', async () => {
    await afficher();
    await ouvrir();

    expect(entrees()[2].getAttribute('aria-disabled')).toBe('true');
    entrees()[2].click();
    fixture.detectChanges();

    expect(hote.appels).toEqual([]);
  });

  it('sans libellé, c’est un bouton icône nommé par `ariaLabel`', async () => {
    await afficher((h) => {
      h.libelle.set(null);
      h.nom.set('Autres actions');
    });

    expect(declencheur().getAttribute('aria-label')).toBe('Autres actions');
    expect(declencheur().className).toContain('stp-button--icon-only');
  });

  it('ne s’ouvre pas quand il est désactivé', async () => {
    await afficher((h) => h.desactive.set(true));

    expect(declencheur().getAttribute('aria-disabled')).toBe('true');
    declencheur().click();
    fixture.detectChanges();
    expect(entrees()).toEqual([]);
  });
});
