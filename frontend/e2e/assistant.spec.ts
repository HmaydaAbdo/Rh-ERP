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

/** Flux AG-UI tel que le runtime CopilotKit le relaie, en SSE : raisonnement, outil, surface A2UI, réponse vérifiée. */
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
    { type: 'STATE_SNAPSHOT', snapshot: { verification: 'en_cours' } },
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
    { type: 'STATE_SNAPSHOT', snapshot: { verification: 'verifiee' } },
    { type: 'RUN_FINISHED', threadId: 't', runId: 'r' }
  ];
  return evenements.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
}

/** Le runtime CopilotKit simulé : sa description (`/info`, A2UI actif) et le run de l'agent ; le reste répond vide. */
async function simulerRuntime(page: Page): Promise<{ autorisations: string[] }> {
  const vu = { autorisations: [] as string[] };
  await page.route('**/ia/copilotkit/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/info')) {
      await route.fulfill({
        json: { version: '1.80.0', agents: { default: { name: 'default', description: '' } }, mode: 'sse', a2uiEnabled: true, a2ui: { enabled: true } }
      });
    } else if (url.endsWith('/agent/default/run')) {
      vu.autorisations.push(route.request().headers()['authorization'] ?? '');
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: flux() });
    } else {
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: '' });
    }
  });
  return vu;
}

test.describe('Assistant RH', () => {
  test('répond avec raisonnement, consultation et surface A2UI composée', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    const runtime = await simulerRuntime(page);
    await page.goto('/paie');
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();

    await page.keyboard.press('Control+k');
    const assistant = page.locator('aside.copilot-sidebar-window');
    await expect(assistant.getByText('Que voulez-vous savoir')).toBeVisible();
    // Questions proposées selon l'écran ouvert (la paie).
    await expect(assistant.getByRole('button', { name: 'Masse salariale' })).toBeVisible();

    const question = assistant.getByPlaceholder('Posez votre question…');
    await question.fill('Quelle est la masse salariale de 2026-08 ?');
    await question.press('Enter');

    await expect(assistant.getByText('La masse salariale de 2026-08 est de 4 800 MAD.')).toBeVisible();
    await expect(assistant.getByText('Masse salariale 2026-08 : 4 800 MAD')).toBeVisible();
    await expect(assistant.getByText('paie_indicateurs')).toBeVisible();
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
    const assistant = page.getByRole('dialog', { name: 'Assistant RH' });
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
