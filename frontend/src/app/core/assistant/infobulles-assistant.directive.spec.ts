import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { InfobullesAssistantDirective } from './infobulles-assistant.directive';

@Component({
  imports: [InfobullesAssistantDirective],
  template: `<div appInfobulles>
    <button id="a" aria-label="Ajouter un fichier"></button>
    <button id="b" aria-label="Envoyer" title="Envoyer le message"></button>
    <button id="c">Sans nom</button>
  </div>`
})
class HoteComponent {}

describe('InfobullesAssistantDirective', () => {
  it('donne le nom accessible en infobulle sans écraser un title existant', () => {
    const fixture = TestBed.createComponent(HoteComponent);
    fixture.detectChanges();
    const racine: HTMLElement = fixture.nativeElement;

    expect(racine.querySelector('#a')?.getAttribute('title')).toBe('Ajouter un fichier');
    expect(racine.querySelector('#b')?.getAttribute('title')).toBe('Envoyer le message');
    expect(racine.querySelector('#c')?.hasAttribute('title')).toBe(false);
  });

  it('couvre les boutons ajoutés plus tard par la bibliothèque', async () => {
    const fixture = TestBed.createComponent(HoteComponent);
    fixture.detectChanges();
    const conteneur = (fixture.nativeElement as HTMLElement).querySelector('div') as HTMLElement;
    conteneur.insertAdjacentHTML('beforeend', '<span><button id="d" aria-label="Dicter"></button></span>');

    await new Promise((resolve) => setTimeout(resolve));

    expect(conteneur.querySelector('#d')?.getAttribute('title')).toBe('Dicter');
  });
});
