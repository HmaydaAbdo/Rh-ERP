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
    const option = page.getByRole('option', { name: 'Chantier Casablanca' });
    await expect(option).toHaveAttribute('aria-selected', 'false');
    await expect(champ).toHaveAttribute('aria-activedescendant', await option.getAttribute('id'));
    await page.keyboard.press('Enter');
    await expect(option).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  test('le panneau multiple reste dans la fenêtre et fait défiler l’option clavier active', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    const champ = page.getByRole('combobox', { name: 'Chantiers' });
    await champ.click();

    const liste = page.getByRole('listbox');
    await liste.evaluate((element) => {
      (element as HTMLElement).style.height = '3rem';
    });
    await page.keyboard.press('End');

    const derniereOption = liste.getByRole('option').last();
    await expect(champ).toHaveAttribute('aria-activedescendant', await derniereOption.getAttribute('id'));
    await expect.poll(() => liste.evaluate((element) => (element as HTMLElement).scrollTop)).toBeGreaterThan(0);
    const limites = await liste.evaluate((element) => {
      const panneau = element as HTMLElement;
      const bounds = panneau.getBoundingClientRect();
      const derniereOption = panneau.lastElementChild!.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        dernierElementVisible: derniereOption.top >= bounds.top && derniereOption.bottom <= bounds.bottom
      };
    });

    expect(limites.left).toBeGreaterThanOrEqual(0);
    expect(limites.right).toBeLessThanOrEqual(390);
    expect(limites.dernierElementVisible).toBe(true);
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

  test('le graphique se parcourt et sélectionne un point au clavier', async ({ page }) => {
    const graphique = page.getByRole('img', { name: /Masse salariale mensuelle/ });
    await graphique.focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.locator('.app-lecteur[aria-live="polite"]')).toContainText('Septembre');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'point du graphique sélectionné' })).toBeVisible();
  });
});
