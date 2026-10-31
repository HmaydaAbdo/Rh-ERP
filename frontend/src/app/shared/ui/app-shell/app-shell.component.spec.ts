import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AppShellComponent, ShellNavGroupe, ShellNavItem } from './app-shell.component';

const ITEMS: readonly ShellNavItem[] = [
  { label: 'Paie', icon: 'wallet', route: '/paie' },
  { label: 'Carte', icon: 'map-pinned', route: '/carte' },
  { label: 'Utilisateurs', icon: 'user-cog', route: '/admin/users', groupe: 'admin' },
  { label: 'Journal', icon: 'history', route: '/audit', groupe: 'admin' }
];
const GROUPES: readonly ShellNavGroupe[] = [{ id: 'admin', label: 'Administration système', icon: 'layers' }];

@Component({
  imports: [AppShellComponent],
  template: `
    <stp-app-shell
      [items]="items"
      [groupes]="groupes"
      utilisateur="hmayda"
      [theme]="theme()"
      [navigationVisible]="visible()"
      [modeCarte]="carte()"
      (basculerTheme)="themes = themes + 1"
      (deconnecter)="deconnexions = deconnexions + 1"
    >
      <p id="ecran">Écran courant</p>
    </stp-app-shell>
  `
})
class HoteComponent {
  items = ITEMS;
  groupes = GROUPES;
  theme = signal<'light' | 'dark'>('light');
  visible = signal(true);
  carte = signal(false);
  themes = 0;
  deconnexions = 0;
}

describe('AppShellComponent', () => {
  async function afficher() {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    const fixture = TestBed.createComponent(HoteComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    return { fixture, racine: fixture.nativeElement as HTMLElement, hote: fixture.componentInstance };
  }

  afterEach(() => document.querySelectorAll('app-shell-test, ng-component').forEach((e) => e.remove()));

  it('projette le contenu dans la zone principale et nomme la navigation', async () => {
    const { racine } = await afficher();

    expect(racine.querySelector('main#contenu #ecran')?.textContent).toBe('Écran courant');
    expect(racine.querySelector('nav')?.getAttribute('aria-label')).toBe('Navigation principale');
    expect(Array.from(racine.querySelectorAll('.app-sidebar__link .app-sidebar__label')).map((e) => e.textContent?.trim())).toEqual([
      'Paie', 'Carte', 'Administration système', 'Utilisateurs', 'Journal'
    ]);
  });

  it("range les entrées d'un groupe sous un seul titre repliable", async () => {
    const { racine } = await afficher();

    expect(racine.querySelectorAll('details.app-sidebar__group')).toHaveLength(1);
    expect(racine.querySelectorAll('details .app-sidebar__link--child')).toHaveLength(2);
  });

  it("ouvre le groupe dont l'écran courant fait partie", async () => {
    const { fixture, racine } = await afficher();
    await TestBed.inject(Router).navigateByUrl('/admin/users');
    fixture.detectChanges();
    await fixture.whenStable();

    expect((racine.querySelector('details.app-sidebar__group') as HTMLDetailsElement).open).toBe(true);
  });

  it('ouvre le tiroir par le bouton de la barre du haut et le ferme avec Échap', async () => {
    const { fixture, racine } = await afficher();
    const bouton = racine.querySelector<HTMLButtonElement>('.app-topbar__menu') as HTMLButtonElement;

    bouton.click();
    fixture.detectChanges();
    expect(bouton.getAttribute('aria-expanded')).toBe('true');
    expect(racine.querySelector('.app-shell')?.classList).toContain('app-shell--menu-ouvert');

    racine.querySelector('.app-shell')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(bouton.getAttribute('aria-expanded')).toBe('false');
  });

  it('émet le changement de thème et la déconnexion', async () => {
    const { fixture, racine, hote } = await afficher();
    const actions = racine.querySelectorAll<HTMLButtonElement>('.app-sidebar__action');

    actions[0]?.click();
    actions[1]?.click();
    fixture.detectChanges();

    expect(hote.themes).toBe(1);
    expect(hote.deconnexions).toBe(1);
    expect(actions[0]?.getAttribute('aria-label')).toBe('Passer au thème sombre');
  });

  it("annonce le thème vers lequel on bascule", async () => {
    const { fixture, racine, hote } = await afficher();
    hote.theme.set('dark');
    fixture.detectChanges();

    expect(racine.querySelector('.app-sidebar__action')?.getAttribute('aria-label')).toBe('Passer au thème clair');
  });

  it("n'affiche ni rail ni barre du haut sur un écran public", async () => {
    const { fixture, racine, hote } = await afficher();
    hote.visible.set(false);
    fixture.detectChanges();

    expect(racine.querySelector('.app-sidebar')).toBeNull();
    expect(racine.querySelector('.app-shell--auth')).not.toBeNull();
    expect(racine.querySelector('main#contenu #ecran')).not.toBeNull();
  });

  it('propose le bouton de navigation en mode carte', async () => {
    const { fixture, racine, hote } = await afficher();
    expect(racine.querySelector('.app-carte-menu')).toBeNull();

    hote.carte.set(true);
    fixture.detectChanges();

    const bouton = racine.querySelector('.app-carte-menu') as HTMLButtonElement;
    expect(bouton.getAttribute('aria-label')).toBe('Ouvrir la navigation');
    expect(racine.querySelector('.app-shell--carte')).not.toBeNull();
  });
});
