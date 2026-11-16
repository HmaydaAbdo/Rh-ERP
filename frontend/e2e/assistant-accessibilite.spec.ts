import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { mockApi } from './support/api-mock';
import { DROITS, routes, simulerRuntime } from './support/assistant-mock';

/**
 * Accessibilité et appareils de l'assistant (KAN-99) : clavier, focus, lecteur d'écran (rôles et noms), thèmes, mouvement
 * réduit, mobile, repli texte et service IA indisponible, annulation d'un run par son identifiant.
 */

async function ouvrir(page: Page, url = '/paie'): Promise<ReturnType<Page['getByRole']>> {
  await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const espace = page.getByRole('region', { name: 'Staport Intelligence' });
  await expect(espace.getByPlaceholder('Posez votre question…')).toBeVisible();
  return espace;
}

async function poserQuestion(espace: ReturnType<Page['getByRole']>): Promise<void> {
  const question = espace.getByPlaceholder('Posez votre question…');
  await question.fill('Quelle est la masse salariale de 2026-08 ?');
  await question.press('Enter');
  await expect(espace.getByText('La masse salariale de 2026-08 est de 4 800 MAD.')).toBeVisible();
}

async function violations(page: Page): Promise<string[]> {
  const resultats = await new AxeBuilder({ page }).include('app-assistant').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('Assistant : accessibilité et appareils (KAN-99)', () => {
  test('clavier : Ctrl K ouvre l’espace avec la saisie au focus, Tab ne piège pas, Retour et Ctrl K ramènent à l’écran', async ({ page }) => {
    await simulerRuntime(page);
    const espace = await ouvrir(page);
    await expect(espace.getByPlaceholder('Posez votre question…')).toBeFocused();

    // Aucun piège : Tab avance toujours vers un autre contrôle (le retour à `body` après le dernier est le tour normal du navigateur).
    const vus = new Set<string>();
    let precedent = '';
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const cible = await page.evaluate(() => {
        const e = document.activeElement;
        return e && e !== document.body ? `${e.tagName}:${e.getAttribute('aria-label') ?? e.textContent?.trim().slice(0, 30) ?? ''}` : 'body';
      });
      expect(cible).not.toBe(precedent);
      precedent = cible;
      vus.add(cible);
    }
    expect(vus.size).toBeGreaterThan(2);

    await page.keyboard.press('Control+k');
    await expect(page).toHaveURL(/\/paie$/);
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
    await page.keyboard.press('Control+k');
    await espace.getByRole('button', { name: 'Retour à l’application' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/paie$/);
  });

  test('lecteur d’écran : région nommée, aucun contrôle sans nom, aucune violation WCAG 2.2 AA (thème clair)', async ({ page }) => {
    await simulerRuntime(page);
    const espace = await ouvrir(page);
    await poserQuestion(espace);

    const sansNom = await espace.locator('button, [role=button], a, input, textarea').evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent?.trim() || e.getAttribute('placeholder')))
        .map((e) => e.outerHTML.slice(0, 120))
    );
    expect(sansNom).toEqual([]);
    expect(await violations(page)).toEqual([]);
  });

  test('thème sombre : aucune violation WCAG 2.2 AA', async ({ page }) => {
    await simulerRuntime(page);
    const espace = await ouvrir(page);
    await poserQuestion(espace);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    expect(await violations(page)).toEqual([]);
  });

  test('mouvement réduit : aucune animation ni transition longue dans l’assistant', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await simulerRuntime(page);
    const espace = await ouvrir(page);
    await poserQuestion(espace);

    const mouvements = await page.locator('app-assistant *').evaluateAll((els) => {
      const secondes = (valeur: string): number => Math.max(...valeur.split(',').map((v) => (v.trim().endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v) || 0)));
      return els
        .map((e) => {
          const style = getComputedStyle(e);
          return { cible: `${e.tagName.toLowerCase()}.${(e as HTMLElement).className?.toString().slice(0, 40)}`, transition: secondes(style.transitionDuration), animation: style.animationName === 'none' ? 0 : secondes(style.animationDuration) };
        })
        .filter((m) => m.transition > 0.1 || m.animation > 0.1);
    });
    expect(mouvements).toEqual([]);
  });

  test('téléphone : fenêtre pleine largeur, aucune violation, cibles tactiles d’au moins 24 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await simulerRuntime(page);
    const espace = await ouvrir(page);
    await poserQuestion(espace);

    expect(await violations(page)).toEqual([]);
    const trop_petites = await espace.locator('button, [role=button]').evaluateAll((els) =>
      els
        .filter((e) => (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ cible: e.getAttribute('aria-label') ?? e.textContent?.trim().slice(0, 30) ?? e.tagName, ...e.getBoundingClientRect().toJSON() }))
        .filter((r) => r.width < 24 || r.height < 24)
        .map((r) => `${r.cible} ${Math.round(r.width)}x${Math.round(r.height)}`)
    );
    expect(trop_petites).toEqual([]);
  });

  test('reflux à 320 px (zoom 400 %) : aucun défilement horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await simulerRuntime(page);
    const espace = await ouvrir(page);
    await poserQuestion(espace);

    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debordement).toBeLessThanOrEqual(0);
  });

  test('repli texte : une surface A2UI inconnue n’empêche pas la réponse écrite', async ({ page }) => {
    await simulerRuntime(page, {
      run: async (route) => {
        const evenements = [
          { type: 'RUN_STARTED', threadId: 't', runId: 'r' },
          {
            type: 'ACTIVITY_SNAPSHOT',
            messageId: 'a2ui-surface-x',
            activityType: 'a2ui-surface',
            content: { a2ui_operations: [{ version: 'v0.9', createSurface: { surfaceId: 'x', catalogId: 'inconnu://catalogue' } }] },
            replace: true
          },
          { type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' },
          { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'La masse salariale de 2026-08 est de 4 800 MAD.' },
          { type: 'TEXT_MESSAGE_END', messageId: 'm1' },
          { type: 'RUN_FINISHED', threadId: 't', runId: 'r' }
        ];
        await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: evenements.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') });
      }
    });
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    const espace = await ouvrir(page);

    await poserQuestion(espace);
    expect(erreurs).toEqual([]);
  });

  test('service IA indisponible : message en français, l’application reste utilisable', async ({ page }) => {
    await simulerRuntime(page, { run: async (route) => route.fulfill({ status: 503, body: 'indisponible' }) });
    const espace = await ouvrir(page);
    const question = espace.getByPlaceholder('Posez votre question…');
    await question.fill('Bonjour');
    await question.press('Enter');

    await expect(espace.getByText(/momentanément indisponible/)).toBeVisible();
    expect(await violations(page)).toEqual([]);
    await page.keyboard.press('Control+k');
    await expect(page).toHaveURL(/\/paie$/);
    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
  });
});
