import type { Page, Route } from '@playwright/test';

import { page as pageDe } from './api-mock';

export const DROITS = ['IA_UTILISER', 'PAIE_READ', 'CHANTIER_READ', 'EQUIPE_READ', 'FUNCTION_READ'];

const PERIODES = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4800, stc: 0 }];
const ANALYTIQUE = {
  periode: '2026-08',
  kpis: { masse: 4800, effectif: 1, coutMoyen: 4800, nombreChantiers: 1, stc: 0 },
  moisPrecedent: null,
  parChantier: [{ id: 3, code: 'C168', libelle: 'Nador', masse: 4800, effectif: 1, stc: 0 }],
  parFonction: [{ id: 2, libelle: 'CH. CAMION', masse: 4800, effectif: 1, stc: 0, stcMontant: 0 }],
  tranches: [{ min: 0, max: null, effectif: 1 }],
  evolution: [{ periode: '2026-08', masse: 4800, effectif: 1 }],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};

export function routes() {
  return {
    'POST /paie/search': () => pageDe([]),
    'GET /paie/periodes': () => PERIODES,
    'POST /paie/periodes/search': () => PERIODES,
    'POST /paie/chantiers/search': () => [],
    'GET /paie/chantiers': () => [],
    'POST /paie/options/chantiers': () => pageDe([{ id: 3, code: 'C168', designation: 'Nador', actif: true }]),
    'POST /paie/options/equipes': () => pageDe([]),
    'GET /paie/materiel': () => [],
    'GET /paie/materiel/valeurs': () => [],
    'POST /paie/analytique': () => ANALYTIQUE,
    'POST /chantiers/search': () => pageDe([]),
    'POST /equipes/search': () => pageDe([]),
    'POST /functions/search': () => pageDe([])
  };
}

/** Flux AG-UI tel que le runtime CopilotKit le relaie, en SSE : raisonnement, outil, surface A2UI et réponse. */
function flux(): string {
  // Surface telle que l'agent la produit : catalogue de l'ERP, données dans le modèle de la surface (`{ path }`).
  const surface = {
    a2ui_operations: [
      { version: 'v0.9', createSurface: { surfaceId: 's1', catalogId: 'staport-intelligence://a2ui/catalogue-erp' } },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 's1',
          components: [
            { id: 'root', component: 'Column', children: ['titre', 'kpis', 'tableau', 'graphique'] },
            { id: 'titre', component: 'Text', text: 'Masse salariale 2026-08 : 4 800 MAD' },
            { id: 'kpis', component: 'KpiGrid', items: [{ label: 'Masse salariale', value: '4 800 MAD', detail: 'Août 2026' }] },
            {
              id: 'tableau',
              component: 'DataTable',
              title: 'Chantiers',
              columns: [
                { key: 'code', label: 'Code', format: 'texte' },
                { key: 'masse', label: 'Masse', format: 'montant' }
              ],
              rows: { path: '/lignes' }
            },
            { id: 'graphique', component: 'Chart', title: 'Masse par chantier', type: 'bar', labels: ['C168'], series: [{ name: 'Masse', values: [4800] }] }
          ]
        }
      },
      { version: 'v0.9', updateDataModel: { surfaceId: 's1', path: '/', value: { lignes: [{ code: 'C168', masse: 4800 }] } } }
    ]
  };
  const evenements = [
    { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
    { type: 'REASONING_START', messageId: 'p1' },
    { type: 'REASONING_MESSAGE_START', messageId: 'p1', role: 'reasoning' },
    { type: 'REASONING_MESSAGE_CONTENT', messageId: 'p1', delta: 'Je consulte les indicateurs de paie.' },
    { type: 'REASONING_MESSAGE_END', messageId: 'p1' },
    { type: 'REASONING_END', messageId: 'p1' },
    { type: 'TOOL_CALL_START', toolCallId: 'a1', toolCallName: 'paie_indicateurs', parentMessageId: 'a1' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'a1', delta: '{"periode":"2026-08"}' },
    { type: 'TOOL_CALL_END', toolCallId: 'a1' },
    { type: 'TOOL_CALL_RESULT', messageId: 'r1', toolCallId: 'a1', role: 'tool', content: '{"masse":4800}' },
    { type: 'ACTIVITY_SNAPSHOT', messageId: 'a2ui-surface-a2', activityType: 'a2ui-surface', content: surface, replace: true },
    { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'La masse salariale de 2026-08 est de 4 800 MAD.' },
    { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
    { type: 'RUN_FINISHED', threadId: 't', runId: 'r' }
  ];
  return evenements.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

/** Le runtime CopilotKit simulé : suggestions sans état et authentifiées, runs de l'agent, A2UI et autorisations. */
export interface RuntimeVu {
  autorisations: string[];
  fils: string[];
  connexions: string[];
  autorisationsSuggestions: string[];
  arrets: string[];
}

export async function simulerRuntime(
  page: Page,
  options: { run?: (route: Route) => Promise<void> } = {}
): Promise<RuntimeVu> {
  const vu: RuntimeVu = { autorisations: [], fils: [], connexions: [], autorisationsSuggestions: [], arrets: [] };
  // Titres français des outils (KAN-87) : lus du serveur MCP par le service IA, suivant les droits de l'utilisateur.
  await page.route('**/ia/outils', (route) =>
    route.fulfill({ json: [{ name: 'paie_indicateurs', title: 'Indicateurs de paie d’un mois', domain: 'Paie' }] })
  );
  await page.route('**/ia/copilotkit/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/info')) {
      await route.fulfill({
        json: { version: '1.80.0', agents: { default: { name: 'default', description: '' } }, mode: 'sse', suggestions: true, a2uiEnabled: true, a2ui: { enabled: true } }
      });
    } else if (url.endsWith('/agent/default/suggest')) {
      vu.autorisationsSuggestions.push(route.request().headers()['authorization'] ?? '');
      const evenements = [
        { type: 'RUN_STARTED', threadId: 'suggestion', runId: 'suggestion-run' },
        { type: 'TOOL_CALL_START', toolCallId: 'suggestion-call', toolCallName: 'copilotkitSuggest', parentMessageId: 'suggestion-message' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'suggestion-call', delta: JSON.stringify({ suggestions: [{ title: 'Masse salariale', message: 'Quelle est la masse salariale du dernier mois ?' }] }) },
        { type: 'TOOL_CALL_END', toolCallId: 'suggestion-call' },
        { type: 'RUN_FINISHED', threadId: 'suggestion', runId: 'suggestion-run' }
      ];
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: evenements.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
      });
    } else if (url.endsWith('/agent/default/connect')) {
      vu.connexions.push((route.request().postDataJSON() as { threadId: string }).threadId);
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: '' });
    } else if (url.endsWith('/agent/default/run')) {
      vu.autorisations.push(route.request().headers()['authorization'] ?? '');
      vu.fils.push((route.request().postDataJSON() as { threadId: string }).threadId);
      if (options.run) {
        await options.run(route);
      } else {
        await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: flux() });
      }
    } else if (url.includes('/agent/default/stop/')) {
      vu.arrets.push(url);
      await route.fulfill({ status: 200, json: { stopped: true } });
    } else {
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: '' });
    }
  });
  return vu;
}
