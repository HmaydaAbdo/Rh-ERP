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

  it('montre toute l\'évolution, même avec un seul mois, et met en évidence le mois analysé', async () => {
    service.analyser.and.returnValue(of(donnees({ evolution: [{ periode: '2026-08', masse: 40000, effectif: 10 }] })));

    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    expect(composant.graphiqueEvolution().data.labels).toEqual(['août 2026']);

    service.analyser.and.returnValue(
      of(donnees({ evolution: ['2024-01', '2026-07', '2026-08', '2026-09'].map((periode) => ({ periode, masse: 1, effectif: 1 })) }))
    );
    await ouvrir('/paie/analytique?periode=2026-08&nom=a');
    expect(composant.graphiqueEvolution().data.labels?.length).toBe(4);
    expect(composant.graphiqueEvolution().data.datasets[0].pointRadius).toEqual([4, 4, 8, 4]);
  });

  it('montre tous les chantiers et toutes les fonctions, sans plafond ni « Autres »', async () => {
    service.analyser.and.returnValue(
      of(
        donnees({
          parChantier: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, code: `C${i + 1}`, libelle: null, masse: 100 + i, effectif: 1, stc: 0 })),
          parFonction: Array.from({ length: 114 }, (_, i) => ({ id: i + 1, libelle: `FONCTION ${i + 1}`, masse: 10 + i, effectif: 1 }))
        })
      )
    );

    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    expect(composant.graphiqueChantiers().data.labels?.length).toBe(40);
    expect(composant.graphiqueFonctions().data.labels?.length).toBe(114);
    expect(composant.graphiqueFonctions().data.labels).not.toContain('Autres');
  });

  it('agrandit les graphiques avec le nombre de catégories pour que chaque ligne reste lisible', async () => {
    service.analyser.and.returnValue(
      of(donnees({ parFonction: Array.from({ length: 114 }, (_, i) => ({ id: i + 1, libelle: `F${i}`, masse: 1, effectif: 1 })) }))
    );

    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    expect(composant.hauteurFonctions()).toBeGreaterThan(composant.hauteurChantiers());
    expect(composant.hauteurChantiers()).toBeGreaterThanOrEqual(12);
  });

  it('trie les barres selon la mesure choisie, sans en perdre', async () => {
    service.analyser.and.returnValue(
      of(
        donnees({
          parChantier: [
            { id: 1, code: 'A', libelle: null, masse: 900, effectif: 1, stc: 0 },
            { id: 2, code: 'B', libelle: null, masse: 100, effectif: 9, stc: 0 }
          ]
        })
      )
    );
    const composant = await ouvrir('/paie/analytique?periode=2026-08');
    expect(composant.chantiersTries().map((c) => c.code)).toEqual(['A', 'B']);

    composant.mesureChantiers.set('effectif');

    expect(composant.chantiersTries().map((c) => c.code)).toEqual(['B', 'A']);
    expect(composant.graphiqueChantiers().data.datasets[0].data).toEqual([9, 1]);
  });

  it('filtre sur la fonction d\'une barre cliquée, dans l\'ordre affiché', async () => {
    service.analyser.and.returnValue(
      of(
        donnees({
          parFonction: [
            { id: 4, libelle: 'PETITE', masse: 10, effectif: 1 },
            { id: 8, libelle: 'GRANDE', masse: 900, effectif: 1 }
          ]
        })
      )
    );
    const composant = await ouvrir('/paie/analytique?periode=2026-08');

    // La plus grosse masse est affichée en premier : l'index 0 désigne « GRANDE ».
    composant.surBarreFonction({ element: { index: 0 } });
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toContain('fonctionIds=8');
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
