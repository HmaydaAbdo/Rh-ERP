import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AUCUN_FILTRE } from '../filtres/paie-filtres';
import { PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieVuesComponent } from './paie-vues.component';

@Component({ standalone: true, template: 'vue' })
class VueFactice {}

const PERIODES: PaiePeriodeResume[] = [
  { periode: '2026-08', nombreBulletins: 10, nombreChantiers: 2, masse: 40000, stc: 1 },
  { periode: '2026-07', nombreBulletins: 8, nombreChantiers: 2, masse: 32000, stc: 0 }
];

describe('PaieVuesComponent', () => {
  let service: jasmine.SpyObj<PaieService>;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    service = jasmine.createSpyObj<PaieService>('PaieService', ['listerPeriodes', 'rechercherChantiers']);
    service.listerPeriodes.and.returnValue(of(PERIODES));
    service.rechercherChantiers.and.returnValue(of([]));

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [
        provideRouter([
          {
            path: 'paie',
            component: PaieVuesComponent,
            children: [
              { path: '', component: VueFactice, data: { vue: 'tabulaire' } },
              { path: 'cartes', component: VueFactice, data: { vue: 'cartes' } },
              { path: 'analytique', component: VueFactice, data: { vue: 'analytique' } }
            ]
          }
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PaieService, useValue: service }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('lit les filtres dans l\'URL et charge les mois disponibles pour la barre', async () => {
    const composant = await harness.navigateByUrl('/paie/cartes?periode=2026-07&nom=ali&chantierIds=3', PaieVuesComponent);

    expect(composant.filtres()).toEqual({ ...AUCUN_FILTRE, periode: '2026-07', nomPrenom: 'ali', chantierIds: [3] });
    expect(composant.periodes()).toEqual(['2026-08', '2026-07']);
  });

  it('écrit les filtres de la barre dans l\'URL de la vue courante, sans en changer', async () => {
    const composant = await harness.navigateByUrl('/paie/cartes?periode=2026-07', PaieVuesComponent);

    composant.appliquer({ ...AUCUN_FILTRE, periode: '2026-08', cin: 'AB1', equipeIds: [2, 5] });
    await harness.fixture.whenStable();

    const url = TestBed.inject(Router).url;
    expect(url.startsWith('/paie/cartes?')).toBeTrue();
    expect(url).toContain('periode=2026-08');
    expect(url).toContain('cin=AB1');
    expect(url).toContain('equipeIds=2,5');
  });

  it('retire de l\'URL un filtre vidé', async () => {
    const composant = await harness.navigateByUrl('/paie?cin=AB1&periode=2026-08', PaieVuesComponent);

    composant.appliquer({ ...AUCUN_FILTRE, periode: '2026-08' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/paie?periode=2026-08');
  });

  it('recharge les mois à chaque changement de vue', async () => {
    await harness.navigateByUrl('/paie', PaieVuesComponent);
    const appels = service.listerPeriodes.calls.count();

    await harness.navigateByUrl('/paie/cartes', PaieVuesComponent);

    expect(service.listerPeriodes.calls.count()).toBeGreaterThan(appels);
  });

  it('rend le mois indispensable en analytique seulement', async () => {
    const composant = await harness.navigateByUrl('/paie', PaieVuesComponent);
    expect(composant.moisRequis()).toBeFalse();

    await harness.navigateByUrl('/paie/analytique', PaieVuesComponent);
    expect(composant.moisRequis()).toBeTrue();
  });

  it('ajoute le fil de navigation à la barre dans les cartes seulement', async () => {
    const composant = await harness.navigateByUrl('/paie', PaieVuesComponent);
    expect(composant.cartes()).toBeFalse();

    await harness.navigateByUrl('/paie/cartes', PaieVuesComponent);
    expect(composant.cartes()).toBeTrue();
  });

  it('réinitialise les filtres quand on change de vue par le sélecteur', async () => {
    const composant = await harness.navigateByUrl('/paie?periode=2026-08&nom=ali&chantierIds=3', PaieVuesComponent);

    (harness.routeNativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a[href="/paie/cartes"]')?.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/paie/cartes');
    expect(composant.filtres()).toEqual(AUCUN_FILTRE);
  });
});
