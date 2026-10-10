import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AccessDeniedComponent } from './access-denied.component';

describe('AccessDeniedComponent', () => {
  function afficher(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(AccessDeniedComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('dit à l’utilisateur qu’il n’a pas accès à l’écran et à qui s’adresser', () => {
    const page = afficher();

    expect(page.querySelector('h1')?.textContent).toBe('Accès refusé');
    expect(page.textContent).toContain('Contactez un administrateur');
  });

  it('propose de revenir à l’accueil', () => {
    const lien = afficher().querySelector('a') as HTMLAnchorElement;

    expect(lien.getAttribute('href')).toBe('/');
    expect(lien.textContent).toContain('Retour à l’accueil'.replace('’', "'"));
  });
});
