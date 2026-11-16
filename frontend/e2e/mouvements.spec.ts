import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

import { mockApi } from './support/api-mock';

const ENTRANTS = {
  periode: '2026-10',
  comparable: true,
  nombre: 3,
  nouvellesEmbauches: 2,
  retours: 1,
  entrants: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', type: 'NOUVELLE_EMBAUCHE', fonctionId: 1, fonction: 'Maçon', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'Gros œuvre', montantBulletin: 3000 },
    { employeId: 5, nomPrenom: 'Sara Idrissi', cin: 'AB2', periode: '2026-10', type: 'NOUVELLE_EMBAUCHE', fonctionId: 1, fonction: 'Maçon', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'Gros œuvre', montantBulletin: 2500 },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', type: 'RETOUR', fonctionId: 2, fonction: 'Grutier', chantierId: 4, chantier: 'C58', montantBulletin: 2000 }
  ]
};

const SORTIES = {
  periode: '2026-10',
  nombre: 3,
  parMotif: { ABANDON: 1, STC: 2 },
  sorties: [
    { employeId: 4, nomPrenom: 'Adam Alaoui', cin: 'AB1', periode: '2026-10', motif: 'STC', fonctionId: 1, fonction: 'Maçon', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'Gros œuvre', ancienneteMois: 14, montantDernierBulletin: 3000, statutActuel: 'INACTIF' },
    { employeId: 5, nomPrenom: 'Sara Idrissi', cin: 'AB2', periode: '2026-10', motif: 'STC', fonctionId: 1, fonction: 'Maçon', chantierId: 3, chantier: 'C57', equipeId: 9, equipe: 'Gros œuvre', ancienneteMois: 30, montantDernierBulletin: 2500, statutActuel: 'INACTIF' },
    { employeId: 7, nomPrenom: 'Zoe Benani', cin: 'CD2', periode: '2026-10', motif: 'ABANDON', fonctionId: 2, fonction: 'Grutier', chantierId: 4, chantier: 'C58', ancienneteMois: 10, montantDernierBulletin: 2000, statutActuel: 'ACTIF' }
  ]
};

const DOMAINES = [
  { nom: 'entrants', titre: 'Entrants', vues: 'Vues des entrants', route: 'POST /employees/entrants-mois', donnees: ENTRANTS, categorie: 'Type d’entrée', premiereCategorie: 'Nouvelle embauche', filtreListe: 'valeurs=NOUVELLE_EMBAUCHE' },
  { nom: 'sorties', titre: 'STC / Sortie', vues: 'Vues des sorties', route: 'POST /employees/sorties-mois', donnees: SORTIES, categorie: 'Motif', premiereCategorie: 'STC', filtreListe: 'valeurs=STC' }
] as const;

async function axe(page: Page): Promise<string[]> {
  return (await new AxeBuilder({ page }).analyze()).violations.map((violation) => violation.id);
}

for (const domaine of DOMAINES) {
  test.describe(domaine.titre, () => {
    test(`parcourt les trois vues en gardant le mois et les filtres de l’URL (axe clair et sombre)`, async ({ page }) => {
      const mock = await mockApi(page, { username: 'rh', permissions: ['EMPLOYEE_READ', 'EMPLOYEE_EXPORT', 'PAIE_READ'] }, { [domaine.route]: () => domaine.donnees });
      await page.goto(`/${domaine.nom}?periode=2026-10`);

      // Vue Tabulaire : les lignes du mois.
      await expect(page.getByRole('heading', { level: 1, name: domaine.titre })).toBeVisible();
      await expect(page.getByRole('gridcell', { name: 'Adam Alaoui' })).toBeVisible();
      expect(await axe(page)).toEqual([]);

      // Vue Cartes : une carte par chantier, qui renvoie à la liste filtrée.
      const onglets = page.getByRole('navigation', { name: domaine.vues });
      await onglets.getByRole('link', { name: 'Cartes' }).click();
      await expect(page).toHaveURL(new RegExp(`/${domaine.nom}/cartes\\?periode=2026-10$`));
      const carte = page.locator('.app-entity').filter({ hasText: 'C57' });
      await expect(carte).toContainText('2');
      await expect(carte.locator('.app-entity__footer')).toHaveCSS('justify-content', 'flex-start');
      expect(await axe(page)).toEqual([]);

      await page.getByRole('combobox', { name: 'Regrouper les cartes par' }).click();
      await page.getByRole('option', { name: domaine.categorie }).click();
      await expect(page.locator('.app-entity__name').first()).toHaveText(domaine.premiereCategorie);
      await page.locator('.app-entity').first().getByRole('link', { name: /Voir la liste/ }).click();
      await expect(page).toHaveURL(new RegExp(`/${domaine.nom}\\?.*${domaine.filtreListe}`));

      // Vue Analytique : un graphique et son tableau de données par dimension.
      await onglets.getByRole('link', { name: 'Analytique' }).click();
      await expect(page).toHaveURL(new RegExp(`/${domaine.nom}/analytique\\?`));
      await expect(page.getByRole('heading', { name: 'Répartition par chantier' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Répartition par équipe' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Répartition par fonction' })).toBeVisible();
      await expect(page.locator('stp-chart')).toHaveCount(3);
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await page.evaluate((valeur) => document.documentElement.setAttribute('data-theme', valeur), theme);
        expect(await axe(page), `axe ${theme}`).toEqual([]);
      }

      // Le mois est chargé une fois par changement de filtre, pas une fois par onglet.
      expect(mock.calls.filter((appel) => appel === domaine.route).length).toBeLessThanOrEqual(4);
    });

    test('exporte le PDF seulement avec le droit d’export', async ({ page }) => {
      await mockApi(page, { username: 'lecteur', permissions: ['EMPLOYEE_READ'] }, { [domaine.route]: () => domaine.donnees });
      await page.goto(`/${domaine.nom}/cartes`);

      await expect(page.getByRole('button', { name: /Exporter en PDF/ })).toHaveCount(0);
    });
  });
}

test('Entrants : explique qu’un mois sans bulletin ne permet pas de comparer', async ({ page }) => {
  await mockApi(page, { username: 'rh', permissions: ['EMPLOYEE_READ'] }, { 'POST /employees/entrants-mois': () => ({ ...ENTRANTS, comparable: false, nombre: 0, nouvellesEmbauches: 0, retours: 0, entrants: [] }) });
  await page.goto('/entrants/analytique?periode=2026-10');

  await expect(page.getByText('Entrants indisponibles')).toBeVisible();
});
