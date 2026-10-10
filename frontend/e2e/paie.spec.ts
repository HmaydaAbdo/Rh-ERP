import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['PAIE_READ', 'PAIE_WRITE', 'PAIE_DELETE', 'PAIE_IMPORT', 'PAIE_EXPORT', 'CHANTIER_READ', 'EQUIPE_READ', 'FUNCTION_READ'];

const BULLETIN = {
  id: 11,
  employee: { id: 4, nomPrenom: 'ALAMI Karim', cin: 'AB1234' },
  fonction: { id: 2, libelle: 'CH. CAMION' },
  chantier: { id: 3, code: 'C168', designation: 'Nador' },
  equipe: { id: 5, code: 'CH', libelle: 'Chauffeurs' },
  periode: '2026-08',
  nombreJoursTravailles: 26,
  joursRecuperationOuvrable: 0,
  joursRecuperationDimanche: 0,
  salaireMensuel: 4500,
  primeRoulageOrdinaire: 300,
  primeRoulageDimanche: 0,
  salaireTotal: 4800,
  observation: null
};

const PERIODES = [
  { periode: '2026-08', nombreBulletins: 1, nombreChantiers: 1, masse: 4800, stc: 0 },
  { periode: '2026-07', nombreBulletins: 1, nombreChantiers: 1, masse: 4600, stc: 0 }
];

const CHANTIERS = [
  { id: 3, code: 'C168', libelle: 'Nador', effectif: 1, masse: 4800, equipes: [{ id: 5, code: 'CH', libelle: 'Chauffeurs', effectif: 1, masse: 4800 }] }
];

function routes() {
  return {
    'POST /paie/search': () => pageDe([BULLETIN]),
    'GET /paie/periodes': () => PERIODES,
    'POST /paie/periodes/search': () => PERIODES,
    'POST /paie/chantiers/search': () => CHANTIERS,
    'GET /paie/chantiers': () => CHANTIERS,
    'GET /paie/materiel': () => [],
    'POST /chantiers/search': () => pageDe([]),
    'POST /equipes/search': () => pageDe([]),
    'POST /functions/search': () => pageDe([])
  };
}

test.describe('Paie', () => {
  test('affiche les bulletins et les trois vues, sans violation d’accessibilité', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: DROITS }, routes());
    await page.goto('/paie');

    await expect(page.getByRole('heading', { name: 'Paie' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'ALAMI Karim', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Vue de la paie' }).getByRole('link')).toHaveCount(3);

    const resultats = await new AxeBuilder({ page }).analyze();
    expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('les filtres de l’URL sont envoyés à la recherche', async ({ page }) => {
    const mock = await mockApi(page, { username: 'paie', permissions: DROITS }, routes());
    await page.goto('/paie?periode=2026-08&cin=AB1');

    await expect.poll(() => (mock.bodies['POST /paie/search'] ?? []).at(-1)).toMatchObject({ periode: '2026-08', cin: 'AB1' });
  });

  test('passe de la vue tabulaire aux cartes puis à l’analytique', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: DROITS }, { ...routes(), 'POST /paie/analytique': () => ({}) });
    await page.goto('/paie');

    const vues = page.getByRole('navigation', { name: 'Vue de la paie' });
    await vues.getByRole('link', { name: 'Cartes' }).click();
    await expect(page).toHaveURL(/\/paie\/cartes$/);
    await expect(page.getByText('4 800').first()).toBeVisible();

    await vues.getByRole('link', { name: 'Analytique' }).click();
    await expect(page).toHaveURL(/\/paie\/analytique/);
  });

  test('l’assistant d’export s’ouvre, se pilote au clavier et se ferme avec Échap', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: DROITS }, routes());
    await page.goto('/paie');

    await page.getByRole('button', { name: 'Exporter' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Exporter la paie' });
    await expect(dialogue).toBeVisible();
    await expect(dialogue.getByRole('button', { name: 'Continuer' })).toBeVisible();

    const resultats = await new AxeBuilder({ page }).include('[role=dialog]').analyze();
    expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(dialogue).toHaveCount(0);
  });

  test('le menu d’import propose le modèle Excel au clavier', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: DROITS }, routes());
    await page.goto('/paie');

    await page.getByRole('button', { name: 'Autres actions d’import' }).click();
    await expect(page.getByRole('menuitem', { name: 'Télécharger le modèle Excel' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: 'Télécharger le modèle Excel' })).toBeHidden();
  });

  test('la fiche d’un bulletin s’ouvre depuis la liste', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: DROITS }, { ...routes(), 'GET /paie/11': () => BULLETIN });
    await page.goto('/paie');

    await page.getByRole('button', { name: 'Voir le bulletin de ALAMI Karim' }).click();
    await expect(page).toHaveURL(/\/paie\/11$/);
    await expect(page.getByRole('heading', { name: /ALAMI Karim/ })).toBeVisible();
  });
});
