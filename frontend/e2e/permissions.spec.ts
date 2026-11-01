import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const FONCTIONS = pageDe([
  { id: 1, libelle: 'MACON' },
  { id: 2, libelle: 'CH. CAMION' }
]);

test.describe('Permissions', () => {
  test('masque les actions d’écriture à un lecteur', async ({ page }) => {
    await mockApi(page, { username: 'lecteur', permissions: ['FUNCTION_READ'] }, { 'POST /functions/search': () => FONCTIONS });
    await page.goto('/functions');

    await expect(page.getByRole('heading', { name: 'Fonctions' })).toBeVisible();
    await expect(page.getByRole('gridcell', { name: 'MACON', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nouvelle fonction' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Supprimer la fonction/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Modifier la fonction/ })).toHaveCount(0);
  });

  test('montre les actions à qui a les droits d’écriture et de suppression', async ({ page }) => {
    await mockApi(
      page,
      { username: 'gestionnaire', permissions: ['FUNCTION_READ', 'FUNCTION_WRITE', 'FUNCTION_DELETE'] },
      { 'POST /functions/search': () => FONCTIONS }
    );
    await page.goto('/functions');

    await expect(page.getByRole('link', { name: 'Nouvelle fonction' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Supprimer la fonction MACON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Modifier la fonction MACON' })).toBeVisible();
  });

  test('refuse l’accès à un écran sans permission de lecture', async ({ page }) => {
    await mockApi(page, { username: 'lecteur', permissions: ['FUNCTION_READ'] }, { 'POST /functions/search': () => FONCTIONS });
    await page.goto('/employees');

    await expect(page).toHaveURL(/\/acces-refuse$/);
  });

  test('ne propose dans le menu que les écrans autorisés', async ({ page }) => {
    await mockApi(page, { username: 'lecteur', permissions: ['FUNCTION_READ', 'EQUIPE_READ'] }, { 'POST /functions/search': () => FONCTIONS });
    await page.goto('/functions');
    await page.getByRole('button', { name: 'Ouvrir la barre Staport' }).click();

    const menu = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(menu.getByRole('link', { name: 'Fonctions' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Équipes' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Paie' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Rôles' })).toHaveCount(0);
  });

  test('ouvre la carte à qui a CARTE_READ et révèle la navigation par le bouton Menu de la barre Staport', async ({ page }) => {
    await mockApi(page, { username: 'direction', permissions: ['CARTE_READ'] });
    await page.goto('/');

    await expect(page).toHaveURL(/\/carte$/);
    await expect(page.getByRole('heading', { name: 'Carte des chantiers' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Carte des chantiers' })).toBeVisible();

    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ouvrir la barre Staport' }).click();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Carte' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
  });

  test('refuse la carte à qui n’a pas CARTE_READ', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: ['PAIE_READ'] });
    await page.goto('/carte');

    await expect(page).toHaveURL(/\/acces-refuse$/);
    await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Carte' })).toHaveCount(0);
  });

  test('la carte est accessible (axe)', async ({ page }) => {
    await mockApi(page, { username: 'direction', permissions: ['CARTE_READ'] });
    await page.goto('/carte');
    await expect(page.getByRole('region', { name: 'Carte des chantiers' })).toBeVisible();

    const resultats = await new AxeBuilder({ page }).analyze();
    expect(
      resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html} ${n.failureSummary}`).join(' | ')}`)
    ).toEqual([]);
  });

  test('la liste des fonctions est accessible (axe)', async ({ page }) => {
    await mockApi(page, { username: 'gestionnaire', permissions: ['FUNCTION_READ', 'FUNCTION_WRITE', 'FUNCTION_DELETE', 'FUNCTION_IMPORT'] }, { 'POST /functions/search': () => FONCTIONS });
    await page.goto('/functions');
    await expect(page.getByRole('gridcell', { name: 'MACON', exact: true })).toBeVisible();

    const resultats = await new AxeBuilder({ page }).analyze();
    expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});
