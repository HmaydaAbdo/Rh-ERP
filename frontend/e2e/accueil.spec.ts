import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi } from './support/api-mock';

const DISPONIBLES = [
  { code: 'paie.masse', libelle: 'Masse salariale', description: 'Masse salariale du dernier mois de paie' },
  { code: 'paie.effectif', libelle: 'Effectif payé', description: 'Nombre de personnes payées' },
  { code: 'employe.effectif', libelle: 'Employés', description: 'Effectif des fiches Employé' }
];

const PAIE = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 3, coutMoyen: 1500, nombreChantiers: 1, stc: 0, stcMontant: 0 },
  moisPrecedent: { masse: 4000, effectif: 2, coutMoyen: 2000, nombreChantiers: 1, stc: 0, stcMontant: 0 }
};

const FICHES = { effectif: 8, actifs: 7, inactifs: 1, ageMoyen: 36, ancienneteMoyenne: 4.5, embauchesDouzeMois: 1, parAge: [], parAnciennete: [] };

test.describe('Accueil', () => {
  test('arrive sur l’accueil, montre les indicateurs choisis et permet de les composer', async ({ page }) => {
    let choisis = ['paie.masse', 'employe.effectif'];
    const mock = await mockApi(page, { username: 'rh', permissions: ['ACCUEIL_READ', 'ACCUEIL_WRITE', 'PAIE_READ', 'EMPLOYEE_READ'] }, {
      'GET /accueil': () => ({ version: null, personnalise: false, indicateurs: choisis, disponibles: DISPONIBLES }),
      'PUT /accueil': () => {
        choisis = ['employe.effectif'];
        return { version: 0, personnalise: true, indicateurs: choisis, disponibles: DISPONIBLES };
      },
      'GET /paie/periodes': () => [{ periode: '2026-08', nombreBulletins: 3, nombreChantiers: 1, masse: 4500, stc: 0, stcMontant: 0 }],
      'POST /paie/analytique': () => PAIE,
      'POST /employees/analytique': () => FICHES
    });

    await page.goto('/');
    await expect(page).toHaveURL(/\/accueil$/);
    await expect(page.getByRole('heading', { name: 'Accueil', level: 1 })).toBeVisible();
    await expect(page.locator('.app-kpi').first()).toContainText('Masse salariale');
    await expect(page.locator('.app-kpi').nth(1)).toContainText('8');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);

    await page.getByRole('button', { name: 'Personnaliser' }).click();
    await page.getByRole('button', { name: 'Retirer Masse salariale' }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.locator('.app-kpi')).toHaveCount(1);
    expect(mock.bodies['PUT /accueil'].at(-1)).toEqual({ version: null, indicateurs: ['employe.effectif'] });
  });

  test('un utilisateur sans droit de lecture de l’accueil arrive sur son premier écran autorisé', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: ['EQUIPE_READ'] }, { 'POST /equipes/search': () => ({ content: [], page: { size: 10, number: 0, totalElements: 0, totalPages: 0 } }) });

    await page.goto('/');

    await expect(page).toHaveURL(/\/equipes/);
  });
});
