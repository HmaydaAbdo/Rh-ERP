import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

/**
 * E0.8 : l'arabe n'est pas livré, mais l'interface est prête à être lue de droite à gauche. Ces essais passent le document en
 * `dir="rtl"` : rien ne déborde, le rail passe à droite, aucune violation d'accessibilité.
 */
test.describe('Lecture de droite à gauche (préparation)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`le catalogue ne déborde pas et reste accessible en thème ${theme}`, async ({ page }) => {
      await mockApi(page, null);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/catalogue');
      await expect(page.getByRole('heading', { name: 'Catalogue Staport' })).toBeVisible();
      await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));

      const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(debordement).toBeLessThanOrEqual(0);
      const resultats = await new AxeBuilder({ page }).analyze();
      expect(resultats.violations.map((v) => v.id)).toEqual([]);
    });
  }

  test('le rail passe à droite et la page ne déborde pas', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: ['PAIE_READ'] }, {
      'POST /paie/search': () => pageDe([{
        id: 1, version: 0, periode: '2026-08', nomPrenom: 'Ali Alaoui', cin: 'AB1', chantier: 'C168', fonction: 'MACON', equipe: null,
        nombreJoursTravailles: 26, salaireMensuel: 4000, primeRoulageOrdinaire: 0, primeRoulageDimanche: 0, salaireTotal: 4500
      }]),
      'GET /paie/periodes': () => []
    });
    await page.goto('/paie');
    await page.evaluate(() => document.documentElement.setAttribute('dir', 'rtl'));

    const rail = page.locator('stp-app-shell nav, stp-app-shell .app-rail').first();
    await expect(rail).toBeVisible();
    const boite = await rail.boundingBox();
    const largeur = page.viewportSize()!.width;
    expect(boite!.x + boite!.width).toBeGreaterThan(largeur / 2);

    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debordement).toBeLessThanOrEqual(0);
  });
});
