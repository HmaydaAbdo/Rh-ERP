import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { VueOnglet, VueSwitcherComponent } from './vue-switcher.component';

@Component({ selector: 'app-vide', template: '' })
class VideComponent {}

const VUES: VueOnglet[] = [
  { libelle: 'Tabulaire', icone: 'table', lien: '/module' },
  { libelle: 'Cartes', icone: 'layout-grid', lien: '/module/cartes' },
  { libelle: 'Analytique', icone: 'chart-column', lien: '/module/analytique' }
];

describe('VueSwitcherComponent', () => {
  async function afficher(url: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'module', component: VideComponent },
          { path: 'module/cartes', component: VideComponent },
          { path: 'module/analytique', component: VideComponent }
        ])
      ]
    });
    const fixture = TestBed.createComponent(VueSwitcherComponent);
    fixture.componentRef.setInput('label', 'Vue du module');
    fixture.componentRef.setInput('vues', VUES);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    const liens = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
    return { fixture, liens };
  }

  const actif = (liens: HTMLAnchorElement[]) => liens.filter((l) => l.classList.contains('vue-switcher__lien--active')).map((l) => l.textContent?.trim());

  it('propose chaque vue dans un repère de navigation nommé', async () => {
    const { fixture, liens } = await afficher('/module');

    expect(fixture.nativeElement.querySelector('nav')?.getAttribute('aria-label')).toBe('Vue du module');
    expect(liens.map((l) => [l.textContent?.trim(), l.getAttribute('href')])).toEqual([
      ['Tabulaire', '/module'],
      ['Cartes', '/module/cartes'],
      ['Analytique', '/module/analytique']
    ]);
  });

  it('met en avant la vue courante, et seulement elle', async () => {
    expect(actif((await afficher('/module')).liens)).toEqual(['Tabulaire']);
    TestBed.resetTestingModule();
    expect(actif((await afficher('/module/cartes')).liens)).toEqual(['Cartes']);
    TestBed.resetTestingModule();
    expect(actif((await afficher('/module/analytique')).liens)).toEqual(['Analytique']);
  });

  it('conserve les filtres de l’URL en changeant de vue', async () => {
    const { liens } = await afficher('/module?nom=ali&chantierIds=3');

    expect(liens[1].getAttribute('href')).toBe('/module/cartes?nom=ali&chantierIds=3');
  });

  describe('mode local (vue intégrée à la conversation)', () => {
    const VUES_LOCALES: VueOnglet[] = VUES.map((v, i) => ({ ...v, cle: ['tabulaire', 'cartes', 'analytique'][i] }));

    function afficherLocal(actuelle: string) {
      TestBed.configureTestingModule({ providers: [provideRouter([])] });
      const fixture = TestBed.createComponent(VueSwitcherComponent);
      fixture.componentRef.setInput('label', 'Vue du module');
      fixture.componentRef.setInput('vues', VUES_LOCALES);
      fixture.componentRef.setInput('local', true);
      fixture.componentRef.setInput('actuelle', actuelle);
      fixture.detectChanges();
      const boutons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
      return { fixture, boutons };
    }

    it('rend des boutons et aucun lien : le routeur n’est pas touché', () => {
      const { fixture, boutons } = afficherLocal('cartes');

      expect(boutons.map((b) => b.textContent?.trim())).toEqual(['Tabulaire', 'Cartes', 'Analytique']);
      expect(fixture.nativeElement.querySelectorAll('a')).toHaveLength(0);
    });

    it('met en avant la vue actuelle, et seulement elle', () => {
      const { boutons } = afficherLocal('cartes');

      expect(boutons.map((b) => b.classList.contains('vue-switcher__lien--active'))).toEqual([false, true, false]);
      expect(boutons.map((b) => b.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    });

    it('annonce la vue choisie', () => {
      const { fixture, boutons } = afficherLocal('tabulaire');
      const choix: string[] = [];
      fixture.componentInstance.choisie.subscribe((cle) => choix.push(cle));

      boutons[2].click();

      expect(choix).toEqual(['analytique']);
    });
  });
});
