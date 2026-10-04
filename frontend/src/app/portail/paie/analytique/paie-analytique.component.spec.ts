import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { AUCUN_FILTRE } from '../filtres/paie-filtres';
import { PaieAnalytique, PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieAnalytiqueComponent } from './paie-analytique.component';

const PERIODES: PaiePeriodeResume[] = [
  { periode: '2026-08', nombreBulletins: 10, nombreChantiers: 2, masse: 40000, stc: 1 },
  { periode: '2026-07', nombreBulletins: 8, nombreChantiers: 2, masse: 32000, stc: 0 }
];

function donnees(surcharge: Partial<PaieAnalytique> = {}): PaieAnalytique {
  return {
    periode: '2026-08',
    kpis: { masse: 40000, effectif: 10, coutMoyen: 4000, nombreChantiers: 2, stc: 1 },
    moisPrecedent: { masse: 32000, effectif: 8, coutMoyen: 4000, nombreChantiers: 2, stc: 0 },
    parChantier: [
      { id: 7, code: 'C168', libelle: 'Nador', masse: 30000, effectif: 7, stc: 1 },
      { id: 9, code: 'C196', libelle: null, masse: 10000, effectif: 3, stc: 0 }
    ],
    parFonction: [{ id: 1, libelle: 'CH. CAMION', masse: 40000, effectif: 10 }],
    tranches: [{ min: 0, max: 5000, effectif: 6 }, { min: 5000, max: null, effectif: 4 }],
    evolution: [{ periode: '2026-07', masse: 32000, effectif: 8 }, { periode: '2026-08', masse: 40000, effectif: 10 }],
    qualite: { sansEquipe: 4, sansObservation: 5 },
    ...surcharge
  };
}

describe('PaieAnalytiqueComponent', () => {
  let service: jasmine.SpyObj<PaieService>;
  let harness: RouterTestingHarness;

  async function ouvrir(url: string): Promise<PaieAnalytiqueComponent> {
    return harness.navigateByUrl(url, PaieAnalytiqueComponent);
  }

  beforeEach(async () => {
    service = jasmine.createSpyObj<PaieService>('PaieService', ['listerPeriodes', 'analyser']);
    service.listerPeriodes.and.returnValue(of(PERIODES));
    service.analyser.and.returnValue(of(donnees()));

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [
        provideRouter([{ path: 'paie/analytique', component: PaieAnalytiqueComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PaieService, useValue: service }
      ]
    });
    harness = await RouterTestingHarness.create();
  });

  it('ouvre le mois le plus récent quand l\'URL n\'en porte pas', async () => {
    await ouvrir('/paie/analytique');

    expect(TestBed.inject(Router).url).toContain('periode=2026-08');
    expect(service.analyser).toHaveBeenCalledTimes(1);
    expect(service.analyser.calls.mostRecent().args[0].periode).toBe('2026-08');
  });

  it('transmet le mois et les filtres de l\'URL, sans valeur invalide', async () => {
    await ouvrir('/paie/analytique?periode=2026-07&nom=ali&cin=AB1&chantierIds=7,x&fonctionIds=3&equipeIds=');

    expect(service.analyser).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ periode: '2026-07', nomPrenom: 'ali', cin: 'AB1', chantierIds: [7], fonctionIds: [3], equipeIds: undefined })
    );
  });

  it('compare chaque indicateur au mois précédent', async () => {
    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    const [masse, bulletins, coutMoyen, stc, chantiers] = composant.tuiles();
    expect(masse.variation).toBe('+25,0 %');
    expect(bulletins.variation).toBe('+2');
    expect(coutMoyen.variation).toBe('0,0 %');
    expect(stc.variation).toBe('+1');
    expect(chantiers.variation).toBe('0');
  });

  it('ne compare rien quand le mois précédent n\'a pas de bulletin sur le périmètre', async () => {
    service.analyser.and.returnValue(of(donnees({ moisPrecedent: null })));

    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    expect(composant.tuiles().every((t) => t.variation === null)).toBeTrue();
  });

  it('ne divise pas par un mois précédent nul', async () => {
    service.analyser.and.returnValue(
      of(donnees({ moisPrecedent: { masse: 0, effectif: 0, coutMoyen: null, nombreChantiers: 0, stc: 0 } }))
    );

    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    expect(composant.tuiles()[0].variation).toBeNull();
    expect(composant.tuiles()[1].variation).toBe('+10');
  });

  it('filtre sur le chantier d\'une barre cliquée', async () => {
    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    composant.surBarreChantier({ element: { index: 1 } });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toContain('chantierIds=9');
    expect(service.analyser.calls.mostRecent().args[0].chantierIds).toEqual([9]);
  });

  it('ignore un clic hors des barres', async () => {
    const composant = await ouvrir('/paie/analytique?periode=2026-08');
    const appels = service.analyser.calls.count();

    composant.surBarreChantier({});

    expect(service.analyser.calls.count()).toBe(appels);
  });

  it('retire un filtre de l\'URL quand sa sélection est vidée', async () => {
    const composant = await ouvrir('/paie/analytique?periode=2026-08&chantierIds=7');

    expect(TestBed.inject(Router).url).toContain('chantierIds=7');

    composant.appliquer({ ...AUCUN_FILTRE, periode: '2026-08' });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).not.toContain('chantierIds');
  });

  it('n\'affiche l\'évolution qu\'à partir de trois mois', async () => {
    const composant = await ouvrir('/paie/analytique?periode=2026-08');
    expect(composant.evolutionVisible()).toBeFalse();

    service.analyser.and.returnValue(
      of(donnees({ evolution: ['2026-06', '2026-07', '2026-08'].map((periode) => ({ periode, masse: 1, effectif: 1 })) }))
    );
    await ouvrir('/paie/analytique?periode=2026-08&chantierIds=1');
    expect(composant.evolutionVisible()).toBeTrue();
  });

  it('calcule la part des bulletins sans équipe et sans observation', async () => {
    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    expect(composant.qualite().map((l) => [l.nombre, l.part])).toEqual([[4, 40], [5, 50]]);
  });

  it('signale un périmètre sans bulletin', async () => {
    service.analyser.and.returnValue(
      of(donnees({ kpis: { masse: 0, effectif: 0, coutMoyen: null, nombreChantiers: 0, stc: 0 }, moisPrecedent: null, parChantier: [] }))
    );

    const composant = await ouvrir('/paie/analytique?periode=2026-08&chantierIds=1');

    expect(composant.vide()).toBeTrue();
  });

  it('signale l\'absence de toute paie sans lancer d\'analyse', async () => {
    service.listerPeriodes.and.returnValue(of([]));

    const composant = await ouvrir('/paie/analytique');

    expect(composant.aucunePaie()).toBeTrue();
    expect(service.analyser).not.toHaveBeenCalled();
  });
});
