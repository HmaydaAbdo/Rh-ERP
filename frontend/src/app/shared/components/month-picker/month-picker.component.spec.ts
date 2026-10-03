import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonthPickerComponent } from './month-picker.component';

describe('MonthPickerComponent', () => {
  let fixture: ComponentFixture<MonthPickerComponent>;
  let composant: MonthPickerComponent;

  function tuiles(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.month-picker__mois'));
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(MonthPickerComponent);
    composant = fixture.componentInstance;
  });

  it('grise les mois qui ne sont pas disponibles et ne les rend pas sélectionnables', () => {
    composant.value = '2026-08';
    composant.disponibles = ['2026-07', '2026-08'];
    fixture.detectChanges();

    const desactivees = tuiles().filter((tuile) => tuile.disabled).length;
    expect(desactivees).toBe(10);

    const emis: string[] = [];
    composant.valueChange.subscribe((periode) => emis.push(periode));
    tuiles()[0].click(); // janvier : indisponible
    expect(emis).toEqual([]);
  });

  it('émet la période au format aaaa-MM quand on choisit un mois disponible', () => {
    composant.value = '2026-08';
    composant.disponibles = ['2026-07', '2026-08'];
    fixture.detectChanges();

    const emis: string[] = [];
    composant.valueChange.subscribe((periode) => emis.push(periode));
    tuiles()[6].click(); // juillet
    fixture.detectChanges();

    expect(emis).toEqual(['2026-07']);
    expect(fixture.nativeElement.querySelector('.month-picker__mois--selectionne').textContent).toContain('Juil.');
  });

  it("limite la navigation aux années qui contiennent des mois disponibles", () => {
    composant.value = '2026-08';
    composant.disponibles = ['2025-12', '2026-08'];
    fixture.detectChanges();

    expect(composant.annee()).toBe(2026);
    expect(composant.peutAvancer()).toBeFalse();
    composant.changerAnnee(-1);
    expect(composant.annee()).toBe(2025);
    expect(composant.peutReculer()).toBeFalse();
    composant.changerAnnee(-1);
    expect(composant.annee()).toBe(2025);
  });

  it('autorise tous les mois quand aucune liste de mois disponibles n\'est fournie', () => {
    composant.value = '2026-08';
    composant.disponibles = null;
    fixture.detectChanges();

    expect(tuiles().every((tuile) => !tuile.disabled)).toBeTrue();
  });
});
