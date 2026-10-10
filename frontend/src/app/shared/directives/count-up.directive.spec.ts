import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CountUpDirective } from './count-up.directive';

@Component({
  selector: 'app-compteur-test',
  imports: [CountUpDirective],
  template: `<span id="n" [appCountUp]="valeur()"></span>`
})
class CompteurTestComponent {
  readonly valeur = signal(0);
}

describe('CountUpDirective', () => {
  let reduit = false;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    vi.spyOn(window, 'matchMedia').mockImplementation((requete) => ({ matches: reduit && requete.includes('reduce') }) as MediaQueryList);
  });

  afterEach(() => {
    reduit = false;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function afficher(valeur: number) {
    const fixture = TestBed.createComponent(CompteurTestComponent);
    fixture.componentInstance.valeur.set(valeur);
    fixture.detectChanges();
    return { fixture, texte: () => (fixture.nativeElement.querySelector('#n') as HTMLElement).textContent };
  }

  it('anime le nombre depuis zéro jusqu’à sa valeur, au format français', () => {
    const { texte } = afficher(1234567);

    vi.advanceTimersByTime(100);
    const enCours = Number((texte() ?? '0').replace(/\s/g, '').replace(/ /g, ''));
    expect(enCours).toBeGreaterThan(0);
    expect(enCours).toBeLessThan(1234567);

    vi.advanceTimersByTime(1000);
    expect(texte()?.replace(/\s/g, ' ')).toBe('1 234 567');
  });

  it('repart de la valeur affichée quand la cible change', () => {
    const { fixture, texte } = afficher(100);
    vi.advanceTimersByTime(1000);
    expect(texte()).toBe('100');

    fixture.componentInstance.valeur.set(300);
    fixture.detectChanges();
    vi.advanceTimersByTime(50);
    const enCours = Number(texte());
    expect(enCours).toBeGreaterThanOrEqual(100);
    expect(enCours).toBeLessThan(300);

    vi.advanceTimersByTime(1000);
    expect(texte()).toBe('300');
  });

  it('affiche aussitôt la valeur finale quand l’utilisateur demande moins de mouvement', () => {
    reduit = true;
    const { texte } = afficher(4500);

    expect(texte()?.replace(/\s/g, ' ')).toBe('4 500');
  });

  it('arrête l’animation à la destruction', () => {
    const { fixture } = afficher(100);
    const annuler = vi.spyOn(window, 'cancelAnimationFrame');

    fixture.destroy();

    expect(annuler).toHaveBeenCalled();
  });
});
