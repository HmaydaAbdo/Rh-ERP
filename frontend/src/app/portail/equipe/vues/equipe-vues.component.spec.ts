import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EquipeVuesComponent } from './equipe-vues.component';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

describe('EquipeVuesComponent', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{
          path: 'equipes',
          component: EquipeVuesComponent,
          children: [
            { path: '', component: VueFactice },
            { path: 'cartes', component: VueFactice },
            { path: 'analytique', component: VueFactice }
          ]
        }]),
        fournirPermissions(['EQUIPE_READ', 'EQUIPE_WRITE']).providers
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('présente les trois vues dans le même sélecteur et conserve les filtres de l’URL', async () => {
    await harness.navigateByUrl('/equipes/cartes?code=CH&libelle=Chauffeurs', EquipeVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-vues__header h1')?.textContent).toBe('Équipes');
    expect(Array.from(page.querySelectorAll('nav[aria-label="Vues des équipes"] a')).map((lien) => lien.getAttribute('href'))).toEqual([
      '/equipes?code=CH&libelle=Chauffeurs',
      '/equipes/cartes?code=CH&libelle=Chauffeurs',
      '/equipes/analytique?code=CH&libelle=Chauffeurs'
    ]);
    expect(page.querySelector('app-equipe-filtres + router-outlet')).not.toBeNull();
  });

  it('affiche la création aux personnes autorisées et applique les filtres à la vue courante', async () => {
    const composant = await harness.navigateByUrl('/equipes?code=CH', EquipeVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('a[href="/equipes/new"]')?.textContent).toContain('Nouvelle équipe');
    composant['appliquer']({ code: 'OP', libelle: '' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/equipes?code=OP');
  });

  it('garde le périmètre, le mois et le regroupement des Cartes quand un filtre de la barre change', async () => {
    const composant = await harness.navigateByUrl('/equipes/cartes?equipeIds=5&periode=2026-08&par=chantier', EquipeVuesComponent);

    composant['appliquer']({ code: 'OP', libelle: '' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/equipes/cartes?equipeIds=5&periode=2026-08&par=chantier&code=OP');
  });

  it('ne montre pas la création sans EQUIPE_WRITE', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'equipes', component: EquipeVuesComponent, children: [{ path: '', component: VueFactice }] }]),
        fournirPermissions(['EQUIPE_READ']).providers
      ]
    });
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/equipes', EquipeVuesComponent);

    expect((harness.routeNativeElement as HTMLElement).querySelector('a[href="/equipes/new"]')).toBeNull();
  });
});
