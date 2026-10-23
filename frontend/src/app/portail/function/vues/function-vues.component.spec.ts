import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { FunctionVuesComponent } from './function-vues.component';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

describe('FunctionVuesComponent', () => {
  let harness: RouterTestingHarness;

  function configurer(permissions: string[]): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{
          path: 'functions',
          component: FunctionVuesComponent,
          children: [
            { path: '', component: VueFactice },
            { path: 'cartes', component: VueFactice },
            { path: 'analytique', component: VueFactice }
          ]
        }]),
        fournirPermissions(permissions).providers
      ]
    });
  }

  beforeEach(async () => {
    configurer(['FUNCTION_READ', 'FUNCTION_WRITE']);
    harness = await RouterTestingHarness.create();
  });

  it('présente les trois vues dans le même sélecteur et conserve le filtre de l’URL', async () => {
    await harness.navigateByUrl('/functions/cartes?libelle=CHEF', FunctionVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-vues__header h1')?.textContent).toBe('Fonctions');
    expect(Array.from(page.querySelectorAll('nav[aria-label="Vues des fonctions"] a')).map((lien) => lien.getAttribute('href'))).toEqual([
      '/functions?libelle=CHEF',
      '/functions/cartes?libelle=CHEF',
      '/functions/analytique?libelle=CHEF'
    ]);
    expect(page.querySelector('app-function-filtres')).not.toBeNull();
    expect(page.querySelector('app-collection-shell router-outlet')).not.toBeNull();
  });

  it('affiche la création aux personnes autorisées et applique le filtre à la vue courante', async () => {
    const composant = await harness.navigateByUrl('/functions?libelle=CHEF', FunctionVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('a[href="/functions/new"]')?.textContent).toContain('Nouvelle fonction');
    composant['appliquer']({ libelle: 'OP' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/functions?libelle=OP');
  });

  it('garde le périmètre, le mois et le regroupement des Cartes quand le filtre de la barre change', async () => {
    const composant = await harness.navigateByUrl('/functions/cartes?fonctionIds=7&periode=2026-08&par=equipe', FunctionVuesComponent);

    composant['appliquer']({ libelle: 'OP' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/functions/cartes?fonctionIds=7&periode=2026-08&par=equipe&libelle=OP');
  });

  it('ne montre pas la création sans FUNCTION_WRITE', async () => {
    TestBed.resetTestingModule();
    configurer(['FUNCTION_READ']);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/functions', FunctionVuesComponent);

    expect((harness.routeNativeElement as HTMLElement).querySelector('a[href="/functions/new"]')).toBeNull();
  });
});
