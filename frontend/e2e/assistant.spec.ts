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

/** Flux AG-UI tel que le runtime CopilotKit le relaie, en SSE : raisonnement, outil, surface A2UI et réponse. */
function flux(): string {
  const surface = {
    a2ui_operations: [
      { version: 'v0.9', createSurface: { surfaceId: 's1', catalogId: 'https://a2ui.org/specification/v0_9/basic_catalog.json' } },
      {
        version: 'v0.9',
        updateComponents: { surfaceId: 's1', components: [{ id: 'root', component: 'Text', text: 'Masse salariale 2026-08 : 4 800 MAD' }] }
      }
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
async function simulerRuntime(page: Page): Promise<{ autorisations: string[]; fils: string[]; autorisationsSuggestions: string[] }> {
  const vu = { autorisations: [] as string[], fils: [] as string[], autorisationsSuggestions: [] as string[] };
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
    } else if (url.endsWith('/agent/default/run')) {
      vu.autorisations.push(route.request().headers()['authorization'] ?? '');
      vu.fils.push((route.request().postDataJSON() as { threadId: string }).threadId);
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: flux() });
    } else {
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: '' });
    }
  });
  return vu;
}

test.describe('Staport Intelligence', () => {
  test('crée et remplace une conversation sans crypto.randomUUID, comme en HTTP public', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
    });
    const erreurs: string[] = [];
    page.on('pageerror', (erreur) => erreurs.push(erreur.message));
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    const runtime = await simulerRuntime(page);
    await page.goto('/paie');
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
    expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');

    await page.keyboard.press('Control+k');
    const assistant = page.getByRole('dialog', { name: 'Staport Intelligence' });
    const question = assistant.getByPlaceholder('Posez votre question…');
    await question.fill('Quelle est la masse salariale de 2026-08 ?');
    await question.press('Enter');
    await expect(assistant.getByText('La masse salariale de 2026-08 est de 4 800 MAD.')).toBeVisible();

    await assistant.getByRole('button', { name: 'Nouvelle conversation' }).click();
    await expect(assistant.getByText('La masse salariale de 2026-08 est de 4 800 MAD.')).toHaveCount(0);
    await question.fill('Quelle est la masse salariale de 2026-08 ?');
    await question.press('Enter');
    await expect(assistant.getByText('La masse salariale de 2026-08 est de 4 800 MAD.')).toBeVisible();

    expect(runtime.fils).toHaveLength(2);
    expect(new Set(runtime.fils).size).toBe(2);
    expect(runtime.autorisationsSuggestions.length).toBeGreaterThan(0);
    expect(runtime.autorisationsSuggestions.every((authorization) => authorization === 'Bearer jeton-test')).toBe(true);
    for (const fil of runtime.fils) {
      expect(fil).toMatch(/^u1-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(erreurs).toEqual([]);
  });

  test('répond avec raisonnement, consultation et surface A2UI composée', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    const runtime = await simulerRuntime(page);
    await page.goto('/paie');
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();

    await page.keyboard.press('Control+k');
    // Panneau flottant au-dessus de l'écran (mode overlay de CopilotKit) : une fenêtre de dialogue, la vue garde sa place.
    const assistant = page.getByRole('dialog', { name: 'Staport Intelligence' });
    // Le fil de l'utilisateur est fourni par l'application (repris au rechargement) : CopilotKit propose des questions
    // dynamiques à partir du contexte courant et des capacités accessibles.
    await expect(assistant.getByRole('button', { name: 'Masse salariale' })).toBeVisible();

    const question = assistant.getByPlaceholder('Posez votre question…');
    await question.fill('Quelle est la masse salariale de 2026-08 ?');
    await question.press('Enter');

    await expect(assistant.getByText('La masse salariale de 2026-08 est de 4 800 MAD.')).toBeVisible();
    await expect(assistant.getByText('Masse salariale 2026-08 : 4 800 MAD')).toBeVisible();
    // Pas de consultation d'outil en brut (nom technique) dans la discussion.
    await expect(assistant.getByText('paie_indicateurs')).toHaveCount(0);
    expect(runtime.autorisations).toEqual(['Bearer jeton-test']);

    const resultats = await new AxeBuilder({ page }).include('app-assistant').analyze();
    expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('occupe tout l’écran sur téléphone, sans défilement horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    await simulerRuntime(page);
    await page.goto('/paie');
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();

    await page.keyboard.press('Control+k');
    // Sur téléphone la barre devient une fenêtre modale.
    const assistant = page.getByRole('dialog', { name: 'Staport Intelligence' });
    await expect(assistant.getByPlaceholder('Posez votre question…')).toBeVisible();
    const largeur = await assistant.evaluate((e) => e.getBoundingClientRect().width);
    expect(largeur).toBe(390);
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debordement).toBeLessThanOrEqual(0);
  });

  test('n’apparaît pas sans le droit IA_UTILISER', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: ['PAIE_READ'] }, routes());
    await page.goto('/paie');
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.locator('app-assistant')).toHaveCount(0);
  });
});
