import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = [
  'EMPLOYEE_READ', 'CHANTIER_READ', 'FUNCTION_READ', 'EQUIPE_READ', 'PAIE_READ',
  'USER_MANAGE', 'ROLE_MANAGE', 'PARAMETRE_READ', 'AUDIT_READ'
];

test.describe('Parcours des domaines', () => {
  test('référentiels Employés, Chantiers et Équipes', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /employees/search': () => pageDe([]),
      'POST /chantiers/search': () => pageDe([]),
      'POST /equipes/search': () => pageDe([]),
      'POST /functions/search': () => pageDe([])
    });
    for (const [url, titre] of [['/employees', 'Employés'], ['/chantiers', 'Chantiers'], ['/equipes', 'Équipes']] as const) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: titre })).toBeVisible();
    }
  });

  test('administration Utilisateurs, Rôles et Paramètres', async ({ page }) => {
    await mockApi(page, { username: 'admin', permissions: DROITS }, {
      'POST /users/search': () => pageDe([]),
      'POST /roles/search': () => pageDe([]),
      'GET /parametres': () => []
    });
    for (const [url, titre] of [['/admin/users', 'Utilisateurs'], ['/admin/roles', 'Rôles'], ['/admin/parametres', 'Paramètres']] as const) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: titre })).toBeVisible();
    }
  });
});
