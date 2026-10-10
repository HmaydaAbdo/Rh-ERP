import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['FUNCTION_READ', 'FUNCTION_WRITE', 'FUNCTION_DELETE'];

test.describe('Fonctions', () => {
  test('crée une fonction et ouvre sa fiche', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /functions/search': () => pageDe([]),
      'POST /functions': () => ({ id: 7, libelle: 'GRUTIER' }),
      'GET /functions/7': () => ({ id: 7, libelle: 'GRUTIER' })
    });
    await page.goto('/functions');

    await page.getByRole('link', { name: 'Nouvelle fonction' }).click();
    await expect(page.getByRole('heading', { name: 'Nouvelle fonction' })).toBeVisible();

    const accessibilite = await new AxeBuilder({ page }).analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);

    await page.getByLabel('Libellé').fill('GRUTIER');
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page).toHaveURL(/\/functions\/7$/);
    await expect(page.getByRole('heading', { name: 'GRUTIER' })).toBeVisible();
    expect(mock.bodies['POST /functions']).toEqual([{ libelle: 'GRUTIER' }]);
  });

  test('signale un libellé obligatoire sans appeler l’API', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([]) });
    await page.goto('/functions/new');

    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'obligatoire' })).toBeVisible();
    expect(mock.calls).not.toContain('POST /functions');
  });

  test('supprime une fonction après confirmation', async ({ page }) => {
    let supprimee = false;
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /functions/search': () => pageDe(supprimee ? [] : [{ id: 1, libelle: 'MACON' }]),
      'DELETE /functions/1': () => {
        supprimee = true;
        return undefined;
      }
    });
    await page.goto('/functions');

    await page.getByRole('button', { name: 'Supprimer la fonction MACON' }).click();
    const dialogue = page.getByRole('alertdialog');
    await expect(dialogue).toContainText('MACON');
    await dialogue.getByRole('button', { name: 'Supprimer' }).click();

    await expect(page.getByRole('cell', { name: 'MACON', exact: true })).toHaveCount(0);
    expect(mock.calls).toContain('DELETE /functions/1');
  });

  test('annule une suppression avec Échap', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }]) });
    await page.goto('/functions');

    await page.getByRole('button', { name: 'Supprimer la fonction MACON' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(mock.calls).not.toContain('DELETE /functions/1');
  });

  test('recherche en temps réel et trie par colonne', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }]) });
    await page.goto('/functions');
    await expect(page.getByRole('cell', { name: 'MACON', exact: true })).toBeVisible();

    await page.getByRole('textbox', { name: 'Libellé' }).fill('mac');
    await expect.poll(() => (mock.bodies['POST /functions/search'] ?? []).at(-1)).toEqual({ libelle: 'mac' });

    await page.getByRole('button', { name: /Libellé/ }).click();
    await expect(page.getByRole('columnheader', { name: /Libellé/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  test('un lien « Retour » du formulaire modifié demande confirmation avant de quitter', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([]) });
    await page.goto('/functions/new');

    await page.getByLabel('Libellé').fill('BROUILLON');
    await page.getByRole('link', { name: 'Fonctions' }).first().click();

    await expect(page.getByRole('alertdialog')).toBeVisible();
  });
});
