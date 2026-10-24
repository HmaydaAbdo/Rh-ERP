import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { ChantierVuesComponent } from './chantier-vues.component';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

describe('ChantierVuesComponent', () => {
  let harness: RouterTestingHarness;

  function configurer(permissions: string[]): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{
          path: 'chantiers',
          component: ChantierVuesComponent,
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
    configurer(['CHANTIER_READ', 'CHANTIER_WRITE', 'CHANTIER_SYNC']);
    harness = await RouterTestingHarness.create();
  });

  it('présente les trois vues dans le même sélecteur et conserve les filtres de l’URL', async () => {
    await harness.navigateByUrl('/chantiers/cartes?code=C1&designation=route&actif=false', ChantierVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-vues__header h1')?.textContent).toBe('Chantiers');
    expect(Array.from(page.querySelectorAll('nav[aria-label="Vues des chantiers"] a')).map((lien) => lien.getAttribute('href'))).toEqual([
      '/chantiers?code=C1&designation=route&actif=false',
      '/chantiers/cartes?code=C1&designation=route&actif=false',
      '/chantiers/analytique?code=C1&designation=route&actif=false'
    ]);
    expect(page.querySelector('app-chantier-filtres')).not.toBeNull();
    expect(page.querySelector('app-collection-shell router-outlet')).not.toBeNull();
  });

  it('affiche les actions aux personnes autorisées et applique les filtres à la vue courante', async () => {
    const composant = await harness.navigateByUrl('/chantiers?code=C1', ChantierVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('a[href="/chantiers/new"]')?.textContent).toContain('Nouveau chantier');
    expect(page.textContent).toContain('Synchroniser maintenant');
    composant['appliquer']({ code: 'C2', designation: '', actif: true });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/chantiers?code=C2&actif=true');
  });

  it('garde le périmètre et le mois des Cartes quand un filtre de la barre change', async () => {
    const composant = await harness.navigateByUrl('/chantiers/cartes?chantierIds=1&periode=2026-08', ChantierVuesComponent);

    composant['appliquer']({ code: 'C2', designation: '', actif: null });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/chantiers/cartes?chantierIds=1&periode=2026-08&code=C2');
  });

  it('ne montre ni création ni synchronisation sans les droits', async () => {
    TestBed.resetTestingModule();
    configurer(['CHANTIER_READ']);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/chantiers', ChantierVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('a[href="/chantiers/new"]')).toBeNull();
    expect(page.textContent).not.toContain('Synchroniser');
  });
});
