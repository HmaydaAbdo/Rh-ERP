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
const EMPLOYE = {
  id: 9, version: 0, nomPrenom: 'ALAMI Karim', cin: 'AB1234', dateNaissance: '1988-04-12', dateEmbauche: '2019-03-01',
  fonction: { id: 2, libelle: 'CH. CAMION' }, chantier: { id: 3, code: 'C168' }, equipe: null, salaire: null, typeSalaire: null, statut: 'ACTIF'
};

function routes() {
  return {
    'POST /employees/regroupements': (requete: { url: () => string }) =>
      new URL(requete.url()).searchParams.get('dimension') === 'EQUIPE' ? EQUIPES : CHANTIERS,
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
    'POST /chantiers/search': () => pageDe([]),
    'POST /equipes/search': () => pageDe([]),
    'POST /functions/search': () => pageDe([])
  };
}

test.describe('Employés — Cartes et Analytique', () => {
  test('descend dans l’effectif en choisissant par quoi regrouper, puis ouvre la liste sur le même périmètre', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    await page.goto('/employees/cartes');

    await expect(page.getByRole('navigation', { name: 'Vue des employés' }).getByRole('link')).toHaveCount(3);
    await page.getByRole('button', { name: 'Ouvrir C168' }).click();
    await expect(page).toHaveURL(/\/employees\/cartes\?chantierIds=3$/);
    await expect(page.getByRole('navigation', { name: /Position dans les employés/ })).toContainText('Chantier C168');
    await expect(page.getByRole('button', { name: /Sans équipe/ })).toBeVisible();

    await page.getByRole('group', { name: 'Regrouper par' }).getByRole('button', { name: 'Employés' }).click();
    await expect(page.getByRole('link', { name: /ALAMI Karim/ })).toHaveAttribute('href', '/employees/9');
    const accessibilite = await new AxeBuilder({ page }).include('.perimetre-cartes').analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);

    await page.getByRole('link', { name: 'Voir la liste' }).click();
    await expect(page).toHaveURL(/\/employees\?chantierIds=3$/);
  });

  test('l’Analytique montre les chiffres clés, les tranches et les mouvements de la paie', async ({ page }) => {
    await mockApi(page, { username: 'rh', permissions: DROITS }, routes());
    await page.goto('/employees/analytique');

    await expect(page.getByText('37,4 ans')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pyramide des âges' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mouvements mois par mois' })).toBeVisible();
    const accessibilite = await new AxeBuilder({ page }).include('.perimetre-analytique').analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);
  });
});
