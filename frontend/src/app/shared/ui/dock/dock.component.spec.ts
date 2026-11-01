import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { DockDeclencheurComponent } from './dock-declencheur.component';
import { DockCommande, DockEtatService } from './dock-etat.service';

@Component({
  imports: [DockDeclencheurComponent],
  template: `<div class="app-page__header"><stp-dock-declencheur /><h1>Titre</h1></div>`
})
class HoteComponent {}

describe('Navigation unifiée (déclencheur et barre Staport)', () => {
  let etat: DockEtatService;
  let commandes: DockCommande[];
  let fixture: ReturnType<typeof TestBed.createComponent<HoteComponent>>;
  const declencheur = () => document.querySelector('.stp-declencheur') as HTMLButtonElement;
  const barre = () => document.querySelector('.stp-dock') as HTMLElement | null;
  const bouton = (nom: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('.stp-dock button')).find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(nom)) as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    etat = TestBed.inject(DockEtatService);
    etat.assistantDisponible.set(true);
    etat.utilisateur.set('hmayda');
    etat.items.set([
      { label: 'Paie', icon: 'wallet', route: '/paie', ouverture: '/paie/cartes' },
      { label: 'Équipes', icon: 'network', route: '/equipes' },
      { label: 'Utilisateurs', icon: 'user-cog', route: '/admin/users', groupe: 'admin' },
      { label: 'Journal', icon: 'history', route: '/audit', groupe: 'admin' }
    ]);
    etat.groupes.set([{ id: 'admin', label: 'Administration système', icon: 'layers' }]);
    commandes = [];
    etat.commandes.subscribe((c) => commandes.push(c));
    fixture = TestBed.createComponent(HoteComponent);
    document.body.append(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => {
    etat.fermer();
    fixture.destroy();
    fixture.nativeElement.remove();
  });

  async function ouvrir(): Promise<void> {
    declencheur().click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('au repos, seul le bouton hamburger de l’en-tête est visible, sans bordure animée', () => {
    expect(declencheur().getAttribute('aria-label')).toBe('Ouvrir la barre Staport');
    expect(declencheur().getAttribute('aria-expanded')).toBe('false');
    expect(barre()).toBeNull();
    expect(getComputedStyle(declencheur()).animationName).toBe('none');
  });

  it('un clic sur le hamburger ouvre la navigation à côté de lui, un second la ferme', async () => {
    await ouvrir();

    expect(document.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Barre Staport');
    expect(declencheur().getAttribute('aria-expanded')).toBe('true');

    declencheur().click();
    fixture.detectChanges();
    expect(etat.ouvert()).toBe(false);
  });

  it('porte les destinations autorisées, les groupes repliables, l’utilisateur et la déconnexion', async () => {
    await ouvrir();

    const nav = document.querySelector('nav[aria-label="Navigation principale"]') as HTMLElement;
    expect(Array.from(nav.querySelectorAll('.stp-dock__lien span')).map((e) => e.textContent?.trim())).toEqual([
      'Paie', 'Équipes', 'Administration système', 'Utilisateurs', 'Journal'
    ]);
    expect(nav.querySelector('a[href="/paie/cartes"]')).not.toBeNull();
    expect(nav.querySelectorAll('details')).toHaveLength(1);
    expect(document.querySelector('.stp-dock__utilisateur')?.textContent).toBe('hmayda');

    bouton('Se déconnecter').click();
    expect(commandes).toEqual(['deconnexion']);
  });

  it('marque la destination courante, vues comprises', async () => {
    await TestBed.inject(Router).navigateByUrl('/paie/cartes');
    await ouvrir();

    const actif = document.querySelector('.stp-dock__lien--actif') as HTMLElement;
    expect(actif.textContent?.trim()).toBe('Paie');
    expect(actif.getAttribute('aria-current')).toBe('page');
  });

  it('émet les commandes directes : AI (ouvrir puis fermer) et thème', async () => {
    await ouvrir();

    bouton('Staport Intelligence').click();
    etat.assistantOuvert.set(true);
    fixture.detectChanges();
    bouton('Staport Intelligence').click();
    bouton('thème').click();

    expect(commandes).toEqual(['assistant-ouvrir', 'assistant-fermer', 'theme']);
    expect(bouton('Staport Intelligence').getAttribute('aria-pressed')).toBe('true');
  });

  it('montre l’Accueil indisponible tant que les fiches de poste ne sont pas définies, sans rien émettre', async () => {
    await ouvrir();
    const accueil = bouton('Accueil');

    accueil.click();

    expect(accueil.getAttribute('aria-disabled')).toBe('true');
    expect(accueil.getAttribute('title')).toContain('fiches de poste');
    expect(commandes).toEqual([]);
  });

  it('la croix referme la barre', async () => {
    await ouvrir();

    bouton('Fermer la barre').click();

    expect(etat.ouvert()).toBe(false);
  });
});
