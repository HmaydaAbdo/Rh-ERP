import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { PaieChantierPeriode, PaiePeriodeResume } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { PaieCartesComponent } from './paie-cartes.component';

const PERIODES: PaiePeriodeResume[] = [
  { periode: '2026-09', nombreBulletins: 975, nombreChantiers: 25, masse: 4500000, stc: 41 },
  { periode: '2026-08', nombreBulletins: 969, nombreChantiers: 25, masse: 4000000, stc: 0 },
  { periode: '2026-06', nombreBulletins: 900, nombreChantiers: 24, masse: 3900000, stc: 5 }
];
const CHANTIERS: PaieChantierPeriode[] = [
  {
    id: 1,
    code: 'C168',
    libelle: 'Nador',
    effectif: 148,
    masse: 720000,
    equipes: [
      { id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 74, masse: 400000 },
      { id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 69, masse: 300000 }
    ]
  },
  { id: 2, code: 'C196', libelle: null, effectif: 10, masse: 80000, equipes: [] }
];

describe('PaieCartesComponent', () => {
  let service: jasmine.SpyObj<PaieService>;
  let harness: RouterTestingHarness;

  async function ouvrir(url: string): Promise<PaieCartesComponent> {
    harness ??= await RouterTestingHarness.create();
    return harness.navigateByUrl(url, PaieCartesComponent);
  }

  beforeEach(() => {
    harness = undefined as unknown as RouterTestingHarness;
    service = jasmine.createSpyObj<PaieService>('PaieService', ['rechercherPeriodes', 'rechercherChantiers']);
    service.rechercherPeriodes.and.returnValue(of(PERIODES));
    service.rechercherChantiers.and.returnValue(of(CHANTIERS));

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [provideRouter([{ path: 'paie/cartes', component: PaieCartesComponent }]), { provide: PaieService, useValue: service }]
    });
  });

  it('déduit le niveau des filtres : sans mois, les mois ; avec un mois, les chantiers ; avec un seul chantier, ses équipes', async () => {
    const composant = await ouvrir('/paie/cartes');
    expect(composant.niveau()).toBe(1);

    await ouvrir('/paie/cartes?periode=2026-08');
    expect(composant.niveau()).toBe(2);

    await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1,2');
    expect(composant.niveau()).toBe(2);

    await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
    expect(composant.niveau()).toBe(3);
  });

  it('affiche les mois au niveau 1 sans charger de chantiers', async () => {
    const composant = await ouvrir('/paie/cartes');

    expect(composant.cartesMois().map((c) => c.resume.periode)).toEqual(['2026-09', '2026-08', '2026-06']);
    expect(service.rechercherChantiers).not.toHaveBeenCalled();
  });

  it('transmet les filtres de l\'URL à chaque niveau, sans le mois au niveau des mois', async () => {
    await ouvrir('/paie/cartes?periode=2026-08&nom=ali&cin=AB1&fonctionIds=5&equipeIds=2');
    expect(service.rechercherChantiers).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ periode: '2026-08', nomPrenom: 'ali', cin: 'AB1', fonctionIds: [5], equipeIds: [2] })
    );

    await ouvrir('/paie/cartes?nom=ali&periode=');
    expect(service.rechercherPeriodes).toHaveBeenCalledOnceWith(jasmine.objectContaining({ nomPrenom: 'ali', periode: undefined }));
  });

  it('compare la masse au mois contigu, et seulement à lui', async () => {
    const composant = await ouvrir('/paie/cartes');

    const [septembre, aout, juin] = composant.cartesMois();
    expect(septembre.variation).toBeCloseTo(12.5);
    // Mai n'a pas de paie : juin n'est comparé à rien, jamais à un mois plus ancien.
    expect(aout.variation).toBeNull();
    expect(juin.variation).toBeNull();
  });

  it('résume le mois et calcule la part de chaque chantier à partir des chantiers filtrés', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08');

    expect(composant.resumeMois()).toEqual({ masse: 800000, bulletins: 158, chantiers: 2 });
    expect(composant.cartesChantier().map((c) => c.chantier.code)).toEqual(['C168', 'C196']);
    expect(composant.cartesChantier()[0].part).toBeCloseTo(90);
  });

  it('ajoute une ligne « Sans équipe » pour que le total égale celui du chantier', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');

    const lignes = composant.lignesEquipes();
    expect(lignes.map((l) => l.code)).toEqual(['CH', 'OP', '-']);
    expect(lignes[2]).toEqual(jasmine.objectContaining({ equipeId: null, libelle: 'Sans équipe', effectif: 5, masse: 20000 }));
    expect(composant.effectifTotalEquipes()).toBe(148);
    expect(composant.masseTotaleEquipes()).toBe(720000);
  });

  it('n\'ajoute pas de ligne « Sans équipe » quand toutes les personnes ont une équipe', async () => {
    service.rechercherChantiers.and.returnValue(of([{ ...CHANTIERS[0], effectif: 143, masse: 700000 }]));

    const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');

    expect(composant.lignesEquipes().map((l) => l.code)).toEqual(['CH', 'OP']);
  });

  it('ouvre la vue tabulaire avec les filtres en cours plus l\'équipe cliquée', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
    const navigation = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    composant.ouvrirBulletins(composant.lignesEquipes()[1]);

    expect(navigation).toHaveBeenCalledOnceWith(['/paie'], { queryParams: { equipeIds: '2' }, queryParamsHandling: 'merge' });
  });

  it('n\'ouvre rien pour les bulletins sans équipe, que l\'API ne sait pas filtrer', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
    const navigation = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    composant.ouvrirBulletins(composant.lignesEquipes()[2]);

    expect(navigation).not.toHaveBeenCalled();
  });

  it('ne rappelle pas le backend pour des filtres déjà chargés', async () => {
    await ouvrir('/paie/cartes?periode=2026-08');
    await ouvrir('/paie/cartes?periode=2026-08&chantierIds=1');
    await ouvrir('/paie/cartes?periode=2026-08');

    expect(service.rechercherChantiers).toHaveBeenCalledTimes(2);
  });

  it('signale l\'absence de résultat à chaque niveau', async () => {
    service.rechercherPeriodes.and.returnValue(of([]));
    service.rechercherChantiers.and.returnValue(of([]));

    const composant = await ouvrir('/paie/cartes?nom=zzz');
    expect(composant.aucunResultat()).toBeTrue();

    await ouvrir('/paie/cartes?periode=2026-08&nom=zzz');
    expect(composant.aucunResultat()).toBeTrue();
  });

  it('signale un chantier absent du mois avec ces filtres', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08&chantierIds=999');

    expect(composant.chantierIntrouvable()).toBeTrue();
    expect(composant.aucunResultat()).toBeFalse();
  });

  it('retient le sens de la descente pour orienter l\'animation entre niveaux', async () => {
    const composant = await ouvrir('/paie/cartes');
    await ouvrir('/paie/cartes?periode=2026-08');
    expect(composant.sens()).toBe('avant');

    await ouvrir('/paie/cartes');
    expect(composant.sens()).toBe('arriere');
  });
});
