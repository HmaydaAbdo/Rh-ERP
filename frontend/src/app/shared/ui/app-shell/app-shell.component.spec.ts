import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { DockEtatService } from '../dock/dock-etat.service';
import { AppShellComponent, ShellNavGroupe, ShellNavItem } from './app-shell.component';

const ITEMS: readonly ShellNavItem[] = [
  { label: 'Paie', icon: 'wallet', route: '/paie' },
  { label: 'Utilisateurs', icon: 'user-cog', route: '/admin/users', groupe: 'admin' }
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
      [assistantDisponible]="assistant()"
      [assistantOuvert]="false"
      (basculerTheme)="themes = themes + 1"
      (modeAssistant)="modes.push($event)"
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
  assistant = signal(true);
  modes: boolean[] = [];
  themes = 0;
  deconnexions = 0;
}

describe('AppShellComponent', () => {
  async function afficher() {
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', children: [] }])] });
    const fixture = TestBed.createComponent(HoteComponent);
    document.body.append(fixture.nativeElement);
    await fixture.whenStable();
    return { fixture, racine: fixture.nativeElement as HTMLElement, hote: fixture.componentInstance, dock: TestBed.inject(DockEtatService) };
  }

  afterEach(() => document.querySelectorAll('ng-component').forEach((e) => e.remove()));

  it('projette le contenu dans la zone principale, avec le lien d’évitement', async () => {
    const { racine } = await afficher();

    expect(racine.querySelector('main#contenu #ecran')?.textContent).toBe('Écran courant');
    expect(racine.querySelector('a.app-skip')).not.toBeNull();
    expect(racine.querySelector('.app-sidebar')).toBeNull();
  });

  it('renseigne la navigation unifiée : destinations, utilisateur, thème, assistant, accueil', async () => {
    const { fixture, hote, dock } = await afficher();
    expect(dock.items()).toEqual(ITEMS);
    expect(dock.groupes()).toEqual(GROUPES);
    expect(dock.utilisateur()).toBe('hmayda');
    expect(dock.theme()).toBe('light');
    expect(dock.assistantDisponible()).toBe(true);

    hote.theme.set('dark');
    hote.assistant.set(false);
    fixture.detectChanges();

    expect(dock.theme()).toBe('dark');
    expect(dock.assistantDisponible()).toBe(false);
    expect(dock.accueilActif()).toBe(false);
  });

  it('transmet les commandes de la barre : thème, assistant, déconnexion', async () => {
    const { fixture, hote, dock } = await afficher();

    dock.envoyer('theme');
    dock.envoyer('assistant-ouvrir');
    dock.envoyer('assistant-fermer');
    dock.envoyer('deconnexion');
    fixture.detectChanges();

    expect(hote.themes).toBe(1);
    expect(hote.modes).toEqual([true, false]);
    expect(hote.deconnexions).toBe(1);
  });

  it('referme la barre quand on choisit une destination', async () => {
    const { dock } = await afficher();
    dock.ouvert.set(true);

    await TestBed.inject(Router).navigateByUrl('/paie');

    expect(dock.ouvert()).toBe(false);
  });

  it('n’affiche pas le lien d’évitement sur un écran public', async () => {
    const { fixture, racine, hote } = await afficher();
    hote.visible.set(false);
    fixture.detectChanges();

    expect(racine.querySelector('a.app-skip')).toBeNull();
    expect(racine.querySelector('.app-shell--auth')).not.toBeNull();
    expect(racine.querySelector('main#contenu #ecran')).not.toBeNull();
  });
});
