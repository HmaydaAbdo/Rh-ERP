import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { COPILOT_KIT_CONFIG, CopilotKit } from '@copilotkit/angular';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { ChantierReferenceService } from '../../../shared/reference-data/chantier-reference.service';
import { EquipeReferenceService } from '../../../shared/reference-data/equipe-reference.service';
import { FunctionReferenceService } from '../../../shared/reference-data/function-reference.service';
import { fournirPermissions } from '../../../shared/testing/ecrans';
import { EmployeeService } from '../services/employee.service';
import { EmployeeVuesComponent } from './employee-vues.component';

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: 'vue' })
class VueFactice {}

const REFERENTIEL = {
  fetchPage: () => of({ items: [], totalRecords: 0 }),
  fetchById: (id: number) => of({ id, code: 'C' + id, libelle: 'L' + id }),
};
const OUTIL = 'employes_regler_filtres';

describe('EmployeeVuesComponent : outil de l’agent (KAN-270)', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ version: '1.80.0', agents: {}, mode: 'sse' }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document
      .querySelectorAll('.cdk-overlay-container > *')
      .forEach((e) => e.remove());
  });

  async function monter(
    permissions: string[],
  ): Promise<{ harness: RouterTestingHarness; copilotKit: CopilotKit }> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'employees',
            component: EmployeeVuesComponent,
            children: [{ path: '', component: VueFactice }],
          },
          { path: 'ailleurs', component: VueFactice },
        ]),
        fournirPermissions(permissions).providers,
        {
          provide: COPILOT_KIT_CONFIG,
          useValue: { runtimeUrl: 'http://localhost/ia/copilotkit' },
        },
        { provide: EmployeeService, useValue: {} },
        { provide: FunctionReferenceService, useValue: REFERENTIEL },
        { provide: ChantierReferenceService, useValue: REFERENTIEL },
        { provide: EquipeReferenceService, useValue: REFERENTIEL },
      ],
    });
    return {
      harness: await RouterTestingHarness.create(),
      copilotKit: TestBed.inject(CopilotKit),
    };
  }

  it('enregistre l’outil avec la page et le retire quand on la quitte', async () => {
    const { harness, copilotKit } = await monter([
      'EMPLOYEE_READ',
      'IA_UTILISER',
    ]);

    await harness.navigateByUrl('/employees', EmployeeVuesComponent);
    expect(copilotKit.core.getTool({ toolName: OUTIL })).toBeDefined();

    await harness.navigateByUrl('/ailleurs');
    expect(copilotKit.core.getTool({ toolName: OUTIL })).toBeUndefined();
  });

  it('règle les filtres de l’URL quand l’agent appelle l’outil', async () => {
    const { harness, copilotKit } = await monter([
      'EMPLOYEE_READ',
      'IA_UTILISER',
    ]);
    const page = await harness.navigateByUrl(
      '/employees?statut=ACTIF',
      EmployeeVuesComponent,
    );

    await copilotKit.core
      .getTool({ toolName: OUTIL })
      ?.handler?.({ nom: 'ali', chantierIds: [3] }, {} as never);
    await harness.fixture.whenStable();

    expect(page['filtres']()).toMatchObject({
      nomPrenom: 'ali',
      chantierIds: [3],
      statut: 'ACTIF',
    });
  });

  it('n’enregistre rien sans le droit IA : la page ne touche pas à CopilotKit', async () => {
    const { harness, copilotKit } = await monter(['EMPLOYEE_READ']);

    await harness.navigateByUrl('/employees', EmployeeVuesComponent);

    expect(copilotKit.core.getTool({ toolName: OUTIL })).toBeUndefined();
  });
});
