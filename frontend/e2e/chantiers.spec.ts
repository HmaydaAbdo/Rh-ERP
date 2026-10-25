import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['CHANTIER_READ', 'CHANTIER_WRITE', 'CHANTIER_DELETE', 'CHANTIER_SYNC'];

const NADOR = { id: 1, version: 0, code: 'C168', designation: 'Route de Nador', nom: null, sourceErp: true, actif: true };
const MARRAKECH = { id: 2, version: 0, code: 'C196', designation: 'Marrakech', nom: 'Nord', sourceErp: false, actif: false };

const PERIODES = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 1, stcMontant: 1000 }];
const ANALYSE = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 1, stcMontant: 1000 },
  moisPrecedent: null, parEquipe: [], parFonction: [], tranches: [], qualite: { sansEquipe: 0, sansObservation: 0 },
  parChantier: [{ id: 1, code: 'C168', libelle: 'Route de Nador', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  evolution: [{ periode: '2026-08', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }]
};

const FICHES = {
  effectif: 3, actifs: 2, inactifs: 1, ageMoyen: 35.5, ancienneteMoyenne: 4.2, embauchesDouzeMois: 1,
  parAge: [{ min: 0, max: 25, effectif: 1 }, { min: 25, max: null, effectif: 2 }],
  parAnciennete: [{ min: 0, max: 1, effectif: 1 }, { min: 1, max: null, effectif: 2 }]
};

test.describe('Chantiers', () => {
  test('parcourt les trois vues en conservant les filtres et utilise uniquement la paie récente', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: [...DROITS, 'EMPLOYEE_READ', 'PAIE_READ', 'FUNCTION_READ', 'EQUIPE_READ'] }, {
      'POST /chantiers/search': () => pageDe([NADOR, MARRAKECH]),
      'POST /functions/search': () => pageDe([{ id: 7, libelle: 'Chauffeur' }]),
      'POST /equipes/search': () => pageDe([{ id: 5, code: 'CH', libelle: 'Chauffeurs' }]),
      'GET /chantiers/1': () => NADOR,
      'POST /employees/regroupements': () => [{ id: 1, code: 'C168', libelle: 'Route de Nador', effectif: 3, actifs: 3 }],
      'GET /paie/periodes': () => PERIODES,
      'POST /paie/analytique': () => ANALYSE,
      'POST /paie/effectifs': () => [{ periode: '2026-08', effectif: 3, entrees: null, sorties: 0, mutations: null }],
      'POST /employees/analytique': () => FICHES
    });
    await page.goto('/chantiers?code=C1');
    await expect(page.getByRole('cell', { name: 'C168', exact: true })).toBeVisible();

    await page.getByRole('navigation', { name: 'Vues des chantiers' }).getByRole('link', { name: 'Cartes' }).click();
    await expect(page).toHaveURL(/\/chantiers\/cartes\?code=C1$/);
    const carte = page.locator('.perimetre-carte').filter({ hasText: 'C168' });
    await expect(carte).toContainText('En cours');
    await expect(carte).not.toContainText('Employés sur les fiches récentes');
    await expect(carte).toContainText('Effectif (personnes)');
    await expect(carte).toContainText('Paie · août 2026');
    await expect(page.locator('.perimetre-carte').filter({ hasText: 'C196' })).toContainText('Clôturé');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);

    // Les filtres suivent dans l'Analytique et bornent le périmètre analysé (mêmes chantiers que les deux autres vues).
    await page.getByRole('navigation', { name: 'Vues des chantiers' }).getByRole('link', { name: 'Analytique' }).click();
    await expect(page).toHaveURL(/\/chantiers\/analytique\?code=C1(&periode=2026-08)?$/);
    await expect(page.getByRole('heading', { name: /Répartition de la paie par chantier/ })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Fonctions de la répartition' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Équipes de la répartition' })).toBeVisible();
    expect(mock.bodies['POST /paie/analytique'].at(-1)).toEqual({ periode: '2026-08', chantierIds: [1, 2] });
    await page.getByRole('navigation', { name: 'Vues des chantiers' }).getByRole('link', { name: 'Cartes' }).click();

    await carte.getByRole('link', { name: /Voir l’historique Paie de/ }).click();
    await expect(page).toHaveURL(/\/chantiers\/analytique\?code=C1&chantierIds=1/);
    await expect(page.getByRole('heading', { name: 'Évolution mensuelle par chantier' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Situation des fiches Employé' })).toHaveCount(0);
    expect(mock.calls.filter((appel) => appel.includes('/employees'))).toEqual([]);
    expect(mock.bodies['POST /paie/analytique'].at(-1)).toEqual({ periode: '2026-08', chantierIds: [1] });
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  });

  test('masque Employé et Paie dans les vues sans les droits correspondants', async ({ page }) => {
    const mock = await mockApi(page, { username: 'lecteur', permissions: ['CHANTIER_READ'] }, {
      'POST /chantiers/search': () => pageDe([NADOR])
    });
    await page.goto('/chantiers/cartes');

    const carte = page.locator('.perimetre-carte').filter({ hasText: 'C168' });
    await expect(carte).toBeVisible();
    await expect(carte).not.toContainText('Employés sur les fiches récentes');
    await expect(carte).not.toContainText('Payés');
    await expect(page.getByRole('link', { name: 'Nouveau chantier' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Synchroniser maintenant' })).toHaveCount(0);
    await page.goto('/chantiers/analytique');
    await expect(page.getByText('L’effectif mensuel par chantier n’est pas disponible pour votre compte.')).toBeVisible();
    expect(mock.calls.filter((appel) => appel.includes('/paie') || appel.includes('/employees'))).toEqual([]);
  });

  test('filtre par statut dans le tableau et clôture un chantier après confirmation', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /chantiers/search': () => pageDe([NADOR]),
      'PUT /chantiers/1': () => ({ ...NADOR, actif: false, version: 1 })
    });
    await page.goto('/chantiers?actif=true');
    await expect(page.getByRole('cell', { name: 'C168', exact: true })).toBeVisible();
    await expect.poll(() => (mock.bodies['POST /chantiers/search'] ?? []).at(-1)).toEqual({ actif: true });

    await page.getByRole('button', { name: 'Clôturer le chantier C168' }).click();
    const dialogue = page.getByRole('alertdialog');
    await expect(dialogue).toContainText('C168');
    await dialogue.getByRole('button', { name: 'Clôturer' }).click();

    await expect.poll(() => (mock.bodies['PUT /chantiers/1'] ?? []).at(-1)).toMatchObject({ actif: false });
  });

  test('synchronise depuis l’en-tête commun aux trois vues', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /chantiers/search': () => pageDe([NADOR]),
      'POST /chantiers/sync': () => ({ totalRecus: 4, crees: 1, dejaPresents: 3, ignores: 0 })
    });
    await page.goto('/chantiers/cartes');

    await page.getByRole('button', { name: 'Synchroniser maintenant' }).click();

    await expect(page.getByText('Synchronisation terminée')).toBeVisible();
    expect(mock.calls).toContain('POST /chantiers/sync');
  });
});
