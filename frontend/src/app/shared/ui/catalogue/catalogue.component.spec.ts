import { TestBed } from '@angular/core/testing';

import { fournirSignalForms } from '../../forms/signal-forms.config';
import { CatalogueComponent } from './catalogue.component';

describe('CatalogueComponent', () => {
  function afficher() {
    TestBed.configureTestingModule({ providers: [fournirSignalForms()] });
    const fixture = TestBed.createComponent(CatalogueComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => document.querySelectorAll('.cdk-overlay-container > *').forEach((e) => e.remove()));

  it('montre chaque composant du kit dans sa section', () => {
    const { page } = afficher();

    expect(page.querySelector('h1')?.textContent).toBe('Catalogue Staport');
    expect(Array.from(page.querySelectorAll('h2')).map((h) => h.textContent)).toEqual([
      'Boutons', 'Pastilles', 'Champs', 'Messages et icônes', 'Dialogue', 'Graphique', 'Tableau (mode mémoire)'
    ]);
  });

  it('laisse le repère principal à la coque applicative', () => {
    const { page } = afficher();

    expect(page.querySelector('main')).toBeNull();
  });

  it('montre les sélecteurs avec leur valeur de départ, reliée à Signal Forms', () => {
    const { page } = afficher();

    expect(page.textContent).toContain('Valeurs : 2 / 1,3 /');
    expect((page.querySelector('input[aria-label="Chantier"]') as HTMLInputElement).value).toBe('Chantier Casablanca');
    expect((page.querySelector('input[aria-label="Chantiers"]') as HTMLInputElement).value).toBe('2 chantiers');
  });

  it('ouvre le dialogue de démonstration', async () => {
    const { fixture, page } = afficher();

    (Array.from(page.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ouvrir') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Résultat de l'import");
  });

  it('affiche le tableau de démonstration paginé en mémoire', () => {
    const { page } = afficher();

    expect(page.querySelectorAll('tbody tr')).toHaveLength(10);
    expect(page.querySelector('.stp-table__report')?.textContent?.trim()).toBe('1 - 10 sur 27 — page 1/3');
  });

  it('mémorise la dernière action du menu', () => {
    const { page } = afficher();

    expect(page.textContent).toContain('Dernière action :');
  });
});
