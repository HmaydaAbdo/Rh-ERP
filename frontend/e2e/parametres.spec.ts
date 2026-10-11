import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';

const PARAMETRES = [
  {
    id: 1,
    version: 0,
    cle: 'securite.jeton-acces.minutes',
    libelle: 'Durée de l’Access Token',
    description: 'Durée du jeton.',
    type: 'ENTIER' as const,
    unite: 'minutes',
    minimum: 1,
    maximum: 1440,
    valeur: '15'
  },
  {
    id: 2,
    version: 0,
    cle: 'chantier.synchronisation.cron',
    libelle: 'Planification de la synchronisation des chantiers',
    description: 'Expression de planification.',
    type: 'CRON' as const,
    unite: null,
    minimum: null,
    maximum: null,
    valeur: '0 0 23 * * *'
  }
];

test.describe('Paramètres', () => {
  test('charge les réglages et reste accessible', async ({ page }) => {
    await mockApi(
      page,
      { username: 'admin', permissions: ['PARAMETRE_READ', 'PARAMETRE_WRITE'] },
      { 'GET /parametres': () => PARAMETRES }
    );
    await page.goto('/admin/parametres');

    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Durée de l’Access Token' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Valeur (minutes)' })).toHaveValue('15');
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(2);

    const resultats = await new AxeBuilder({ page }).analyze();
    expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
});
