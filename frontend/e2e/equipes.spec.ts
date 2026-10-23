import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['EQUIPE_READ', 'EQUIPE_WRITE', 'EQUIPE_DELETE', 'EQUIPE_IMPORT'];

const CHAUFFEURS = { id: 5, version: 0, code: 'CH', libelle: 'Chauffeurs' };
const OPERATEURS = { id: 6, version: 0, code: 'OP', libelle: 'Opérateurs' };

const PERIODES = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 1, stcMontant: 1000 }];
const ANALYSE = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 1, stcMontant: 1000 },
  moisPrecedent: null, parChantier: [], parFonction: [], tranches: [], qualite: { sansEquipe: 0, sansObservation: 0 },
  parEquipe: [{ id: 5, code: 'CH', libelle: 'Chauffeurs', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  evolution: [{ periode: '2026-08', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }]
};
const FICHES = {
  effectif: 3, actifs: 2, inactifs: 1, ageMoyen: 35.5, ancienneteMoyenne: 4.2, embauchesDouzeMois: 1,
  parAge: [{ min: 0, max: 25, effectif: 1 }, { min: 25, max: null, effectif: 2 }],
  parAnciennete: [{ min: 0, max: 1, effectif: 1 }, { min: 1, max: null, effectif: 2 }]
};

test.describe('Équipes', () => {
  test('importe un fichier autorisé, présente son bilan et recharge la vue Tabulaire', async ({ page }) => {
    const mock = await mockApi(page, { username: 'gestionnaire', permissions: ['EQUIPE_READ', 'EQUIPE_IMPORT'] }, {
      'POST /equipes/search': () => pageDe([CHAUFFEURS]),
      'POST /equipes/import': () => ({ totalLignes: 1, crees: 1, ignores: 0, lignesIgnorees: [] })
    });
    await page.goto('/equipes');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'equipes.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('fichier simulé')
    });

    await expect(page.getByRole('dialog', { name: "Résultat de l'import" })).toContainText('1 créée(s)');
    expect(mock.calls).toContain('POST /equipes/import');
    await expect.poll(() => mock.calls.filter((appel) => appel === 'POST /equipes/search').length).toBe(2);
  });

  test('parcourt les trois vues en conservant les filtres et relie les fiches Employé à la Paie', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: [...DROITS, 'EMPLOYEE_READ', 'PAIE_READ'] }, {
      'POST /equipes/search': () => pageDe([CHAUFFEURS, OPERATEURS]),
      'GET /equipes/5': () => CHAUFFEURS,
      // Les fiches courantes sont affectées à OP; le bulletin d'août reste rattaché à CH.
      'POST /employees/regroupements': () => [{ id: 6, code: 'OP', libelle: 'Opérateurs', effectif: 3, actifs: 2 }],
      'GET /paie/periodes': () => PERIODES,
      'POST /paie/analytique': () => ANALYSE,
      'POST /paie/effectifs': () => [{ periode: '2026-08', effectif: 3, entrees: null, sorties: 0, mutations: null }],
      'POST /employees/analytique': () => FICHES
    });
    await page.goto('/equipes?code=C');
    await expect(page.getByRole('cell', { name: 'CH', exact: true })).toBeVisible();

    await page.getByRole('navigation', { name: 'Vues des équipes' }).getByRole('link', { name: 'Cartes' }).click();
    await expect(page).toHaveURL(/\/equipes\/cartes\?code=C$/);
    const carte = page.locator('.perimetre-carte').filter({ hasText: 'Chauffeurs' });
    await expect(carte).toContainText('Employés sur les fiches récentes');
    await expect(carte).toContainText('Payés · août 2026');
    await expect(carte.locator('dt').filter({ hasText: 'Employés sur les fiches récentes' }).locator('xpath=..').locator('dd')).toHaveText('0');
    await expect(carte.locator('dt').filter({ hasText: 'Payés · août 2026' }).locator('xpath=..').locator('dd')).toContainText('1');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);

    // Le filtre suit dans l'Analytique et borne le périmètre analysé (mêmes équipes que les deux autres vues).
    await page.getByRole('navigation', { name: 'Vues des équipes' }).getByRole('link', { name: 'Analytique' }).click();
    await expect(page).toHaveURL(/\/equipes\/analytique\?code=C(&periode=2026-08)?$/);
    await expect(page.getByRole('heading', { name: /Paie · août 2026/ })).toBeVisible();
    await expect(page.getByText('Répartition par équipe')).toBeVisible();
    expect(mock.bodies['POST /paie/analytique'].at(-1)).toEqual({ periode: '2026-08', equipeIds: [5, 6] });
    await page.getByRole('navigation', { name: 'Vues des équipes' }).getByRole('link', { name: 'Cartes' }).click();

    await carte.getByRole('link', { name: 'Voir l’historique Paie' }).click();
    await expect(page).toHaveURL(/\/equipes\/analytique\?code=C&equipeIds=5/);
    await expect(page.getByRole('heading', { name: 'Évolution mensuelle' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Situation des fiches Employé' })).toBeVisible();
    expect(mock.bodies['POST /paie/analytique'].at(-1)).toEqual({ periode: '2026-08', equipeIds: [5] });
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  });

  test('masque Employé et Paie dans les vues sans les droits correspondants', async ({ page }) => {
    const mock = await mockApi(page, { username: 'lecteur', permissions: ['EQUIPE_READ'] }, {
      'POST /equipes/search': () => pageDe([CHAUFFEURS])
    });
    await page.goto('/equipes/cartes');

    const carte = page.locator('.perimetre-carte').filter({ hasText: 'Chauffeurs' });
    await expect(carte).toBeVisible();
    await expect(carte).not.toContainText('Employés sur les fiches récentes');
    await expect(carte).not.toContainText('Payés');
    await expect(page.getByRole('link', { name: 'Nouvelle équipe' })).toHaveCount(0);
    await page.goto('/equipes/analytique');
    await expect(page.getByText('Les indicateurs de paie ne sont pas disponibles pour votre compte.')).toBeVisible();
    expect(mock.calls.filter((appel) => appel.includes('/paie') || appel.includes('/employees'))).toEqual([]);
  });
});
