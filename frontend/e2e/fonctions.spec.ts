import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['FUNCTION_READ', 'FUNCTION_WRITE', 'FUNCTION_DELETE'];

test.describe('Fonctions', () => {
  test('crée une fonction et ouvre sa fiche', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /functions/search': () => pageDe([]),
      'POST /functions': () => ({ id: 7, libelle: 'GRUTIER' }),
      'GET /functions/7': () => ({ id: 7, libelle: 'GRUTIER' })
    });
    await page.goto('/functions');

    await page.getByRole('link', { name: 'Nouvelle fonction' }).click();
    await expect(page.getByRole('heading', { name: 'Nouvelle fonction' })).toBeVisible();

    const accessibilite = await new AxeBuilder({ page }).analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);

    await page.getByLabel('Libellé').fill('GRUTIER');
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page).toHaveURL(/\/functions\/7$/);
    await expect(page.getByRole('heading', { name: 'GRUTIER' })).toBeVisible();
    expect(mock.bodies['POST /functions']).toEqual([{ libelle: 'GRUTIER' }]);
  });

  test('signale un libellé obligatoire sans appeler l’API', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([]) });
    await page.goto('/functions/new');

    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByRole('alert').filter({ hasText: 'obligatoire' })).toBeVisible();
    expect(mock.calls).not.toContain('POST /functions');
  });

  test('supprime une fonction après confirmation', async ({ page }) => {
    let supprimee = false;
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /functions/search': () => pageDe(supprimee ? [] : [{ id: 1, libelle: 'MACON' }]),
      'DELETE /functions/1': () => {
        supprimee = true;
        return undefined;
      }
    });
    await page.goto('/functions');

    await page.getByRole('button', { name: 'Supprimer la fonction MACON' }).click();
    const dialogue = page.getByRole('alertdialog');
    await expect(dialogue).toContainText('MACON');
    await dialogue.getByRole('button', { name: 'Supprimer' }).click();

    await expect(page.getByRole('cell', { name: 'MACON', exact: true })).toHaveCount(0);
    expect(mock.calls).toContain('DELETE /functions/1');
  });

  test('annule une suppression avec Échap', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }]) });
    await page.goto('/functions');

    await page.getByRole('button', { name: 'Supprimer la fonction MACON' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(mock.calls).not.toContain('DELETE /functions/1');
  });

  test('recherche en temps réel et trie par colonne', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }]) });
    await page.goto('/functions');
    await expect(page.getByRole('cell', { name: 'MACON', exact: true })).toBeVisible();

    await page.getByRole('searchbox', { name: 'Libellé' }).fill('mac');
    await expect.poll(() => (mock.bodies['POST /functions/search'] ?? []).at(-1)).toEqual({ libelle: 'mac' });

    await page.getByRole('button', { name: /Libellé/ }).click();
    await expect(page.getByRole('columnheader', { name: /Libellé/ })).toHaveAttribute('aria-sort', 'ascending');
  });

  test('parcourt les trois vues en conservant le filtre et relie les fiches Employé à la Paie', async ({ page }) => {
    const periodes = [{ periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 0, stcMontant: 0 }];
    const analyse = {
      periode: '2026-08',
      kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 0, stcMontant: 0 },
      moisPrecedent: null, parChantier: [], parEquipe: [], tranches: [], qualite: { sansEquipe: 0, sansObservation: 0 },
      parFonction: [{ id: 1, libelle: 'MACON', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }],
      evolution: [{ periode: '2026-08', masse: 4500, effectif: 1, stc: 0, stcMontant: 0 }]
    };
    const mock = await mockApi(page, { username: 'rh', permissions: [...DROITS, 'EMPLOYEE_READ', 'PAIE_READ'] }, {
      'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }, { id: 2, libelle: 'PLOMBIER' }]),
      'GET /functions/1': () => ({ id: 1, version: 0, libelle: 'MACON' }),
      'POST /employees/regroupements': () => [{ id: 1, code: 'MACON', libelle: 'MACON', effectif: 3, actifs: 3 }],
      'GET /paie/periodes': () => periodes,
      'POST /paie/analytique': () => analyse,
      'POST /paie/effectifs': () => [{ periode: '2026-08', effectif: 3, entrees: null, sorties: 0, mutations: null }],
      'POST /employees/analytique': () => ({
        effectif: 3, actifs: 2, inactifs: 1, ageMoyen: 35.5, ancienneteMoyenne: 4.2, embauchesDouzeMois: 1,
        parAge: [{ min: 0, max: 25, effectif: 1 }, { min: 25, max: null, effectif: 2 }],
        parAnciennete: [{ min: 0, max: 1, effectif: 1 }, { min: 1, max: null, effectif: 2 }]
      })
    });
    await page.goto('/functions?libelle=mac');

    await page.getByRole('navigation', { name: 'Vues des fonctions' }).getByRole('link', { name: 'Cartes' }).click();
    await expect(page).toHaveURL(/\/functions\/cartes\?libelle=mac$/);
    const carte = page.locator('.perimetre-carte').filter({ hasText: 'MACON' });
    await expect(carte).toContainText('Employés sur les fiches récentes');
    await expect(carte).toContainText('Paie · août 2026');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);

    // Le filtre libellé suit dans l'Analytique et borne le périmètre analysé (mêmes fonctions que les deux autres vues).
    await page.getByRole('navigation', { name: 'Vues des fonctions' }).getByRole('link', { name: 'Analytique' }).click();
    await expect(page).toHaveURL(/\/functions\/analytique\?libelle=mac$/);
    await expect(page.getByRole('heading', { name: /Paie · août 2026/ })).toBeVisible();
    await expect(page.getByText('Répartition par fonction')).toBeVisible();
    expect(mock.bodies['POST /paie/analytique'].at(-1)).toEqual({ periode: '2026-08', fonctionIds: [1, 2] });
    await page.getByRole('navigation', { name: 'Vues des fonctions' }).getByRole('link', { name: 'Cartes' }).click();

    await carte.getByRole('link', { name: 'Voir l’historique Paie' }).click();
    await expect(page).toHaveURL(/\/functions\/analytique\?libelle=mac&fonctionIds=1/);
    await expect(page.getByRole('heading', { name: 'Évolution mensuelle' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Situation des fiches Employé' })).toBeVisible();
    expect(mock.bodies['POST /paie/analytique'].at(-1)).toEqual({ periode: '2026-08', fonctionIds: [1] });
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  });

  test('masque Employé et Paie dans les vues sans les droits correspondants', async ({ page }) => {
    const mock = await mockApi(page, { username: 'lecteur', permissions: ['FUNCTION_READ'] }, {
      'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }])
    });
    await page.goto('/functions/cartes');

    const carte = page.locator('.perimetre-carte').filter({ hasText: 'MACON' });
    await expect(carte).toBeVisible();
    await expect(carte).not.toContainText('Employés sur les fiches récentes');
    await expect(carte).not.toContainText('Payés');
    await page.goto('/functions/analytique');
    await expect(page.getByText('Les indicateurs de paie ne sont pas disponibles pour votre compte.')).toBeVisible();
    expect(mock.calls.filter((appel) => appel.includes('/paie') || appel.includes('/employees'))).toEqual([]);
  });

  test('un lien « Retour » du formulaire modifié demande confirmation avant de quitter', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, { 'POST /functions/search': () => pageDe([]) });
    await page.goto('/functions/new');

    await page.getByLabel('Libellé').fill('BROUILLON');
    await page.getByRole('link', { name: 'Fonctions' }).first().click();

    await expect(page.getByRole('alertdialog')).toBeVisible();
  });
});
