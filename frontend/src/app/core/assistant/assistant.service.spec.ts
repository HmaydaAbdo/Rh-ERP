import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type CanActivateFn } from '@angular/router';
import type { AgentSubscriber } from '@ag-ui/client';
import { of } from 'rxjs';

import { AuthService } from '../auth/services/auth.service';
import { AssistantService, FABRIQUE_AGENT_IA, type AgentIa, type FabriqueAgentIa } from './assistant.service';

@Component({ selector: 'app-vide', template: '<span>1 250 000,50 MAD</span>' })
class VideComponent {}

type Evenement = Record<string, unknown> & { type: string };

const VUE = { module: 'paie', vue: 'analytique', parametres: { periode: '2026-09', chantierIds: '12' } };

function reponse(vue: unknown = VUE, abstention = false, texte = 'En 2026-09 : masse 1 250 000,50 MAD pour 412 bulletins.'): Evenement[] {
  return [
    { type: 'RUN_STARTED' },
    { type: 'CUSTOM', name: 'com.staport.mascot.state.v1', value: { mood: 'thinking' } },
    { type: 'STEP_STARTED', stepName: 'preparer' },
    { type: 'STEP_STARTED', stepName: 'executer' },
    { type: 'TOOL_CALL_START', toolCallName: 'paie_indicateurs' },
    { type: 'STEP_STARTED', stepName: 'conclure' },
    { type: 'TEXT_MESSAGE_CONTENT', delta: texte },
    { type: 'CUSTOM', name: 'com.staport.answer.v1', value: { abstention, motif: abstention ? 'SANS_DONNEES' : null, vue } },
    { type: 'RUN_FINISHED' }
  ];
}

/** Agent AG-UI simulé : rejoue des événements, ou échoue comme le client officiel (erreur HTTP avec `status`). */
class AgentSimule implements AgentIa {
  arrete = false;
  constructor(
    private readonly evenements: Evenement[],
    private readonly echec?: { status: number }
  ) {}

  async runAgent(_p: { runId: string }, abonne: AgentSubscriber): Promise<unknown> {
    if (this.echec) {
      throw Object.assign(new Error(`HTTP ${this.echec.status}`), this.echec);
    }
    for (const event of this.evenements) {
      if (this.arrete) {
        throw new Error('abandon');
      }
      await abonne.onEvent?.({ event } as never);
      await Promise.resolve();
    }
    return {};
  }

  abortRun(): void {
    this.arrete = true;
  }
}

describe('AssistantService', () => {
  let agents: AgentSimule[];
  let refresh: ReturnType<typeof vi.fn>;

  function configurer(fabriquer: () => AgentSimule, garde: CanActivateFn = () => true) {
    agents = [];
    refresh = vi.fn(() => of({}));
    const fabrique: FabriqueAgentIa = () => {
      const agent = fabriquer();
      agents.push(agent);
      return agent;
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'employees', component: VideComponent },
          { path: 'paie/analytique', component: VideComponent, canActivate: [garde] }
        ]),
        { provide: FABRIQUE_AGENT_IA, useValue: fabrique },
        { provide: AuthService, useValue: { getAccessToken: () => 'jeton', refreshOnce: refresh, hasPermission: () => true } }
      ]
    });
    return TestBed.inject(AssistantService);
  }

  it('suit les étapes et les outils, puis ouvre la vue de la réponse avec ses filtres', async () => {
    const service = configurer(() => new AgentSimule(reponse()));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/employees');

    await service.demander('Masse salariale du chantier C-12 en 2026-09 ?');

    const [echange] = service.echanges();
    expect(echange.etat).toBe('reponse');
    expect(echange.etapes.map((e) => [e.nom, e.terminee])).toEqual([
      ['preparer', true],
      ['executer', true],
      ['conclure', true]
    ]);
    expect(echange.outils).toEqual(['paie_indicateurs']);
    expect(echange.chiffres).toEqual(['1250000.5', '412']);
    expect(router.url).toBe('/paie/analytique?periode=2026-09&chantierIds=12');
    expect(echange.ouverture).toMatchObject({ statut: 'ouverte', urlPrecedente: '/employees' });
    expect(echange.ouverture?.cible.filtres).toEqual(['Période 2026-09', '1 chantier']);
    expect(service.humeur()).toBe('found');

    await service.revenir(echange);
    expect(router.url).toBe('/employees');
  });

  it('n’ouvre rien sur une abstention, ni pour une vue hors liste blanche', async () => {
    const service = configurer(() => new AgentSimule(reponse(VUE, true, 'Je n’ai pas cette donnée.')));
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/employees');

    await service.demander('Quel temps fera-t-il ?');
    expect(service.echanges()[0].etat).toBe('abstention');
    expect(service.echanges()[0].ouverture).toBeNull();
    expect(router.url).toBe('/employees');
  });

  it('signale une vue refusée par une garde de route, sans quitter l’écran', async () => {
    const service = configurer(() => new AgentSimule(reponse()), () => false);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/employees');

    await service.demander('Masse ?');
    expect(service.echanges()[0].ouverture?.statut).toBe('refusee');
    expect(router.url).toBe('/employees');
  });

  it('rafraîchit le jeton une fois sur un 401 avant tout événement, puis réessaie', async () => {
    let appel = 0;
    const service = configurer(() => (appel++ === 0 ? new AgentSimule([], { status: 401 }) : new AgentSimule(reponse(null))));

    await service.demander('Masse ?');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(agents.length).toBe(2);
    expect(service.echanges()[0].etat).toBe('reponse');
  });

  it('affiche une erreur générique si le service répond RUN_ERROR ou reste injoignable', async () => {
    const service = configurer(() => new AgentSimule([{ type: 'RUN_STARTED' }, { type: 'RUN_ERROR', message: 'détail' }]));
    await service.demander('Masse ?');
    expect(service.echanges()[0].etat).toBe('erreur');
    expect(service.echanges()[0].texte).toContain('momentanément indisponible');
    expect(service.humeur()).toBe('apologetic');
  });

  it('s’arrête aussitôt à la demande et ignore les événements tardifs', async () => {
    const service = configurer(() => new AgentSimule(reponse()));
    const run = service.demander('Masse ?');
    service.arreter();
    await run;

    expect(service.echanges()[0].etat).toBe('arrete');
    expect(service.echanges()[0].ouverture).toBeNull();
    expect(agents[0].arrete).toBe(true);
    expect(service.enCours()).toBe(false);
  });

  it('refuse une question vide ou trop longue et repart d’un fil vide', async () => {
    const service = configurer(() => new AgentSimule(reponse(null)));
    await service.demander('   ');
    await service.demander('x'.repeat(2001));
    expect(service.echanges().length).toBe(0);

    await service.demander('Masse ?');
    service.nouvelleDiscussion();
    expect(service.echanges().length).toBe(0);
  });
});
