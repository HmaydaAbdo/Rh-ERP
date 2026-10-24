import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['EQUIPE_READ', 'EQUIPE_WRITE', 'EQUIPE_DELETE', 'EQUIPE_IMPORT'];

const CHAUFFEURS = { id: 5, version: 0, code: 'CH', libelle: 'Chauffeurs' };
const OPERATEURS = { id: 6, version: 0, code: 'OP', libelle: 'Opérateurs' };

const PERIODES = [
  { periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4500, stc: 1, stcMontant: 1000 },
  { periode: '2026-07', nombreBulletins: 1, nombreChantiers: 1, masse: 4200, stc: 0, stcMontant: 0 }
];
const ANALYSE = {
  periode: '2026-08',
  kpis: { masse: 4500, effectif: 1, coutMoyen: 4500, nombreChantiers: 1, stc: 1, stcMontant: 1000 },
  moisPrecedent: null,
  parChantier: [{ id: 9, code: 'C168', libelle: 'Nador', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  parFonction: [], tranches: [], qualite: { sansEquipe: 0, sansObservation: 0 },
  parEquipe: [{ id: 5, code: 'CH', libelle: 'Chauffeurs', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }],
  evolution: [
    { periode: '2026-07', masse: 4200, effectif: 2, stc: 0, stcMontant: 0 },
    { periode: '2026-08', masse: 4500, effectif: 1, stc: 1, stcMontant: 1000 }
  ]
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
      'GET /chantiers/9': () => ({ id: 9, code: 'NADOR', libelle: 'Nador' }),
      // Les fiches courantes sont affectées à OP; le bulletin d'août reste rattaché à CH.
      'POST /employees/regroupements': () => [{ id: 6, code: 'OP', libelle: 'Opérateurs', effectif: 3, actifs: 2 }],
      'GET /paie/periodes': () => PERIODES,
      'POST /paie/analytique': (request) => {
        const { periode } = request.postDataJSON() as { periode: string };
        return periode === '2026-07'
          ? {
              ...ANALYSE,
              periode,
              kpis: { masse: 4200, effectif: 2, coutMoyen: 2100, nombreChantiers: 1, stc: 0, stcMontant: 0 },
              parEquipe: [{ id: 5, code: 'CH', libelle: 'Chauffeurs', masse: 4200, effectif: 2, stc: 0, stcMontant: 0 }]
            }
          : ANALYSE;
      },
      'POST /paie/effectifs': () => [{ periode: '2026-08', effectif: 3, entrees: null, sorties: 0, mutations: null }],
      'POST /employees/analytique': () => FICHES
    });
    await page.goto('/equipes?code=C');
    await expect(page.getByRole('cell', { name: 'CH', exact: true })).toBeVisible();
    const exportTable = page.getByRole('button', { name: 'Exporter les équipes filtrées en PDF' });
    await expect(exportTable).toBeVisible();
    await expect(page.locator('.app-table-bar__tools [table-export]')).toBeVisible();
    const tableFrame = page.locator('.app-collection-table__surface .stp-table__scroll');
    const bordureRepos = await tableFrame.evaluate((element) => getComputedStyle(element).borderColor);
    await exportTable.focus();
    await expect.poll(() => tableFrame.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(bordureRepos);

    await page.getByRole('navigation', { name: 'Vues des équipes' }).getByRole('link', { name: 'Cartes' }).click();
    await expect(page).toHaveURL(/\/equipes\/cartes\?code=C$/);
    await expect(page.getByText('Étape 1 sur 4')).toHaveCount(0);
    await expect(page.getByText('Le parcours suit l’organisation définie')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exporter les résultats de ce périmètre en PDF' })).toBeVisible();
    const carte = page.locator('.perimetre-carte').filter({ hasText: 'Chauffeurs' });
    await expect(page.getByRole('button', { name: 'Toutes les équipes' })).toHaveCount(0);
    await expect(page.getByLabel('Période Paie')).toHaveCount(0);
    await expect(page.locator('.perimetre-cartes__periode-fixe')).toHaveText('Paie · août 2026');
    await expect(page.getByRole('link', { name: 'Voir la liste' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Voir les employés' })).toHaveCount(0);
    await expect(carte.getByRole('button', { name: 'Exporter Chauffeurs en PDF' })).toBeVisible();
    await expect(carte.getByRole('link', { name: 'Consulter Chauffeurs' })).toBeVisible();
    await expect(carte.getByRole('link', { name: 'Voir l’historique Paie de Chauffeurs' })).toBeVisible();
    await expect(carte.locator('.perimetre-carte__pied app-pdf-export-button')).toBeVisible();
    await expect(carte.locator('.perimetre-carte__pied')).toHaveCSS('justify-content', 'space-between');
    await expect(carte).toContainText('Employés sur les fiches récentes');
    await expect(carte).toContainText('Paie · août 2026');
    const fiches = carte.locator('.perimetre-carte__fiches');
    const mesures = carte.locator('.perimetre-carte__mesures');
    await expect(fiches.locator('.perimetre-carte__fiche-indicateur')).toHaveCount(1);
    await expect(fiches.locator('.perimetre-carte__jauge-ligne')).toHaveCount(0);
    await expect(mesures.locator('.perimetre-carte__fiche-indicateur, .perimetre-carte__jauge-ligne')).toHaveCount(0);
    await expect(carte.locator('dt').filter({ hasText: 'Employés sur les fiches récentes' }).locator('xpath=..').locator('dd')).toHaveText('0');
    const carteOperateurs = page.locator('.perimetre-carte').filter({ hasText: 'Opérateurs' });
    await expect(carteOperateurs.locator('.perimetre-carte__fiches .perimetre-carte__jauge-ligne')).toHaveCount(1);
    await expect(carteOperateurs.locator('.perimetre-carte__mesures .perimetre-carte__jauge-ligne')).toHaveCount(0);
    const indicateurs = mesures.locator('.perimetre-carte__indicateur');
    await expect(indicateurs).toHaveCount(4);
    await expect(indicateurs.nth(0).locator('dt')).toHaveText('Effectif (personnes)');
    await expect(indicateurs.nth(0).locator('strong')).toHaveText('1');
    await expect(indicateurs.nth(0).locator('.perimetre-carte__variation')).toHaveText('−1 personne · vs juillet 2026');
    await expect(indicateurs.nth(1).locator('dt')).toHaveText('Masse salariale (DH)');
    await expect(indicateurs.nth(1).locator('strong')).toContainText('4');
    await expect(indicateurs.nth(1).locator('.perimetre-carte__variation')).toHaveText('+7,1 % · vs juillet 2026');
    await expect(indicateurs.nth(2).locator('dt')).toHaveText('STC (personnes)');
    await expect(indicateurs.nth(2).locator('strong')).toHaveText('1');
    await expect(indicateurs.nth(2).locator('.perimetre-carte__variation')).toHaveText('+1 personne · vs juillet 2026');
    await expect(indicateurs.nth(3).locator('dt')).toHaveText('STC (DH)');
    await expect(indicateurs.nth(3).locator('strong')).toContainText('1');
    await expect(indicateurs.nth(3).locator('.perimetre-carte__variation')).toHaveText('Base précédente nulle · vs juillet 2026');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);

    // Le filtre suit dans l'Analytique et borne le périmètre analysé (mêmes équipes que les deux autres vues).
    await page.getByRole('navigation', { name: 'Vues des équipes' }).getByRole('link', { name: 'Analytique' }).click();
    await expect(page).toHaveURL('/equipes/analytique?code=C');
    await expect(page.getByRole('heading', { name: 'Répartition de la paie par équipe · août 2026' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Évolution mensuelle par équipe' })).toBeVisible();
    await expect(page.getByText('Répartir par')).toHaveCount(0);
    await expect(page.getByText('Pyramide des âges')).toHaveCount(0);
    await expect(page.getByText('Ancienneté')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Exporter la situation de paie par équipe en PDF' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporter l’évolution mensuelle des indicateurs de paie par équipe en PDF' })).toBeVisible();
    const repartition = page.locator('.perimetre-analytique__section').filter({ hasText: 'Répartition de la paie par équipe' });
    const evolution = page.locator('.perimetre-analytique__section').filter({ hasText: 'Évolution mensuelle par équipe' });
    const indicateursRepartition = repartition.getByRole('combobox', { name: 'Indicateurs de la répartition par équipe' });
    const indicateursEvolution = evolution.getByRole('combobox', { name: 'Indicateurs de l’évolution mensuelle par équipe' });
    await indicateursRepartition.click();
    await expect(page.getByRole('option')).toHaveCount(4);
    await page.getByRole('option', { name: 'Masse salariale (DH)' }).click();
    await indicateursEvolution.click();
    await page.getByRole('option', { name: 'STC (personnes)' }).click();
    await expect(repartition.locator('.perimetre-analytique__graphique-indicateur')).toHaveCount(2);
    await expect(evolution.locator('.perimetre-analytique__graphique-indicateur')).toHaveCount(2);
    await expect(page.locator('.perimetre-analytique__donnees[open]')).toHaveCount(0);
    expect(mock.bodies['POST /paie/analytique']).toContainEqual({ periode: '2026-08', equipeIds: [5, 6] });
    expect(mock.bodies['POST /paie/analytique']).toContainEqual({ periode: '2026-08', equipeIds: [5] });
    await expect(page.locator('.perimetre-analytique__section').filter({ hasText: 'Évolution mensuelle' })).toContainText('juillet 2026');
    const chantier = evolution.getByRole('combobox', { name: 'Chantier' });
    await chantier.fill('Nador');
    await page.getByRole('option', { name: 'Nador' }).click();
    await expect(page).toHaveURL('/equipes/analytique?code=C&chantierIds=9');
    await expect.poll(() => mock.bodies['POST /paie/analytique'].some((body) => body.chantierIds?.includes(9) && body.equipeIds?.includes(5))).toBe(true);
    await expect(page.locator('.perimetre-analytique__section').filter({ hasText: 'Répartition de la paie par équipe' }).getByRole('combobox', { name: 'Chantier' })).toHaveValue('Nador');
    await evolution.getByRole('button', { name: 'Effacer la sélection' }).first().click();
    await expect(page).toHaveURL('/equipes/analytique?code=C');
    await page.getByRole('navigation', { name: 'Vues des équipes' }).getByRole('link', { name: 'Cartes' }).click();

    await carte.getByRole('link', { name: 'Voir l’historique Paie de Chauffeurs' }).click();
    await expect(page).toHaveURL('/equipes/analytique?code=C&equipeIds=5');
    await expect(page.getByRole('heading', { name: 'Évolution mensuelle par équipe' })).toBeVisible();
    await expect(page.locator('.perimetre-analytique__section').filter({ hasText: 'Évolution mensuelle par équipe' })).toContainText('juillet 2026');
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
    await expect(page.getByText('L’effectif mensuel par équipe n’est pas disponible pour votre compte.')).toBeVisible();
    expect(mock.calls.filter((appel) => appel.includes('/paie') || appel.includes('/employees'))).toEqual([]);
  });
});
