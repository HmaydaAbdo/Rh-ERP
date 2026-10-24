import type { MockedObject } from 'vitest';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { ThemeService } from '../../../core/theme/theme.service';
import { ChartComponent } from '../../../shared/ui/chart/chart.component';
import { PaieAnalytique } from '../../paie/models/paie.model';
import { PaieService } from '../../paie/services/paie.service';
import { EquipeQualiteComponent } from './equipe-qualite.component';

const ANALYSE: PaieAnalytique = {
  periode: '2026-08',
  kpis: { masse: 10000, effectif: 12, coutMoyen: 833.33, nombreChantiers: 2, stc: 1, stcMontant: 1200 },
  moisPrecedent: null,
  parChantier: [],
  parEquipe: [],
  parFonction: [],
  tranches: [],
  evolution: [],
  qualite: { sansEquipe: 2, sansObservation: 0 }
};

@Component({
  standalone: true,
  imports: [EquipeQualiteComponent],
  template: '<app-equipe-qualite />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
class HoteQualiteComponent {}

describe('EquipeQualiteComponent', () => {
  let paie: MockedObject<PaieService>;
  let harness: RouterTestingHarness;
  let autorisePaie: boolean;

  async function ouvrir(url = '/equipes'): Promise<HTMLElement> {
    await harness.navigateByUrl(url, HoteQualiteComponent);
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    return harness.routeNativeElement as HTMLElement;
  }

  beforeEach(async () => {
    autorisePaie = true;
    paie = {
      listerPeriodes: vi.fn().mockReturnValue(of([{ periode: '2026-08', nombreBulletins: 12, nombreChantiers: 2, masse: 10000, stc: 1, stcMontant: 1200 }])),
      analyser: vi.fn().mockReturnValue(of(ANALYSE))
    } as unknown as MockedObject<PaieService>;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'equipes', component: HoteQualiteComponent }]),
        { provide: PaieService, useValue: paie },
        { provide: AuthService, useValue: { hasPermission: () => autorisePaie } },
        { provide: ThemeService, useValue: { theme: signal('light') } }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('affiche le graphique de qualité et les orphelins avec la paie du dernier mois', async () => {
    const page = await ouvrir();
    const graphique = harness.fixture.debugElement.query(By.directive(ChartComponent)).componentInstance as ChartComponent<'bar'>;

    expect(page.textContent).toContain('août 2026');
    expect(page.textContent).toContain('2 bulletins orphelins');
    expect(page.textContent).toContain('10 bulletins avec équipe');
    expect(graphique.data().datasets.map((dataset) => dataset.data)).toEqual([[10], [2]]);
    expect(page.querySelector('button[aria-label="Exporter la qualité du rattachement des bulletins en PDF"]')).not.toBeNull();
    expect(paie.analyser).toHaveBeenCalledWith({ periode: '2026-08', chantierIds: undefined, equipeIds: undefined, fonctionIds: undefined });
  });

  it('masque le graphique et le compteur quand aucun bulletin orphelin n’existe', async () => {
    paie.analyser.mockReturnValue(of({ ...ANALYSE, qualite: { sansEquipe: 0, sansObservation: 0 } }));
    const page = await ouvrir();

    expect(page.querySelector('[aria-label="Qualité des données de paie Équipe"]')).toBeNull();
    expect(page.querySelector('stp-chart')).toBeNull();
  });

  it('respecte le filtre Orphelins transmis par les Cartes', async () => {
    const page = await ouvrir('/equipes?equipeIds=0&chantierIds=7');

    expect(page.textContent).toContain('2 bulletins orphelins');
    expect(paie.analyser).toHaveBeenCalledWith({ periode: '2026-08', chantierIds: [7], equipeIds: [0], fonctionIds: undefined });
  });

  it('ne lit pas la paie sans permission PAIE_READ', async () => {
    autorisePaie = false;
    const page = await ouvrir();

    expect(page.querySelector('stp-chart')).toBeNull();
    expect(paie.listerPeriodes).not.toHaveBeenCalled();
    expect(paie.analyser).not.toHaveBeenCalled();
  });
});
