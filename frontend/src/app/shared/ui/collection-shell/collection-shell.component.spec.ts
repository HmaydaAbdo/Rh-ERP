import { ChangeDetectionStrategy, Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TestBed } from '@angular/core/testing';

import { CollectionShellComponent, CollectionShellConfig } from './collection-shell.component';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager, template: 'contenu Cartes' })
class VueCartesFactice {}

@Component({
  standalone: true,
  imports: [CollectionShellComponent],
  template: `
    <app-collection-shell [configuration]="configuration" (outletActivated)="onActivate()">
      <button collection-actions type="button">Créer</button>
      <p collection-filters>Filtres métier</p>
    </app-collection-shell>
  `
})
class CoqueHote {
  activations = 0;
  onActivate(): void {
    this.activations += 1;
  }
  readonly configuration: CollectionShellConfig = {
    titre: 'Équipes',
    libelleVue: 'Vues des équipes',
    vues: [
      { libelle: 'Tabulaire', icone: 'table', lien: '/equipes' },
      { libelle: 'Cartes', icone: 'layout-grid', lien: '/equipes/cartes' },
      { libelle: 'Analytique', icone: 'chart-column', lien: '/equipes/analytique' }
    ]
  };
}

describe('CollectionShellComponent', () => {
  it('compose le titre, les vues, les slots projetés et active sa route enfant', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'equipes', component: CoqueHote, children: [
        { path: '', component: VueCartesFactice },
        { path: 'cartes', component: VueCartesFactice },
        { path: 'analytique', component: VueCartesFactice }
      ] }])]
    });
    const harness = await RouterTestingHarness.create();

    const hote = await harness.navigateByUrl('/equipes/cartes', CoqueHote);
    const page = harness.routeNativeElement as HTMLElement;

    expect(page.querySelector('h1')?.textContent).toBe('Équipes');
    expect(page.querySelector('nav[aria-label="Vues des équipes"] a.vue-switcher__lien--active')?.textContent?.trim()).toBe('Cartes');
    expect(page.querySelector('[collection-actions]')?.textContent?.trim()).toBe('Créer');
    expect(page.querySelector('[collection-filters]')?.textContent?.trim()).toBe('Filtres métier');
    expect(page.textContent).toContain('contenu Cartes');
    expect(hote.activations).toBe(1);
  });
});
