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

const ANALYTIQUE = {
  periode: '2026-08',
  kpis: { masse: 4800, effectif: 1, coutMoyen: 4800, nombreChantiers: 1, stc: 0 },
  moisPrecedent: null,
  parChantier: [{ id: 3, code: 'C168', libelle: 'Nador', masse: 4800, effectif: 1, stc: 0 }],
  parFonction: [{ id: 2, libelle: 'CH. CAMION', masse: 4800, effectif: 1, stc: 0, stcMontant: 0 }],
  tranches: [{ min: 0, max: null, effectif: 1 }],
  evolution: [{ periode: '2026-08', masse: 4800, effectif: 1 }],
  qualite: { sansEquipe: 0, sansObservation: 0 }
};

function routes() {
  return {
    'POST /paie/search': () => pageDe([BULLETIN]),
    'GET /paie/periodes': () => PERIODES,
    'POST /paie/periodes/search': () => PERIODES,
    'POST /paie/chantiers/search': () => CHANTIERS,
    'GET /paie/chantiers': () => CHANTIERS,
    'POST /paie/options/chantiers': () => pageDe([{ id: 3, code: 'C168', designation: 'Nador', actif: true }]),
    'POST /paie/options/equipes': () => pageDe([{ id: 5, code: 'CH', libelle: 'Chauffeurs' }]),
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

  test('le sélecteur de colonnes reste visible, défile et montre une case par option sur mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await mockApi(page, { username: 'paie', permissions: DROITS }, routes());
    await page.goto('/paie');

    const champ = page.getByRole('combobox', { name: 'Choisir les colonnes visibles' });
    await champ.click();
    const liste = page.getByRole('listbox');
    const options = liste.getByRole('option');
    await expect(options).toHaveCount(16);
    await expect(liste.locator('.stp-select__checkbox')).toHaveCount(16);
    await expect(liste.locator('.stp-select__checkbox').first()).toBeVisible();

    const limites = await liste.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right };
    });
    expect(limites.left).toBeGreaterThanOrEqual(0);
    expect(limites.right).toBeLessThanOrEqual(390);

    const derniereOption = options.last();
    await page.keyboard.press('End');
    await expect(champ).toHaveAttribute('aria-activedescendant', await derniereOption.getAttribute('id'));
    await expect.poll(() => liste.evaluate((element) => (element as HTMLElement).scrollTop)).toBeGreaterThan(0);
    await expect(derniereOption).toBeInViewport();
  });

  test('les filtres de l’URL sont envoyés à la recherche', async ({ page }) => {
    const mock = await mockApi(page, { username: 'paie', permissions: DROITS }, routes());
    await page.goto('/paie?periode=2026-08&cin=AB1');

    await expect.poll(() => (mock.bodies['POST /paie/search'] ?? []).at(-1)).toMatchObject({ periode: '2026-08', cin: 'AB1' });
  });

  test('passe de la vue tabulaire aux cartes puis à l’analytique', async ({ page }) => {
    await mockApi(page, { username: 'paie', permissions: DROITS }, { ...routes(), 'POST /paie/analytique': () => ANALYTIQUE });
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

  test('exporte un PDF limité à un marché, sans vue d’ensemble', async ({ page }) => {
    const mock = await mockApi(page, { username: 'paie', permissions: DROITS }, { ...routes(), 'POST /paie/report/pdf': () => ({}) });
    await page.goto('/paie');

    await page.getByRole('button', { name: 'Exporter' }).click();
    const dialogue = page.getByRole('dialog', { name: 'Exporter la paie' });
    await dialogue.getByRole('button', { name: 'Continuer' }).click(); // mois
    await dialogue.getByRole('button', { name: 'Continuer' }).click(); // format PDF (par défaut)

    await expect(dialogue.getByRole('group', { name: 'Marchés du rapport' })).toBeVisible();
    const accessibilite = await new AxeBuilder({ page }).include('[role=dialog]').analyze();
    expect(accessibilite.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

    await dialogue.getByRole('checkbox', { name: /C168/ }).check();
    await expect(dialogue.getByRole('checkbox', { name: /Sans vue d.ensemble/ })).toBeChecked();
    await dialogue.getByRole('button', { name: 'Continuer' }).click(); // équipes : le chantier seul
    await expect(dialogue.getByText('C168', { exact: true })).toBeVisible();
    await dialogue.getByRole('button', { name: 'Continuer' }).click(); // récapitulatif

    await expect(dialogue.getByText('C168 — Nador')).toBeVisible();
    await expect(dialogue.getByText(/Retirée/)).toBeVisible();
    await dialogue.getByRole('button', { name: 'Générer le PDF' }).click();

    await expect.poll(() => mock.bodies['POST /paie/report/pdf']?.[0]).toMatchObject({ periode: '2026-08', chantierIds: [3], sansVueEnsemble: true });
  });
  test('importe la paie du mois suivant : met une fiche à jour, confirme les départs, puis importe', async ({ page }) => {
    const ecart = { employeId: 4, numeroLigne: 4, cin: 'AB1234', nomPrenom: 'ALAMI Karim', typeSalaire: 'MENSUEL',
      champs: [{ champ: 'chantier', base: 'C059', fichier: 'C168' }] };
    const analyse = { periode: '2026-09', totalLignes: 1, erreurs: [], chantiersClotures: [], cinInconnus: [], ecarts: [ecart],
      departs: [{ employeId: 7, cin: 'CD5678', nomPrenom: 'BENNANI Omar', motif: null }], retours: [], pret: false };
    const mock = await mockApi(page, { username: 'paie', permissions: [...DROITS, 'EMPLOYEE_WRITE'] }, {
      ...routes(),
      'POST /paie/import/analyse': () => analyse,
      'POST /paie/import/corrections': () => ({ ...analyse, ecarts: [], pret: true }),
      'POST /paie/import': () => ({ periode: '2026-09', crees: 1, departs: 1, retours: 0 })
    });
    await page.goto('/paie');

    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    const dialogue = page.getByRole('dialog', { name: 'Importer la paie' });
    await expect(dialogue.getByText('septembre 2026')).toBeVisible();
    await dialogue.locator('input[type="file"]').setInputFiles({ name: 'paie-09.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });

    await expect(dialogue.getByText('Fiches différentes du fichier')).toBeVisible();
    await expect(dialogue.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    const accessibilite = await new AxeBuilder({ page }).include('.import-wizard').analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);
    await dialogue.getByRole('button', { name: 'Mettre à jour la fiche de ALAMI Karim' }).click();
    await expect(dialogue.getByText('Aucun problème')).toBeVisible();
    await dialogue.getByRole('button', { name: 'Continuer' }).click();

    await expect(dialogue.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    await dialogue.getByLabel('Motif du départ de BENNANI Omar').fill('Démission');
    await dialogue.getByRole('button', { name: 'Continuer' }).click();
    await dialogue.getByRole('button', { name: 'Importer la paie' }).click();

    await expect(dialogue.getByText('Paie de septembre 2026 importée')).toBeVisible();
    expect(String(mock.bodies['POST /paie/import/corrections']?.[0])).toContain('{"aligner":[{"employeId":4,"typeSalaire":null}],"creer":[]}');
    expect(String(mock.bodies['POST /paie/import']?.[0])).toContain('{"departs":[{"employeId":7,"motif":"Démission"}]}');
  });

  test('rouvre un chantier clôturé depuis l’assistant, puis réanalyse le même fichier', async ({ page }) => {
    let rouvert = false;
    const analyse = () => ({ periode: '2026-09', totalLignes: 2, erreurs: [], cinInconnus: [], ecarts: [], departs: [], retours: [],
      chantiersClotures: rouvert ? [] : [{ chantierId: 3, code: 'C168', designation: 'Nador', lignes: [4, 5] }], pret: rouvert });
    const mock = await mockApi(page, { username: 'paie', permissions: [...DROITS, 'CHANTIER_READ', 'CHANTIER_WRITE'] }, {
      ...routes(),
      'POST /paie/import/analyse': () => analyse(),
      'GET /chantiers/3': () => ({ id: 3, version: 2, code: 'C168', designation: 'Nador', nom: null, sourceErp: true, actif: rouvert }),
      'PUT /chantiers/3': () => {
        rouvert = true;
        return { id: 3, version: 3, code: 'C168', designation: 'Nador', nom: null, sourceErp: true, actif: true };
      }
    });
    await page.goto('/paie');

    await page.getByRole('button', { name: 'Importer', exact: true }).click();
    const dialogue = page.getByRole('dialog', { name: 'Importer la paie' });
    await dialogue.locator('input[type="file"]').setInputFiles({ name: 'paie-09.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });

    await expect(dialogue.getByRole('heading', { name: 'Chantiers clôturés' })).toBeVisible();
    await expect(dialogue.getByRole('button', { name: 'Continuer' })).toBeDisabled();
    const accessibilite = await new AxeBuilder({ page }).include('.import-wizard').analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);
    await dialogue.getByRole('button', { name: 'Rouvrir le chantier C168' }).click();

    await expect(dialogue.getByText('Aucun problème')).toBeVisible();
    expect(mock.bodies['PUT /chantiers/3']?.[0]).toMatchObject({ actif: true, version: 2 });
  });
});
