import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DialogComponent } from './dialog.component';

@Component({
  selector: 'app-dialogue-test',
  imports: [DialogComponent],
  template: `
    <button id="declencheur" type="button" (click)="ouvert.set(true)">Ouvrir</button>
    <stp-dialog header="Résultat de l'import" width="520px" [placement]="placement()" [closable]="fermable()" [(open)]="ouvert" (closed)="fermetures.update((n) => n + 1)">
      <p id="contenu">Corps du dialogue</p>
      <div stpDialogFooter><button id="pied" type="button">Valider</button></div>
    </stp-dialog>
  `
})
class DialogueTestComponent {
  readonly ouvert = signal(false);
  readonly fermable = signal(true);
  readonly placement = signal<'center' | 'end'>('center');
  readonly fermetures = signal(0);
}

describe('DialogComponent', () => {
  const panneau = () => document.querySelector('.cdk-overlay-container [role="dialog"]') as HTMLElement | null;

  function afficher() {
    const fixture = TestBed.createComponent(DialogueTestComponent);
    fixture.detectChanges();
    return fixture;
  }

  async function ouvrir(fixture: ReturnType<typeof afficher>) {
    fixture.componentInstance.ouvert.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  it('ne montre rien tant qu’il est fermé', () => {
    afficher();

    expect(panneau()).toBeNull();
  });

  it('s’ouvre en dialogue modal nommé par son titre, avec son contenu et son pied', async () => {
    const fixture = afficher();
    await ouvrir(fixture);

    const dialogue = panneau()!;
    expect(dialogue).not.toBeNull();
    expect(dialogue.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialogue.getAttribute('aria-labelledby')!)?.textContent).toBe("Résultat de l'import");
    expect(dialogue.querySelector('#contenu')?.textContent).toBe('Corps du dialogue');
    expect(dialogue.querySelector('.stp-dialog__footer #pied')).not.toBeNull();
    expect(dialogue.style.width).toBe('520px');
  });

  it('se ferme par le bouton « Fermer » et prévient (closed)', async () => {
    const fixture = afficher();
    await ouvrir(fixture);

    (panneau()!.querySelector('button[aria-label="Fermer"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.ouvert()).toBe(false);
    expect(panneau()).toBeNull();
    expect(fixture.componentInstance.fermetures()).toBe(1);
  });

  it('se ferme avec Échap', async () => {
    const fixture = afficher();
    await ouvrir(fixture);

    panneau()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.ouvert()).toBe(false);
  });

  it('ne se ferme pas par un clic sur le fond (la saisie serait perdue)', async () => {
    const fixture = afficher();
    await ouvrir(fixture);

    (document.querySelector('.stp-dialog-backdrop') as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.ouvert()).toBe(true);
  });

  it('piège le focus dans le dialogue dès l’ouverture', async () => {
    const fixture = afficher();
    await ouvrir(fixture);
    await new Promise((resolve) => setTimeout(resolve));

    expect(panneau()!.contains(document.activeElement)).toBe(true);
  });

  it('non fermable : ni bouton « Fermer » ni Échap (génération en cours)', async () => {
    const fixture = afficher();
    fixture.componentInstance.fermable.set(false);
    await ouvrir(fixture);

    expect(panneau()!.querySelector('button[aria-label="Fermer"]')).toBeNull();
    panneau()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.ouvert()).toBe(true);
  });

  it('se pose en tiroir au bord droit pour `placement="end"`', async () => {
    const fixture = afficher();
    fixture.componentInstance.placement.set('end');
    await ouvrir(fixture);

    expect(panneau()!.classList).toContain('stp-dialog--drawer');
  });

  it('peut être rouvert après une fermeture', async () => {
    const fixture = afficher();
    await ouvrir(fixture);
    fixture.componentInstance.ouvert.set(false);
    fixture.detectChanges();
    expect(panneau()).toBeNull();

    await ouvrir(fixture);

    expect(panneau()).not.toBeNull();
  });
});
