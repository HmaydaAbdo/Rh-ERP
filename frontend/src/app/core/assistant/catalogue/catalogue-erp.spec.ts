import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CopilotA2UISurface } from '@copilotkit/angular/a2ui';

import { catalogueErp } from './catalogue-erp';
import { CHAMP_CATALOGUE_ERP } from './identifiant-catalogue';

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
  imports: [CopilotA2UISurface],
  template: `<copilot-a2ui-surface [operations]="operations" [catalog]="catalogue" />`
})
class HoteComponent {
  readonly operations = OPERATIONS;
  readonly catalogue = catalogueErp;
}

describe('catalogue ERP', () => {
  async function monter() {
    const fixture = TestBed.createComponent(HoteComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, page: fixture.nativeElement as HTMLElement };
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
    expect(page.querySelector('.meta')?.textContent).toContain('4');
    expect(Array.from(page.querySelectorAll('[role="columnheader"]')).map((c) => c.textContent?.trim())).toEqual([
      'Code',
      'Effectif',
      'Masse salariale'
    ]);
  });

  it('trie une colonne numérique par valeur décroissante au premier clic', async () => {
    const { fixture, page } = await monter();

    (page.querySelectorAll('[role="columnheader"]')[1] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.querySelectorAll('[role="columnheader"]')[1].getAttribute('aria-sort')).toBe('descending');
  });
});
