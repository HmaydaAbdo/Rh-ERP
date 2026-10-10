import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { PaieVueSwitcherComponent } from './paie-vue-switcher.component';

@Component({ selector: 'app-vide', template: '' })
class VideComponent {}

describe('PaieVueSwitcherComponent', () => {
  async function afficher(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'paie', component: VideComponent },
          { path: 'paie/cartes', component: VideComponent },
          { path: 'paie/analytique', component: VideComponent }
        ])
      ]
    });
    const fixture = TestBed.createComponent(PaieVueSwitcherComponent);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    const liens = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    return { fixture, liens };
  }

  const actif = (liens: HTMLAnchorElement[]) => liens.filter((l) => l.classList.contains('vue-switcher__lien--active')).map((l) => l.textContent?.trim());

  it('propose les trois vues de la paie dans un repère de navigation nommé', async () => {
    const { fixture, liens } = await afficher('/paie');

    expect(fixture.nativeElement.querySelector('nav')?.getAttribute('aria-label')).toBe('Vue de la paie');
    expect(liens.map((l) => [l.textContent?.trim(), l.getAttribute('href')])).toEqual([
      ['Tabulaire', '/paie'],
      ['Cartes', '/paie/cartes'],
      ['Analytique', '/paie/analytique']
    ]);
  });

  it('met en avant la vue courante, et seulement elle', async () => {
    expect(actif((await afficher('/paie')).liens)).toEqual(['Tabulaire']);
    TestBed.resetTestingModule();
    expect(actif((await afficher('/paie/cartes')).liens)).toEqual(['Cartes']);
    TestBed.resetTestingModule();
    expect(actif((await afficher('/paie/analytique')).liens)).toEqual(['Analytique']);
  });
});
