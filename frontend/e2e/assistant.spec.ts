import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['IA_UTILISER', 'PAIE_READ', 'CHANTIER_READ', 'EQUIPE_READ', 'FUNCTION_READ'];

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

function routes() {
  return {
    'POST /paie/search': () => pageDe([]),
    'GET /paie/periodes': () => PERIODES,
    'POST /paie/periodes/search': () => PERIODES,
    'POST /paie/chantiers/search': () => [],
    'GET /paie/chantiers': () => [],
    'POST /paie/options/chantiers': () => pageDe([{ id: 3, code: 'C168', designation: 'Nador', actif: true }]),
    'POST /paie/options/equipes': () => pageDe([]),
    'GET /paie/materiel': () => [],
    'POST /paie/analytique': () => ANALYTIQUE,
    'POST /chantiers/search': () => pageDe([]),
    'POST /equipes/search': () => pageDe([]),
    'POST /functions/search': () => pageDe([])
  };
}

/** Flux AG-UI tel que le service IA l'émet (ag-ui-langgraph), en SSE. */
function flux(): string {
  const evenements = [
    { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
    { type: 'CUSTOM', name: 'com.staport.mascot.state.v1', value: { sequence: 1, mood: 'thinking', action: 'idle' } },
    { type: 'STEP_STARTED', stepName: 'preparer' },
    { type: 'STEP_FINISHED', stepName: 'preparer' },
    { type: 'STEP_STARTED', stepName: 'executer' },
    { type: 'TOOL_CALL_START', toolCallId: 'a1', toolCallName: 'paie_indicateurs', parentMessageId: 'a1' },
    { type: 'TOOL_CALL_ARGS', toolCallId: 'a1', delta: '{"periode":"2026-08"}' },
    { type: 'TOOL_CALL_END', toolCallId: 'a1' },
    { type: 'STEP_FINISHED', stepName: 'executer' },
    { type: 'STEP_STARTED', stepName: 'conclure' },
    { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
    { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'La masse salariale de 2026-08 est de 4 800 MAD.' },
    { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
    {
      type: 'CUSTOM',
      name: 'com.staport.answer.v1',
      value: { abstention: false, motif: null, vue: { module: 'paie', vue: 'analytique', parametres: { periode: '2026-08' } } }
    },
    { type: 'CUSTOM', name: 'com.staport.mascot.state.v1', value: { sequence: 2, mood: 'neutral', action: 'idle' } },
    { type: 'STEP_FINISHED', stepName: 'conclure' },
    { type: 'RUN_FINISHED', threadId: 't', runId: 'r' }
  ];
  return evenements.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

async function simulerAgent(page: Page): Promise<{ autorisations: string[] }> {
  const vu = { autorisations: [] as string[] };
  await page.route('**/ia/agui', async (route) => {
    vu.autorisations.push(route.request().headers()['authorization'] ?? '');
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: flux() });
  });
  return vu;
}

test.describe('Assistant RH', () => {
  test('répond, ouvre la vue filtrée, surligne la valeur citée et permet de revenir', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    const agent = await simulerAgent(page);
    await page.goto('/paie');
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();

    const question = page.getByLabel('Question pour l’assistant');
    await question.fill('Quelle est la masse salariale de 2026-08 ?');
    await question.press('Enter');

    await expect(page).toHaveURL(/\/paie\/analytique\?periode=2026-08$/);
    const assistant = page.getByRole('region', { name: 'Assistant RH' });
    await expect(assistant.getByText('Chiffres vérifiés sur les données de l’ERP')).toBeVisible();
    await expect(assistant.getByText('La masse salariale de 2026-08 est de 4 800 MAD.')).toBeVisible();
    await expect(assistant.getByText('Paie · Analytique')).toBeVisible();
    await expect(assistant.getByRole('button', { name: /étapes · 1 outil/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#contenu .assistant-cite').first()).toBeVisible();
    expect(agent.autorisations).toEqual(['Bearer jeton-test']);

    const resultats = await new AxeBuilder({ page }).include('app-assistant').analyze();
    expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

    await assistant.getByRole('button', { name: 'Revenir à l’écran précédent' }).click();
    await expect(page).toHaveURL(/\/paie$/);
  });

  test('n’apparaît pas sans le droit IA_UTILISER', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: ['PAIE_READ'] }, routes());
    await page.goto('/paie');
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Assistant RH' })).toHaveCount(0);
  });
});
