import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';

import { PageTitleStrategy } from './page-title.strategy';

describe('PageTitleStrategy', () => {
  let titre: Title;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'employees', title: 'Employés', children: [{ path: 'new', children: [] }] },
          { path: 'sans-titre', children: [] }
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy }
      ]
    });
    titre = TestBed.inject(Title);
    router = TestBed.inject(Router);
  });

  it('suffixe le titre de la section par le nom du produit', async () => {
    await router.navigateByUrl('/employees');

    expect(titre.getTitle()).toBe('Employés · Staport RH');
  });

  it('garde le titre de la section pour ses écrans enfants', async () => {
    await router.navigateByUrl('/employees/new');

    expect(titre.getTitle()).toBe('Employés · Staport RH');
  });

  it("n'affiche que le nom du produit quand l'écran n'a pas de titre", async () => {
    await router.navigateByUrl('/sans-titre');

    expect(titre.getTitle()).toBe('Staport RH');
  });
});
