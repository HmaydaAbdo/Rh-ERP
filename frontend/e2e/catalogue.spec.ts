import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';

/** Le catalogue (route de développement, voir `app.routes.ts`) montre chaque composant partagé dans ses états. */
test.describe('Catalogue des composants', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, null);
    await page.goto('/catalogue');
    await expect(page.getByRole('heading', { name: 'Catalogue Staport' })).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`aucune violation d’accessibilité en thème ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((valeur) => document.documentElement.setAttribute('data-theme', valeur), theme);

      const resultats = await new AxeBuilder({ page }).analyze();
      expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
  }

  test('le sélecteur multiple se pilote au clavier : flèches, Entrée, Échap', async ({ page }) => {
    const champ = page.getByRole('combobox', { name: 'Chantiers' });
    await champ.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();

    const avant = await champ.getAttribute('aria-activedescendant');
    await page.keyboard.press('ArrowDown');
    await expect(champ).not.toHaveAttribute('aria-activedescendant', avant ?? '');
    await page.keyboard.press('Enter');
    await expect(champ).toHaveValue('3 chantiers');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('un clic sur le sélecteur filtrable ouvre la liste', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Recherche' }).click();

    await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(4);
  });

  test('le sélecteur filtrable cherche sans tenir compte des accents', async ({ page }) => {
    const champ = page.getByRole('combobox', { name: 'Recherche' });
    await champ.click();
    await champ.fill('fes');

    await expect(page.getByRole('listbox').getByRole('option')).toHaveText(['Autoroute Rabat–Fès']);
  });

  test('le dialogue piège le focus, se ferme avec Échap et rend le focus à son déclencheur', async ({ page }) => {
    const ouvrir = page.getByRole('button', { name: 'Ouvrir' });
    await ouvrir.focus();
    await page.keyboard.press('Enter');

    const dialogue = page.getByRole('dialog');
    await expect(dialogue).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(dialogue.locator(':focus')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(dialogue).toHaveCount(0);
    await expect(ouvrir).toBeFocused();
  });

  test('le tableau se trie, se pagine et se réordonne au clavier (Alt + flèche)', async ({ page }) => {
    const tableau = page.getByRole('region', { name: 'Employés' });
    const entetes = tableau.getByRole('columnheader');

    await tableau.getByRole('button', { name: /Nom/ }).click();
    await expect(entetes.filter({ hasText: 'Nom' })).toHaveAttribute('aria-sort', 'ascending');

    await page.getByRole('button', { name: 'Page suivante' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'page 2/3' })).toBeVisible();

    await tableau.getByRole('button', { name: /Nom/ }).focus();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(entetes.first()).toContainText('Fonction');
  });
});
