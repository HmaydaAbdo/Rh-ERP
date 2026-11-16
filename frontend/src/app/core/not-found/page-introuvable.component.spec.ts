import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PageIntrouvableComponent } from './page-introuvable.component';

describe('PageIntrouvableComponent', () => {
  function afficher(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(PageIntrouvableComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('dit que l’adresse ne correspond à aucun écran', () => {
    const page = afficher();

    expect(page.querySelector('h1')?.textContent).toBe('Page introuvable');
    expect(page.textContent).toContain('ne correspond à aucun écran');
  });

  it('propose de revenir à l’accueil', () => {
    const lien = afficher().querySelector('a') as HTMLAnchorElement;

    expect(lien.getAttribute('href')).toBe('/');
    expect(lien.textContent).toContain("Retour à l'accueil");
  });
});
