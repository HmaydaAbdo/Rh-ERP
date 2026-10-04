import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { AUCUN_FILTRE, PaieFiltres } from './paie-filtres';
import { PaieFiltresComponent } from './paie-filtres.component';

describe('PaieFiltresComponent', () => {
  let fixture: ComponentFixture<PaieFiltresComponent>;
  let composant: PaieFiltresComponent;
  let emis: PaieFiltres[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PaieFiltresComponent, NoopAnimationsModule],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    fixture = TestBed.createComponent(PaieFiltresComponent);
    composant = fixture.componentInstance;
    composant.periodes = ['2026-09', '2026-08', '2026-06'];
    composant.value = { ...AUCUN_FILTRE, periode: '2026-08', chantierIds: [1] };
    emis = [];
    composant.valueChange.subscribe((filtres) => emis.push(filtres));
    fixture.detectChanges();
  });

  it('propose le mois contigu dans la liste des mois qui ont de la paie', () => {
    expect(composant.plusAncien()).toBe('2026-06');
    expect(composant.plusRecent()).toBe('2026-09');
  });

  it('n\'a pas de mois voisin aux extrémités, ni sans mois choisi', () => {
    composant.value = { ...AUCUN_FILTRE, periode: '2026-09' };
    expect(composant.plusRecent()).toBeNull();

    composant.value = { ...AUCUN_FILTRE, periode: '2026-06' };
    expect(composant.plusAncien()).toBeNull();

    composant.value = AUCUN_FILTRE;
    expect(composant.plusAncien()).toBeNull();
    expect(composant.plusRecent()).toBeNull();
  });

  it('affiche « Tous les mois » quand aucun mois n\'est choisi', () => {
    composant.value = AUCUN_FILTRE;

    expect(composant.libelle()).toBe('Tous les mois');
  });

  it('émet aussitôt le nouveau mois avec les filtres en cours', () => {
    composant.choisir('2026-09');

    expect(emis).toEqual([{ ...AUCUN_FILTRE, periode: '2026-09', chantierIds: [1] }]);
  });

  it('revient à tous les mois en conservant les autres filtres', () => {
    composant.choisir(null);

    expect(emis).toEqual([{ ...AUCUN_FILTRE, periode: null, chantierIds: [1] }]);
  });

  it('émet après un court délai quand un filtre change, une seule fois pour une rafale de frappes', fakeAsync(() => {
    composant.formulaire.controls.nomPrenom.setValue('a');
    composant.formulaire.controls.nomPrenom.setValue('al');
    composant.formulaire.controls.cin.setValue('AB');
    tick(300);

    expect(emis).toEqual([{ ...AUCUN_FILTRE, periode: '2026-08', nomPrenom: 'al', cin: 'AB', chantierIds: [1] }]);
  }));

  it('réinitialise tout, mois compris', () => {
    expect(composant.aDesFiltres()).toBeTrue();

    composant.reinitialiser();

    expect(composant.aDesFiltres()).toBeFalse();
    expect(emis).toEqual([AUCUN_FILTRE]);
  });

  it('considère un texte d\'espaces comme aucun filtre', () => {
    composant.value = AUCUN_FILTRE;
    composant.formulaire.controls.nomPrenom.setValue('   ');

    expect(composant.aDesFiltres()).toBeFalse();
  });
});
