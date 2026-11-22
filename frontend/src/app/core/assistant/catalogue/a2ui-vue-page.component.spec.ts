import type { MockedObject } from 'vitest';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationService } from '@shared/ui/feedback/feedback.service';
import { of } from 'rxjs';

import { Page } from '../../../shared/models/page.model';
import { Paie } from '../../../portail/paie/models/paie.model';
import { PaieService } from '../../../portail/paie/services/paie.service';
import { catalogueErp } from './catalogue-erp';
import { CHAMP_CATALOGUE_ERP } from './identifiant-catalogue';
import { SurfaceA2uiErpComponent } from './surface-a2ui-erp.component';

@Component({
  imports: [SurfaceA2uiErpComponent],
  template: `<app-a2ui-surface-erp [operations]="operations" (error)="erreurs.push($event.message)" />`
})
class HoteComponent {
  operations: readonly unknown[] = [];
  erreurs: string[] = [];
}

const surface = (id: string, composant: Record<string, unknown>) => [
  { version: 'v0.9', createSurface: { surfaceId: id, catalogId: CHAMP_CATALOGUE_ERP } },
  { version: 'v0.9', updateComponents: { surfaceId: id, components: [{ id: 'root', component: 'VuePage', ...composant }] } }
];

describe('VuePage du catalogue ERP (KAN-307)', () => {
  let service: MockedObject<PaieService>;

  beforeEach(() => {
    service = {
      search: vi.fn().mockName('PaieService.search'),
      listerPeriodes: vi.fn().mockName('PaieService.listerPeriodes')
    } as unknown as MockedObject<PaieService>;
    service.search.mockReturnValue(of({ content: [], page: { size: 10, number: 0, totalElements: 162, totalPages: 17 } } as Page<Paie>));
    service.listerPeriodes.mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        NotificationService,
        { provide: PaieService, useValue: service }
      ]
    });
  });

  async function monter(operations: readonly unknown[]) {
    const fixture = TestBed.createComponent(HoteComponent);
    fixture.componentInstance.operations = operations;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { hote: fixture.componentInstance, page: fixture.nativeElement as HTMLElement };
  }

  it('est annoncée à l’agent avec les composants du catalogue', () => {
    expect(catalogueErp.components.has('VuePage')).toBe(true);
  });

  it('monte la vue de la paie réglée sur les filtres de départ posés par l’agent', async () => {
    const { page } = await monter(surface('v1', { domaine: 'paie', vue: 'tabulaire', parametres: { periode: '2026-10', nom: 'NADOR' } }));

    expect(page.querySelector('app-paie-vue-integree app-paie-filtres')).not.toBeNull();
    expect(page.querySelector('app-paie-vue-integree app-paie-list')).not.toBeNull();
    expect(vi.mocked(service.search).mock.calls[0][0]).toEqual(expect.objectContaining({ periode: '2026-10', nomPrenom: 'NADOR' }));
  });

  it.each([
    ['cartes', 'app-paie-cartes'],
    ['analytique', 'app-paie-analytique']
  ])('monte la vue de départ demandée par l’agent : %s (KAN-308)', async (vue, element) => {
    const { page } = await monter(surface(`v-${vue}`, { domaine: 'paie', vue, parametres: { periode: '2026-10' } }));

    expect(page.querySelector(`app-paie-vue-integree ${element}`)).not.toBeNull();
    expect(page.querySelector('app-paie-vue-integree app-paie-list')).toBeNull();
    expect(page.querySelector('app-paie-vue-integree app-vue-switcher button[aria-current="page"]')).not.toBeNull();
  });

  it('refuse une vue que le catalogue ne connaît pas', async () => {
    const { page, hote } = await monter(surface('v3', { domaine: 'paie', vue: 'secrete' }));

    expect(page.querySelector('app-paie-vue-integree')).toBeNull();
    expect(hote.erreurs).toHaveLength(1);
  });

  it('refuse un domaine que le catalogue ne connaît pas', async () => {
    const { page, hote } = await monter(surface('v2', { domaine: 'secret', vue: 'tabulaire' }));

    expect(page.querySelector('app-paie-vue-integree')).toBeNull();
    expect(hote.erreurs).toHaveLength(1);
  });
});
