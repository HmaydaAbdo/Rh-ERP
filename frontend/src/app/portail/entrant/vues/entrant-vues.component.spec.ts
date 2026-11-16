import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EntrantService } from '../services/entrant.service';
import { EntrantVuesComponent } from './entrant-vues.component';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

const VIDE = { periode: '2026-10', comparable: true, nombre: 0, nouvellesEmbauches: 0, retours: 0, entrants: [] };

describe('EntrantVuesComponent', () => {
  async function monter(permissions: string[]): Promise<RouterTestingHarness> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'entrants',
            component: EntrantVuesComponent,
            children: [
              { path: '', component: VueFactice },
              { path: 'cartes', component: VueFactice },
              { path: 'analytique', component: VueFactice }
            ]
          }
        ]),
        fournirPermissions(permissions).providers,
        { provide: EntrantService, useValue: { entrantsDuMois: vi.fn().mockReturnValue(of(VIDE)), exporterPdf: vi.fn() } }
      ]
    });
    return RouterTestingHarness.create();
  }

  it('présente les trois vues dans le même sélecteur et conserve le mois et les filtres de l’URL', async () => {
    const harness = await monter(['EMPLOYEE_READ']);
    await harness.navigateByUrl('/entrants/cartes?periode=2026-09&valeurs=RETOUR', EntrantVuesComponent);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('.app-vues__header h1')?.textContent).toBe('Entrants');
    expect(Array.from(page.querySelectorAll('nav[aria-label="Vues des entrants"] a')).map((lien) => lien.getAttribute('href'))).toEqual([
      '/entrants?periode=2026-09&valeurs=RETOUR',
      '/entrants/cartes?periode=2026-09&valeurs=RETOUR',
      '/entrants/analytique?periode=2026-09&valeurs=RETOUR'
    ]);
    expect(page.querySelector('app-mouvement-barre')).not.toBeNull();
  });

  it('applique le mois choisi à la vue courante', async () => {
    const harness = await monter(['EMPLOYEE_READ']);
    const composant = await harness.navigateByUrl('/entrants/analytique?periode=2026-09', EntrantVuesComponent);

    composant['choisirMois']('2026-08');
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/entrants/analytique?periode=2026-08');
  });

  it('cache l’export sans la permission EMPLOYEE_EXPORT et le montre avec', async () => {
    let harness = await monter(['EMPLOYEE_READ']);
    await harness.navigateByUrl('/entrants', EntrantVuesComponent);
    expect((harness.routeNativeElement as HTMLElement).textContent).not.toContain('Exporter en PDF');

    TestBed.resetTestingModule();
    harness = await monter(['EMPLOYEE_READ', 'EMPLOYEE_EXPORT']);
    await harness.navigateByUrl('/entrants', EntrantVuesComponent);
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Exporter en PDF');
  });
});
