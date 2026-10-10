import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { firstValueFrom, of } from 'rxjs';

import { AuthService } from '../../../core/auth/services/auth.service';
import { PaieChantierPeriode } from '../models/paie.model';
import { PaieService } from '../services/paie.service';
import { AUCUN_FILTRE, PaieFiltres } from './paie-filtres';
import { PaieFiltresComponent } from './paie-filtres.component';

const CHANTIERS: PaieChantierPeriode[] = [
  {
    id: 3,
    code: 'C168',
    libelle: 'Nador',
    effectif: 10,
    masse: 100,
    equipes: [
      { id: 1, code: 'CH', libelle: 'Chauffeurs', effectif: 6, masse: 60 },
      { id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 4, masse: 40 }
    ]
  },
  { id: 4, code: 'C196', libelle: null, effectif: 5, masse: 50, equipes: [{ id: 2, code: 'OP', libelle: 'Opérateurs', effectif: 5, masse: 50 }] },
  { id: 5, code: 'C057', libelle: 'Depot', effectif: 2, masse: 20, equipes: [{ id: 9, code: 'LABO', libelle: 'Labo', effectif: 2, masse: 20 }] }
];

describe('PaieFiltresComponent', () => {
  let fixture: ComponentFixture<PaieFiltresComponent>;
  let composant: PaieFiltresComponent;
  let service: jasmine.SpyObj<PaieService>;
  let emis: PaieFiltres[];
  let permissions: string[];

  function afficher(filtres: PaieFiltres): void {
    composant.value = filtres;
    fixture.detectChanges();
  }

  beforeEach(() => {
    permissions = ['CHANTIER_READ', 'EQUIPE_READ', 'FUNCTION_READ'];
    service = jasmine.createSpyObj<PaieService>('PaieService', ['rechercherChantiers']);
    service.rechercherChantiers.and.returnValue(of(CHANTIERS));
    TestBed.configureTestingModule({
      imports: [PaieFiltresComponent, NoopAnimationsModule],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: PaieService, useValue: service },
        { provide: AuthService, useValue: { hasPermission: (code: string) => permissions.includes(code) } }
      ]
    });
    fixture = TestBed.createComponent(PaieFiltresComponent);
    composant = fixture.componentInstance;
    composant.periodes = ['2026-09', '2026-08', '2026-06'];
    composant.value = { ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [3] };
    emis = [];
    composant.valueChange.subscribe((filtres) => emis.push(filtres));
    fixture.detectChanges();
  });

  describe('mois', () => {
    it('propose le mois contigu dans la liste des mois qui ont de la paie', () => {
      expect(composant.plusAncien()).toBe('2026-06');
      expect(composant.plusRecent()).toBe('2026-09');
    });

    it('n\'a pas de mois voisin aux extrémités, ni sans mois choisi', () => {
      afficher({ ...AUCUN_FILTRE, periode: '2026-09' });
      expect(composant.plusRecent()).toBeNull();

      afficher({ ...AUCUN_FILTRE, periode: '2026-06' });
      expect(composant.plusAncien()).toBeNull();

      afficher(AUCUN_FILTRE);
      expect(composant.plusAncien()).toBeNull();
      expect(composant.plusRecent()).toBeNull();
    });

    it('affiche « Tous les mois », ou « Choisir un mois » quand le mois est indispensable', () => {
      afficher(AUCUN_FILTRE);
      expect(composant.libelle()).toBe('Tous les mois');

      composant.moisRequis = true;
      expect(composant.libelle()).toBe('Choisir un mois');
    });

    it('émet aussitôt le nouveau mois avec les filtres en cours', () => {
      composant.choisir('2026-09');

      expect(emis).toEqual([{ ...AUCUN_FILTRE, periode: '2026-09', chantierIds: [3] }]);
    });

    it('revient à tous les mois en conservant les autres filtres', () => {
      composant.choisir(null);

      expect(emis).toEqual([{ ...AUCUN_FILTRE, periode: null, chantierIds: [3] }]);
    });

    it('ne propose pas d\'effacer le mois quand il est indispensable (analytique)', () => {
      composant.moisRequis = true;
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('button[aria-label="Tous les mois"]')).toBeNull();

      composant.moisRequis = false;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('button[aria-label="Tous les mois"]')).not.toBeNull();
    });
  });

  describe('saisies et effacement', () => {
    it('émet après un court délai, une seule fois pour une rafale de frappes', fakeAsync(() => {
      composant.formulaire.controls.nomPrenom.setValue('a');
      composant.formulaire.controls.nomPrenom.setValue('al');
      composant.formulaire.controls.cin.setValue('AB');
      tick(300);

      expect(emis).toEqual([{ ...AUCUN_FILTRE, periode: '2026-08', nomPrenom: 'al', cin: 'AB', chantierIds: [3] }]);
    }));

    it('efface tout, mois compris, sauf quand le mois est indispensable', () => {
      composant.reinitialiser();
      expect(emis.at(-1)).toEqual(AUCUN_FILTRE);

      afficher({ ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [3] });
      composant.moisRequis = true;
      composant.reinitialiser();
      expect(emis.at(-1)).toEqual({ ...AUCUN_FILTRE, periode: '2026-08' });
    });

    it('considère un texte d\'espaces comme aucun filtre', () => {
      afficher(AUCUN_FILTRE);
      composant.formulaire.controls.nomPrenom.setValue('   ');

      expect(composant.aDesFiltres()).toBeFalse();
    });
  });

  describe('cascade', () => {
    it('restreint les chantiers proposés à ceux du mois choisi', async () => {
      expect(service.rechercherChantiers).toHaveBeenCalledOnceWith({ periode: '2026-08' });
      const [source] = composant.sourcesChantiers();

      const page = await firstValueFrom(source.fetchPage(0, 10, ''));

      expect(page.items.map((c) => c.code)).toEqual(['C057', 'C168', 'C196']);
    });

    it('restreint les équipes à celles des chantiers choisis ce mois-là, sans doublon', async () => {
      afficher({ ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [3, 4] });
      const [source] = composant.sourcesEquipes();

      const page = await firstValueFrom(source.fetchPage(0, 10, ''));

      expect(page.items.map((e) => e.code)).toEqual(['CH', 'OP']);
    });

    it('propose les listes complètes du référentiel sans mois', () => {
      afficher({ ...AUCUN_FILTRE, chantierIds: [3] });

      expect(composant.sourcesChantiers()[0]).toBe(composant.chantierReferenceService);
      expect(composant.sourcesEquipes()[0]).toBe(composant.equipeReferenceService);
    });

    it('propose toutes les équipes tant qu\'aucun chantier n\'est choisi', () => {
      afficher({ ...AUCUN_FILTRE, periode: '2026-08' });

      expect(composant.sourcesEquipes()[0]).toBe(composant.equipeReferenceService);
    });

    it('ne recharge pas les chantiers d\'un mois déjà vu', () => {
      afficher({ ...AUCUN_FILTRE, periode: '2026-09' });
      afficher({ ...AUCUN_FILTRE, periode: '2026-08' });

      expect(service.rechercherChantiers).toHaveBeenCalledTimes(2);
    });
  });

  describe('sélecteurs toujours visibles, selon les permissions', () => {
    function colonnes(): string[] {
      fixture.detectChanges();
      return Array.from(fixture.nativeElement.querySelectorAll('app-lazy-select')).map((e: unknown) => (e as HTMLElement).getAttribute('formcontrolname') ?? '');
    }

    it("affiche les trois sélecteurs dès l'arrivée, sans rien à ouvrir", () => {
      expect(colonnes().length).toBe(3);
    });

    it('propose les trois sélecteurs à qui peut lire les trois référentiels', () => {
      expect(colonnes()).toEqual(['chantierIds', 'equipeIds', 'fonctionIds']);
    });

    it('ne propose pas un sélecteur dont la route de recherche refuserait l’accès (403)', () => {
      permissions = ['EQUIPE_READ'];

      expect(colonnes()).toEqual(['equipeIds']);
    });

    it('ne propose aucun sélecteur sans aucune de ces permissions', () => {
      permissions = [];

      expect(colonnes()).toEqual([]);
    });
  });

  describe('téléphone : filtres repliés', () => {
    it('compte les filtres du panneau replié (CIN, chantiers, équipes, fonctions), pas le mois ni le nom', () => {
      afficher({ ...AUCUN_FILTRE, periode: '2026-08', nomPrenom: 'ali', cin: 'AB1', chantierIds: [3, 4], fonctionIds: [5] });

      expect(composant.nombreSecondaires()).toBe(3);

      afficher({ ...AUCUN_FILTRE, periode: '2026-08', nomPrenom: 'ali' });
      expect(composant.nombreSecondaires()).toBe(0);
    });

    it('déplie et replie le panneau par le bouton « Filtres »', () => {
      expect(composant.secondairesOuverts()).toBeFalse();

      composant.basculerSecondaires();
      expect(composant.secondairesOuverts()).toBeTrue();

      composant.basculerSecondaires();
      expect(composant.secondairesOuverts()).toBeFalse();
    });
  });

  describe('fil de navigation (cartes)', () => {
    it("n'apparaît que dans les cartes", () => {
      expect(fixture.nativeElement.querySelector('.paie-filtres__fil')).toBeNull();

      composant.avecFil = true;
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.paie-filtres__fil')).not.toBeNull();
    });

    it('revient aux mois, ou aux chantiers du mois, depuis le fil', () => {
      composant.allerAuNiveau(2);
      expect(emis.at(-1)).toEqual({ ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [] });

      afficher({ ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [3], fonctionIds: [5] });
      composant.allerAuNiveau(1);
      expect(emis.at(-1)).toEqual({ ...AUCUN_FILTRE, periode: null, chantierIds: [], fonctionIds: [5] });
    });

    it("remonte d'un cran à la fois : le chantier d'abord, puis le mois", () => {
      composant.remonter();
      expect(emis.at(-1)).toEqual({ ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [] });

      afficher({ ...AUCUN_FILTRE, periode: '2026-08' });
      composant.remonter();
      expect(emis.at(-1)).toEqual(AUCUN_FILTRE);
    });

    it("nomme le chantier ouvert d'après les chantiers du mois", () => {
      expect(composant.chantierOuvert()).toBe('C168');

      afficher({ ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [3, 4] });
      expect(composant.chantierOuvert()).toBeNull();
    });
  });
});
