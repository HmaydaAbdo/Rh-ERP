import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
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
    code: 'C168',
    libelle: 'Nador',
    effectif: 148,
    masse: 720000,
    equipes: [
      { id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 74, masse: 400000 },
      { id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 69, masse: 300000 }
    ]
  },
  { code: 'C196', libelle: null, effectif: 10, masse: 80000, equipes: [] }
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
    service = jasmine.createSpyObj<PaieService>('PaieService', ['listerPeriodes', 'listerChantiersDeLaPeriode']);
    service.listerPeriodes.and.returnValue(of(PERIODES));
    service.listerChantiersDeLaPeriode.and.returnValue(of(CHANTIERS));

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule],
      providers: [provideRouter([{ path: 'paie/cartes', component: PaieCartesComponent }]), { provide: PaieService, useValue: service }]
    });
  });

  it('retient le sens de la descente pour orienter l\'animation entre niveaux', async () => {
    const composant = await ouvrir('/paie/cartes');
    await ouvrir('/paie/cartes?periode=2026-08');
    expect(composant.sens()).toBe('avant');

    await ouvrir('/paie/cartes');
    expect(composant.sens()).toBe('arriere');
  });

  it('affiche les mois au niveau 1 sans charger de chantiers', async () => {
    const composant = await ouvrir('/paie/cartes');

    expect(composant.niveau()).toBe(1);
    expect(composant.cartesMois().map((c) => c.resume.periode)).toEqual(['2026-09', '2026-08', '2026-06']);
    expect(service.listerChantiersDeLaPeriode).not.toHaveBeenCalled();
  });

  it('compare la masse au mois contigu, et seulement à lui', async () => {
    const composant = await ouvrir('/paie/cartes');

    const [septembre, aout, juin] = composant.cartesMois();
    expect(septembre.variation).toBeCloseTo(12.5);
    // Mai n'a pas de paie : juin n'est comparé à rien, jamais à un mois plus ancien.
    expect(aout.variation).toBeNull();
    expect(juin.variation).toBeNull();
  });

  it('charge les chantiers du mois au niveau 2 et calcule leur part de la masse', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08');

    expect(composant.niveau()).toBe(2);
    expect(service.listerChantiersDeLaPeriode).toHaveBeenCalledOnceWith('2026-08');
    expect(composant.cartesChantier().map((c) => c.chantier.code)).toEqual(['C168', 'C196']);
    expect(composant.cartesChantier()[0].part).toBeCloseTo(90);
  });

  it('filtre les cartes chantier sur le code ou le nom', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08');

    composant.termeChantier.set('nador');

    expect(composant.cartesChantier().map((c) => c.chantier.code)).toEqual(['C168']);
  });

  it('ajoute une ligne « Sans équipe » pour que le total égale celui du chantier', async () => {
    const composant = await ouvrir('/paie/cartes?periode=2026-08&chantier=C168');

    expect(composant.niveau()).toBe(3);
    const lignes = composant.lignesEquipes();
    expect(lignes.map((l) => l.code)).toEqual(['CH', 'OP', '-']);
    expect(lignes[2]).toEqual(jasmine.objectContaining({ libelle: 'Sans équipe', effectif: 5, masse: 20000 }));
    expect(composant.effectifTotalEquipes()).toBe(148);
    expect(composant.masseTotaleEquipes()).toBe(720000);
  });

  it('n\'ajoute pas de ligne « Sans équipe » quand toutes les personnes ont une équipe', async () => {
    service.listerChantiersDeLaPeriode.and.returnValue(of([{ ...CHANTIERS[0], effectif: 143, masse: 700000 }]));

    const composant = await ouvrir('/paie/cartes?periode=2026-08&chantier=C168');

    expect(composant.lignesEquipes().map((l) => l.code)).toEqual(['CH', 'OP']);
  });

  it('ne rappelle pas le backend en revenant sur un mois déjà chargé', async () => {
    await ouvrir('/paie/cartes?periode=2026-08');
    await ouvrir('/paie/cartes?periode=2026-08&chantier=C168');
    await ouvrir('/paie/cartes?periode=2026-08');

    expect(service.listerChantiersDeLaPeriode).toHaveBeenCalledTimes(1);
  });

  it('signale un mois sans paie et un chantier absent du mois', async () => {
    const mois = await ouvrir('/paie/cartes?periode=2026-07');
    expect(mois.periodeIntrouvable()).toBeTrue();

    const chantier = await ouvrir('/paie/cartes?periode=2026-08&chantier=C999');
    expect(chantier.chantierIntrouvable()).toBeTrue();
    expect(chantier.periodeIntrouvable()).toBeFalse();
  });
});
