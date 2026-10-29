import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockApi } from './support/api-mock';

const SITES = [
  { id: 57, code: 'C057', designation: 'Dépôt Harbil', nom: 'Dépôt Harbil', nature: 'DEPOT', localisation: 'https://www.google.com/maps/search/?api=1&query=31.7243258,-8.1033938', latitude: 31.7243258, longitude: -8.1033938 },
  { id: 168, code: 'C168', designation: 'Route de Nador', nom: null, nature: 'AO', localisation: 'https://www.google.com/maps/search/?api=1&query=35.0817411,-3.152588', latitude: 35.0817411, longitude: -3.152588 }
];

test('la carte Chantier filtre ses marqueurs avec le menu compact', async ({ page }) => {
  test.setTimeout(90_000);
  const mock = await mockApi(page, { username: 'direction', permissions: ['CARTE_READ'] }, {
    'GET /chantiers/carte': () => SITES
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => localStorage.setItem('staport-theme', 'dark'));
  await page.goto('/carte');

  const filtre = page.getByRole('form', { name: 'Recherche sur la carte' });
  await expect(filtre).toBeVisible();
  await expect(filtre.getByRole('searchbox', { name: 'Rechercher par code ou nom de chantier' })).toBeVisible();
  await expect(filtre.getByRole('combobox', { name: 'Filtrer par nature' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chantiers' })).toHaveCount(0);
  await expect(page.locator('.carte-page__chantier')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ajouter un chantier' })).toHaveCount(0);
  await expect(page.getByText('Paie', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Employés', { exact: true })).toHaveCount(0);
  await expect(page.locator('.chantier-carte__marqueur')).toHaveCount(2);
  expect(mock.calls).toContain('GET /chantiers/carte');

  const select = filtre.getByRole('combobox', { name: 'Filtrer par nature' });
  await filtre.getByRole('button', { name: 'Ouvrir la liste' }).click();
  await expect(page.getByRole('listbox', { name: 'Filtrer par nature' })).toBeVisible();
  await page.getByRole('button', { name: 'Fermer la liste' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await select.click();
  for (const nature of ['AO', 'Dépôt', 'Émulsion', 'Concassage', 'Poste d’enrobé', 'Centrale à béton']) {
    await expect(page.locator('.stp-select__option').filter({ hasText: nature }).first()).toBeVisible();
  }
  await page.locator('.stp-select__option').filter({ hasText: 'Dépôt' }).click();
  await expect(page.locator('.chantier-carte__marqueur')).toHaveCount(1);
  await page.locator('.stp-select__option').filter({ hasText: 'AO' }).click();
  await expect(page.locator('.chantier-carte__marqueur')).toHaveCount(2);
  await page.locator('.stp-select__option').filter({ hasText: 'Dépôt' }).click();
  await expect(page.locator('.chantier-carte__marqueur')).toHaveCount(1);
  await expect(page.locator('.carte-page__chantier')).toHaveCount(0);

  expect((await new AxeBuilder({ page }).include('.carte-page__filtre').analyze()).violations.map((v) => v.id)).toEqual([]);
  await page.getByRole('button', { name: 'Fermer la liste' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ouvrir la liste' }).click();
  await page.locator('.stp-select__option').filter({ hasText: 'AO' }).click();
  await expect(page.locator('.chantier-carte__marqueur')).toHaveCount(2);
  await page.locator('.chantier-carte__marqueur[data-tooltip*="Route de Nador"]').hover();
  await page.screenshot({ path: 'test-results/carte-chantiers-premium-desktop.png', fullPage: true });
});

test('le filtre reste compact sur mobile et la carte reste la surface principale', async ({ page }) => {
  await mockApi(page, { username: 'lecteur-carte', permissions: ['CARTE_READ'] }, {
    'GET /chantiers/carte': () => SITES
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/carte');

  const filtre = page.getByRole('form', { name: 'Recherche sur la carte' });
  await expect(filtre).toBeVisible();
  await expect(filtre.getByRole('searchbox', { name: 'Rechercher par code ou nom de chantier' })).toBeVisible();
  await expect(filtre.getByRole('combobox', { name: 'Filtrer par nature' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Carte des chantiers' })).toBeVisible();
  await expect(page.locator('.carte-page__chantier')).toHaveCount(0);
  await expect(page.locator('.chantier-carte__marqueur').first()).toHaveText('');
  await expect(page.locator('.chantier-carte__marqueur[data-tooltip*="Route de Nador"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/carte-chantiers-premium-mobile.png', fullPage: true });
});
