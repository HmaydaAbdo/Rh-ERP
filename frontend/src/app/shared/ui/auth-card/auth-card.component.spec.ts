import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthCardComponent } from './auth-card.component';

@Component({
  imports: [AuthCardComponent],
  template: `<stp-auth-card titre="Bienvenue" description="Connectez-vous."><button type="button">Action</button></stp-auth-card>`
})
class HoteComponent {}

describe('AuthCardComponent', () => {
  it('affiche le titre, la description et le contenu projeté', async () => {
    const fixture = TestBed.createComponent(HoteComponent);
    await fixture.whenStable();
    const racine: HTMLElement = fixture.nativeElement;

    expect(racine.querySelector('h1')?.textContent).toBe('Bienvenue');
    expect(racine.querySelector('.auth-card__intro p')?.textContent).toBe('Connectez-vous.');
    expect(racine.querySelector('.auth-card button')?.textContent).toBe('Action');
  });

  it('nomme la région par son titre', async () => {
    const fixture = TestBed.createComponent(HoteComponent);
    await fixture.whenStable();
    const carte = (fixture.nativeElement as HTMLElement).querySelector('section') as HTMLElement;

    expect(carte.getAttribute('aria-labelledby')).toBe('auth-card-titre');
    expect(carte.querySelector('#auth-card-titre')?.textContent).toBe('Bienvenue');
  });
});
