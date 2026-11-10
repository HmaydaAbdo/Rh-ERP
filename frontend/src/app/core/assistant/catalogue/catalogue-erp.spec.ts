import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { catalogueErp } from './catalogue-erp';
import { CHAMP_CATALOGUE_ERP } from './identifiant-catalogue';
import { SurfaceA2uiErpComponent } from './surface-a2ui-erp.component';

const LIGNES = [
  { code: 'CH1', effectif: 10, masse: 1000 },
  { code: 'CH2', effectif: 30, masse: 3000 },
  { code: 'CH3', effectif: 20, masse: 2000 },
  { code: 'CH4', effectif: 5, masse: 500 }
];

const OPERATIONS = [
  { version: 'v0.9', createSurface: { surfaceId: 's1', catalogId: CHAMP_CATALOGUE_ERP } },
  {
    version: 'v0.9',
    updateComponents: {
      surfaceId: 's1',
      components: [
        {
          id: 'root',
          component: 'DataTable',
          title: 'Chantiers',
          columns: [
            { key: 'code', label: 'Code', format: 'texte' },
            { key: 'effectif', label: 'Effectif', format: 'nombre', bar: true },
            { key: 'masse', label: 'Masse salariale', format: 'montant' }
          ],
          rows: { path: '/lignes' }
        }
      ]
    }
  },
  { version: 'v0.9', updateDataModel: { surfaceId: 's1', path: '/', value: { lignes: LIGNES } } }
];

@Component({
  imports: [SurfaceA2uiErpComponent],
  template: `<app-a2ui-surface-erp [operations]="operations" (action)="actions.push($event)" (error)="erreurs.push($event.message)" />`
})
class HoteComponent {
  operations: readonly unknown[] = OPERATIONS;
  actions: unknown[] = [];
  erreurs: string[] = [];
}

describe('catalogue ERP', () => {
  async function monter(operations?: readonly unknown[]) {
    const fixture = TestBed.createComponent(HoteComponent);
    if (operations) {
      fixture.componentInstance.operations = operations;
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, hote: fixture.componentInstance, page: fixture.nativeElement as HTMLElement };
  }

  it('annonce le catalogue de l’ERP avec les composants de base et les siens', () => {
    expect(catalogueErp.id).toBe(CHAMP_CATALOGUE_ERP);
    for (const nom of ['Text', 'Column', 'DataTable', 'KpiGrid', 'Chart']) {
      expect(catalogueErp.components.has(nom)).toBe(true);
    }
  });

  it('rend un tableau dont les lignes viennent du modèle de données de la surface', async () => {
    const { page } = await monter();

    expect(page.querySelector('h3')?.textContent).toContain('Chantiers');
    expect(page.querySelector('.app-datagrid__meta')?.textContent).toContain('4');
    expect(Array.from(page.querySelectorAll('[role="columnheader"]')).map((c) => c.textContent?.trim())).toEqual([
      'Code',
      'Effectif',
      'Masse salariale'
    ]);
  });

  it('trie une colonne numérique par valeur décroissante au premier clic', async () => {
    const { fixture, page } = await monter();

    (page.querySelectorAll('[role="columnheader"] button')[1] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('[role="columnheader"]')[1].getAttribute('aria-sort')).toBe('descending');
  });

  const surface = (composants: unknown[], donnees: unknown = {}) => [
    { version: 'v0.9', createSurface: { surfaceId: 's2', catalogId: CHAMP_CATALOGUE_ERP } },
    { version: 'v0.9', updateComponents: { surfaceId: 's2', components: composants } },
    { version: 'v0.9', updateDataModel: { surfaceId: 's2', path: '/', value: donnees } }
  ];

  it('rend une grille d’indicateurs', async () => {
    const { page } = await monter(
      surface([{ id: 'root', component: 'KpiGrid', items: [{ label: 'Masse salariale', value: '4 800 MAD', detail: 'Août 2026', tone: 'positif' }] }])
    );

    expect(page.querySelector('.app-kpi span')?.textContent).toBe('Masse salariale');
    expect(page.querySelector('.app-kpi strong')?.textContent).toBe('4 800 MAD');
    expect(page.querySelector('.app-kpi--positive')).not.toBeNull();
  });

  it('rend un graphique avec son titre accessible', async () => {
    const { page } = await monter(
      surface([
        { id: 'root', component: 'Chart', title: 'Masse par chantier', type: 'bar', labels: ['C1', 'C2'], series: [{ name: 'Masse', values: [10, 20] }] }
      ])
    );

    expect(page.querySelector('h3')?.textContent).toContain('Masse par chantier');
    expect(page.querySelector('stp-chart')).not.toBeNull();
  });

  it('rend une frise chronologique : événements dans l’ordre reçu, ton inconnu en neutre', async () => {
    const { page } = await monter(
      surface([
        {
          id: 'root',
          component: 'Timeline',
          title: 'Parcours',
          items: [
            { date: '2019-02-06', title: 'Embauche', detail: 'ACHETEUR PDR', tone: 'positif' },
            { date: '2026-08', title: 'Paie', tone: 'inconnu' }
          ]
        }
      ])
    );

    const evenements = Array.from(page.querySelectorAll('.app-timeline__item'));
    expect(evenements.map((e) => e.querySelector('strong')?.textContent)).toEqual(['Embauche', 'Paie']);
    expect(evenements[0].classList.contains('app-timeline__item--positive')).toBe(true);
    expect(evenements[1].className).toBe('app-timeline__item');
  });

  it('renvoie à l’agent l’action déclenchée par l’utilisateur', async () => {
    const { fixture, hote, page } = await monter(
      surface([
        { id: 'root', component: 'Button', child: 'libelle', action: { event: { name: 'ouvrir', context: { chantier: 'C168' } } } },
        { id: 'libelle', component: 'Text', text: 'Ouvrir C168' }
      ])
    );

    (page.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(hote.actions).toHaveLength(1);
    expect(JSON.stringify(hote.actions[0])).toContain('ouvrir');
  });

  it('affiche un repli lisible, sans casser le fil, quand les opérations sont invalides', async () => {
    const { page, hote } = await monter([{ version: 'v0.9', updateComponents: { surfaceId: 'absente', components: [{ id: 'root', component: 'Inconnu' }] } }]);

    expect(page.querySelector('[role="alert"]')?.textContent).toContain("n'a pas pu être affichée");
    expect(hote.erreurs).toHaveLength(1);
  });
});
