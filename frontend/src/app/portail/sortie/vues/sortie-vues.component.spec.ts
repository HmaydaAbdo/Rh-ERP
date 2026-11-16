import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { SortieService } from '../services/sortie.service';
import { SortieVuesComponent } from './sortie-vues.component';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

const VIDE = { periode: '2026-10', nombre: 0, parMotif: {}, sorties: [] };

describe('SortieVuesComponent', () => {
  async function monter(permissions: string[]): Promise<RouterTestingHarness> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'sorties',
            component: SortieVuesComponent,
            children: [
              { path: '', component: VueFactice },
              { path: 'cartes', component: VueFactice },
              { path: 'analytique', component: VueFactice }
            ]
          }
        ]),
        fournirPermissions(permissions).providers,
        { provide: SortieService, useValue: { sortiesDuMois: vi.fn().mockReturnValue(of(VIDE)), exporterPdf: vi.fn() } }
      ]
    });
    return RouterTestingHarness.create();
  }

  it('présente les trois vues dans le même sélecteur et conserve le mois et les filtres de l’URL', async () => {
    const harness = await monter(['EMPLOYEE_READ']);
    await harness.navigateByUrl('/sorties/cartes?periode=2026-09&valeurs=STC', SortieVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-vues__header h1')?.textContent).toBe('STC / Sortie');
    expect(Array.from(page.querySelectorAll('nav[aria-label="Vues des sorties"] a')).map((lien) => lien.getAttribute('href'))).toEqual([
      '/sorties?periode=2026-09&valeurs=STC',
      '/sorties/cartes?periode=2026-09&valeurs=STC',
      '/sorties/analytique?periode=2026-09&valeurs=STC'
    ]);
    expect(page.querySelector('app-mouvement-barre')).not.toBeNull();
  });

  it('applique le mois choisi à la vue courante', async () => {
    const harness = await monter(['EMPLOYEE_READ']);
    const composant = await harness.navigateByUrl('/sorties/analytique?periode=2026-09', SortieVuesComponent);

    composant['choisirMois']('2026-08');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/sorties/analytique?periode=2026-08');
  });

  it('cache l’export sans la permission EMPLOYEE_EXPORT et le montre avec', async () => {
    let harness = await monter(['EMPLOYEE_READ']);
    await harness.navigateByUrl('/sorties', SortieVuesComponent);
    expect((harness.routeNativeElement as HTMLElement).textContent).not.toContain('Exporter en PDF');

    TestBed.resetTestingModule();
    harness = await monter(['EMPLOYEE_READ', 'EMPLOYEE_EXPORT']);
    await harness.navigateByUrl('/sorties', SortieVuesComponent);
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Exporter en PDF');
  });
});
