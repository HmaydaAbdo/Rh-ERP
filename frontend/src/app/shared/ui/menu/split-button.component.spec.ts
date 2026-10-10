import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuAction } from './menu-button.component';
import { SplitButtonComponent } from './split-button.component';

@Component({
  selector: 'app-scinde-test',
  imports: [SplitButtonComponent],
  template: `<stp-split-button label="Importer" icon="upload" moreLabel="Autres actions d’import" [items]="actions" [disabled]="desactive()" (clicked)="clics.update((n) => n + 1)" />`
})
class ScindeTestComponent {
  readonly clics = signal(0);
  readonly desactive = signal(false);
  readonly modeles: string[] = [];
  readonly actions: MenuAction[] = [{ label: 'Télécharger le modèle Excel', icon: 'file-spreadsheet', command: () => this.modeles.push('modele') }];
}

describe('SplitButtonComponent', () => {
  let fixture: ComponentFixture<ScindeTestComponent>;
  let hote: ScindeTestComponent;
  const principal = () => fixture.nativeElement.querySelector('button.stp-button--join-next') as HTMLButtonElement;
  const suite = () => fixture.nativeElement.querySelector('stp-menu-button button') as HTMLButtonElement;

  async function afficher(): Promise<void> {
    fixture = TestBed.createComponent(ScindeTestComponent);
    hote = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('montre l’action principale et un second bouton, nommé, pour les autres actions', async () => {
    await afficher();

    expect(principal().textContent).toContain('Importer');
    expect(suite().getAttribute('aria-label')).toBe('Autres actions d’import');
  });

  it('le bouton principal émet `clicked`', async () => {
    await afficher();

    principal().click();

    expect(hote.clics()).toBe(1);
  });

  it('le menu propose les actions secondaires, sans déclencher l’action principale', async () => {
    await afficher();

    suite().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const entree = fixture.nativeElement.querySelector('[role="menuitem"]') as HTMLElement;
    entree.click();

    expect(entree.textContent).toContain('Télécharger le modèle Excel');
    expect(hote.modeles).toEqual(['modele']);
    expect(hote.clics()).toBe(0);
  });

  it('désactive les deux boutons ensemble', async () => {
    await afficher();

    hote.desactive.set(true);
    fixture.detectChanges();

    expect(principal().disabled).toBe(true);
    expect(suite().getAttribute('aria-disabled')).toBe('true');
  });
});
