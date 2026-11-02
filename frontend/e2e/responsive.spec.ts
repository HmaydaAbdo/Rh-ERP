import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

/** Projet « mobile » (Pixel 7) : le menu se replie, aucun défilement horizontal de la page, cibles tactiles suffisantes. */
test.describe('Téléphone', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: ['FUNCTION_READ', 'FUNCTION_WRITE'] }, { 'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }]) });
  });

  test('la page ne défile pas horizontalement', async ({ page }) => {
    await page.goto('/functions');
    await expect(page.getByRole('heading', { name: 'Fonctions' })).toBeVisible();

    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debordement).toBeLessThanOrEqual(0);
  });

  test('le menu s’ouvre et se ferme avec le bouton et Échap', async ({ page }) => {
    await page.goto('/functions');

    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect(page.getByRole('button', { name: 'Fermer le menu' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeVisible();
  });

  test('les boutons d’action ont une cible tactile d’au moins 44 px', async ({ page }) => {
    await page.goto('/functions');

    const bouton = page.getByRole('link', { name: 'Nouvelle fonction' });
    const boite = await bouton.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});
