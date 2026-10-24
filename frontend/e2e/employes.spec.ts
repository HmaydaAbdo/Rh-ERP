import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['EMPLOYEE_READ', 'PAIE_READ', 'CHANTIER_READ', 'EQUIPE_READ', 'FUNCTION_READ'];

const CHANTIERS = [
  { id: 3, code: 'C168', libelle: 'Nador', effectif: 30, actifs: 27 },
  { id: 4, code: 'C059', libelle: 'Voirie', effectif: 10, actifs: 10 }
];
const EQUIPES = [
  { id: 5, code: 'OP', libelle: 'Opérateurs', effectif: 20, actifs: 18 },
  { id: 0, code: null, libelle: 'Sans équipe', effectif: 10, actifs: 9 }
];
const FONCTIONS = [{ id: 2, code: null, libelle: 'CH. CAMION', effectif: 1, actifs: 1 }];
const EMPLOYE = {
  id: 9, version: 0, nomPrenom: 'ALAMI Karim', cin: 'AB1234', dateNaissance: '1988-04-12', dateEmbauche: '2019-03-01',
  fonction: { id: 2, libelle: 'CH. CAMION' }, chantier: { id: 3, code: 'C168' }, equipe: { id: 5, code: 'OP', libelle: 'Opérateurs' }, salaire: null, typeSalaire: null, statut: 'ACTIF'
};

function routes() {
  return {
    'POST /employees/regroupements': (requete: { url: () => string }) =>
      new URL(requete.url()).searchParams.get('dimension') === 'EQUIPE'
        ? EQUIPES
        : new URL(requete.url()).searchParams.get('dimension') === 'FONCTION' ? FONCTIONS : CHANTIERS,
    'POST /employees/analytique': () => ({
      effectif: 40, actifs: 37, inactifs: 3, ageMoyen: 37.4, ancienneteMoyenne: 5.2, embauchesDouzeMois: 6,
      parAge: [{ min: 0, max: 25, effectif: 4 }, { min: 25, max: 35, effectif: 16 }, { min: 55, max: null, effectif: 20 }],
      parAnciennete: [{ min: 0, max: 1, effectif: 6 }, { min: 1, max: null, effectif: 34 }]
    }),
    'GET /paie/periodes': () => [{ periode: '2026-09', nombreBulletins: 40, nombreChantiers: 2, masse: 200000, stc: 1, stcMontant: 5000 }],
    'POST /paie/analytique': () => ({
      periode: '2026-09',
      kpis: { masse: 200000, effectif: 40, coutMoyen: 5000, nombreChantiers: 2, stc: 1, stcMontant: 5000 },
      moisPrecedent: null, parEquipe: [], parFonction: [], tranches: [{ min: 0, max: null, effectif: 40 }], qualite: { sansEquipe: 0, sansObservation: 0 },
      parChantier: [{ id: 3, code: 'C168', libelle: 'Nador', masse: 150000, effectif: 30, stc: 1, stcMontant: 5000 }],
      evolution: [{ periode: '2026-09', masse: 200000, effectif: 40, stc: 1, stcMontant: 5000 }]
    }),
    'POST /paie/effectifs': () => [
      { periode: '2026-08', effectif: 38, entrees: null, sorties: 1, mutations: null },
      { periode: '2026-09', effectif: 40, entrees: 3, sorties: 1, mutations: 2 }
    ],
    'POST /employees/search': () => pageDe([EMPLOYE]),
    'GET /chantiers/3': () => ({ id: 3, code: 'C168', designation: 'Nador', actif: true }),
    'GET /equipes/5': () => ({ id: 5, code: 'OP', libelle: 'Opérateurs', actif: true }),
    'GET /functions/2': () => ({ id: 2, libelle: 'CH. CAMION', actif: true }),
    'POST /chantiers/search': () => pageDe([]),
    'POST /equipes/search': () => pageDe([]),
    'POST /functions/search': () => pageDe([])
  };
}

test.describe('Employés — Cartes et Analytique', () => {
  test('suit la hiérarchie chantier, équipe, fonction puis ouvre la liste sur le même périmètre', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    await page.goto('/employees/cartes');

    await expect(page.getByRole('navigation', { name: 'Vue des employés' }).getByRole('link')).toHaveCount(3);
    const exportPdf = page.getByRole('button', { name: 'Exporter les résultats de ce périmètre en PDF' });
    await expect(exportPdf).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(exportPdf).toBeVisible();
    const largeurApresRedimensionnement = await page.evaluate(() => new Promise<number>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.documentElement.scrollWidth)));
    }));
    expect(largeurApresRedimensionnement).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Ouvrir C168' }).click();
    await expect(page).toHaveURL(/\/employees\/cartes\?chantierIds=3$/);
    await expect(page.getByRole('navigation', { name: /Position dans les employés/ })).toContainText('Chantier C168');
    await expect(page.getByRole('button', { name: /Sans équipe/ })).toBeVisible();

    await page.getByRole('button', { name: 'Ouvrir Opérateurs' }).click();
    await expect(page).toHaveURL(/\/employees\/cartes\?chantierIds=3&equipeIds=5$/);
    await page.getByRole('button', { name: 'Ouvrir CH. CAMION' }).click();
    await expect(page).toHaveURL(/\/employees\/cartes\?chantierIds=3&equipeIds=5&fonctionIds=2$/);
    await expect(page.getByRole('link', { name: /ALAMI Karim/ })).toHaveAttribute('href', '/employees/9');
    const accessibilite = await new AxeBuilder({ page }).include('.perimetre-cartes').analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);

    await page.getByRole('link', { name: 'Voir la liste' }).click();
    await expect(page).toHaveURL(/\/employees\?(?=.*chantierIds=3)(?=.*equipeIds=5)(?=.*fonctionIds=2).*$/);
  });

  test('l’Analytique montre les chiffres clés, les tranches et les mouvements de la paie', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    await page.goto('/employees/analytique');

    await expect(page.getByText('37,4 ans')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pyramide des âges' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mouvements mois par mois' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exporter la pyramide des âges en PDF' })).toBeVisible();
    expect(await page.locator('.perimetre-analytique__section--exportable > app-pdf-export-button').count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('.perimetre-analytique__section--exportable > app-pdf-export-button button[aria-label^="Exporter"]')).toHaveCount(await page.locator('.perimetre-analytique__section--exportable > app-pdf-export-button').count());
    await expect(page.locator('a.stp-button', { hasText: 'Voir les cartes' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const accessibilite = await new AxeBuilder({ page }).include('.perimetre-analytique').analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);
  });
});
