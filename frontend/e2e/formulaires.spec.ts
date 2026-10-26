import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'FUNCTION_READ', 'CHANTIER_READ', 'PAIE_READ', 'PAIE_WRITE', 'EQUIPE_READ', 'USER_MANAGE', 'ROLE_MANAGE'];

const FONCTIONS = pageDe([
  { id: 1, libelle: 'MACON' },
  { id: 3, libelle: 'CHAUFFEUR' }
]);
const CHANTIERS = pageDe([
  { id: 2, code: 'C196', designation: 'Marrakech', actif: true },
  { id: 4, code: 'C168', designation: 'Nador', actif: true }
]);
const EMPLOYES = pageDe([{ id: 9, nomPrenom: 'Ali Alaoui', cin: 'AB123' }]);

/** Ouvre un sélecteur à chargement différé (clic, comme l'utilisateur) et choisit l'option. */
async function choisir(page: Page, nom: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: nom }).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe('Formulaires (Signal Forms)', () => {
  test.describe('employé', () => {
    const routes = {
      'POST /functions/search': () => FONCTIONS,
      'POST /chantiers/search': () => CHANTIERS,
      'POST /equipes/search': () => pageDe([]),
      'GET /functions/*': () => ({ id: 3, libelle: 'CHAUFFEUR' }),
      'GET /chantiers/*': () => ({ id: 4, code: 'C168', designation: 'Nador', actif: true })
    };

    test('signale chaque champ obligatoire, met le focus sur le premier et reste accessible', async ({ page }) => {
      const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, routes);
      await page.goto('/employees/new');

      await page.getByRole('button', { name: 'Créer' }).click();

      await expect(page.getByRole('alert')).toHaveCount(6);
      await expect(page.getByLabel('Nom & prénom')).toBeFocused();
      expect(mock.calls).not.toContain('POST /employees');
      const accessibilite = await new AxeBuilder({ page }).analyze();
      expect(accessibilite.violations.map((v) => v.id)).toEqual([]);
    });

    test('crée un employé : dates, fonction et chantier choisis au clavier et à la souris', async ({ page }) => {
      const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
        ...routes,
        'POST /employees': () => ({ id: 15 }),
        'GET /employees/15': () => ({ id: 15, nomPrenom: 'Zahra Idrissi', cin: 'CD456', dateNaissance: '1985-01-31', dateEmbauche: '2018-05-14', fonction: { id: 3, libelle: 'CHAUFFEUR' }, chantier: { id: 4, code: 'C168' }, equipe: null, salaire: null, typeSalaire: null, statut: 'ACTIF' })
      });
      await page.goto('/employees/new');

      await page.getByLabel('Nom & prénom').fill('Zahra Idrissi');
      await page.getByLabel('CIN').fill('CD456');
      await page.getByLabel('Date de naissance').fill('1985-01-31');
      await page.getByLabel('Date d\'embauche').fill('2018-05-14');
      await choisir(page, 'Fonction', 'CHAUFFEUR');
      await choisir(page, 'Chantier', 'C168');
      await expect(page.getByRole('combobox', { name: 'Fonction' })).toHaveValue('CHAUFFEUR');
      await page.getByRole('button', { name: 'Créer' }).click();

      await expect(page).toHaveURL(/\/employees\/15$/);
      expect(mock.bodies['POST /employees']).toEqual([
        { nomPrenom: 'Zahra Idrissi', cin: 'CD456', dateNaissance: '1985-01-31', dateEmbauche: '2018-05-14', fonctionId: 3, chantierId: 4, equipeId: null, salaire: null, typeSalaire: null }
      ]);
    });

    test('quitter un formulaire modifié demande confirmation ; rester conserve la saisie', async ({ page }) => {
      await mockApi(page, { username: 'rh', permissions: DROITS }, { ...routes, 'POST /employees/search': () => pageDe([]) });
      await page.goto('/employees/new');
      await page.getByLabel('Nom & prénom').fill('Brouillon');

      await page.getByRole('link', { name: 'Employés' }).first().click();
      const dialogue = page.getByRole('alertdialog');
      await expect(dialogue).toContainText('Quitter sans enregistrer ?');
      await dialogue.getByRole('button', { name: 'Rester' }).click();

      await expect(page).toHaveURL(/\/employees\/new$/);
      await expect(page.getByLabel('Nom & prénom')).toHaveValue('Brouillon');
    });
  });

  test.describe('bulletin de paie', () => {
    const routes = {
      'POST /employees/search': () => EMPLOYES,
      'POST /functions/search': () => FONCTIONS,
      'POST /chantiers/search': () => CHANTIERS,
      'POST /equipes/search': () => pageDe([]),
      'GET /employees/*': () => ({ id: 9, nomPrenom: 'Ali Alaoui', cin: 'AB123' }),
      'GET /functions/*': () => ({ id: 1, libelle: 'MACON' }),
      'GET /chantiers/*': () => ({ id: 2, code: 'C196', designation: 'Marrakech', actif: true })
    };

    test('saisit les montants au format français et choisit le mois dans le sélecteur', async ({ page }) => {
      const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
        ...routes,
        'POST /paie': () => ({ id: 40 }),
        'GET /paie/40': () => ({ id: 40, employee: { id: 9, nomPrenom: 'Ali Alaoui', cin: 'AB123' }, periode: '2026-08', fonction: { id: 1, libelle: 'MACON' }, chantier: { id: 2, code: 'C196', designation: 'Marrakech' }, equipe: null, nombreJoursTravailles: 26, joursRecuperationOuvrable: null, joursRecuperationDimanche: null, salaireMensuel: 4000.5, primeRoulageOrdinaire: null, primeRoulageDimanche: null, salaireTotal: 4000.5, observation: null })
      });
      await page.goto('/paie/new');

      await choisir(page, 'Employé', 'Ali Alaoui — AB123');
      await page.locator('button#periode').click();
      await page.getByRole('dialog', { name: 'Choisir un mois' }).getByRole('button', { name: 'Août' }).click();
      await expect(page.locator('button#periode')).toContainText(/08\/\d{4}/);
      await choisir(page, 'Fonction', 'MACON');
      await choisir(page, 'Chantier', 'C196');
      await page.getByLabel('Jours travaillés').fill('26');
      await page.getByLabel('Salaire mensuel').fill('4 000,50');
      await page.getByLabel('Salaire total').fill('4000,5');
      await page.getByLabel('Salaire total').blur();
      await expect(page.getByLabel('Salaire total')).toHaveValue(/4\s000,50/);
      await page.getByRole('button', { name: 'Créer' }).click();

      await expect(page).toHaveURL(/\/paie\/40$/);
      const [corps] = mock.bodies['POST /paie'] as Record<string, unknown>[];
      expect(corps).toMatchObject({ employeeId: 9, fonctionId: 1, chantierId: 2, nombreJoursTravailles: 26, salaireMensuel: 4000.5, salaireTotal: 4000.5 });
      expect(corps['periode']).toMatch(/^\d{4}-08$/);
    });

    test('un montant négatif saisi est ramené à zéro en quittant le champ', async ({ page }) => {
      await mockApi(page, { username: 'rh', permissions: DROITS }, routes);
      await page.goto('/paie/new');

      await page.getByLabel('Salaire mensuel').fill('-50');
      await page.getByLabel('Salaire mensuel').blur();

      await expect(page.getByLabel('Salaire mensuel')).toHaveValue('0,00');
    });
  });

  test('utilisateur : la règle du mot de passe est rappelée, le mot de passe peut être affiché', async ({ page }) => {
    const mock = await mockApi(page, { username: 'admin', permissions: DROITS }, {
      'GET /auth/password-policy': () => ({ longueurMinimale: 10 }),
      'POST /roles/search': () => pageDe([]),
      'POST /employees/search': () => pageDe([])
    });
    await page.goto('/admin/users/new');
    await page.getByLabel('Identifiant').fill('nouveau');
    await page.getByLabel('Email').fill('nouveau@staport.ma');
    await page.locator('input#motDePasse').fill('court');

    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page.getByRole('alert')).toContainText('10 caractères minimum');
    expect(mock.calls).not.toContain('POST /users');
    await expect(page.locator('input#motDePasse')).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Afficher le mot de passe' }).click();
    await expect(page.locator('input#motDePasse')).toHaveAttribute('type', 'text');
    const accessibilite = await new AxeBuilder({ page }).analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);
  });

  test('utilisateur : recherche les rôles côté serveur et enregistre la sélection multiple', async ({ page }) => {
    const role = { id: 10, version: 0, nom: 'Comptable', description: null, permissions: [], protege: false };
    const mock = await mockApi(page, { username: 'admin', permissions: DROITS }, {
      'GET /auth/password-policy': () => ({ longueurMinimale: 10 }),
      'POST /roles/search': () => pageDe([role]),
      'POST /employees/search': () => pageDe([]),
      'POST /users': () => ({ id: 30 }),
      'POST /users/search': () => pageDe([])
    });
    await page.goto('/admin/users/new');

    await page.getByLabel('Identifiant').fill('nouveau');
    await page.getByLabel('Email').fill('nouveau@staport.ma');
    await page.locator('input#motDePasse').fill('MotDePasse2026');
    const rolesField = page.getByRole('combobox', { name: 'Rôles' });
    await rolesField.click();
    await rolesField.pressSequentially('Comp');
    await expect.poll(() => mock.bodies['POST /roles/search']).toContainEqual({ nom: 'Comp' });
    await page.getByRole('option', { name: 'Comptable' }).click();
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page).toHaveURL(/\/admin\/users$/);
    expect(mock.bodies['POST /roles/search']).toContainEqual({ nom: 'Comp' });
    expect(mock.bodies['POST /users']).toEqual([{ username: 'nouveau', email: 'nouveau@staport.ma', motDePasse: 'MotDePasse2026', employeeId: null, roleIds: [10] }]);
  });

  test('rôle : cocher un domaine coche toutes ses permissions', async ({ page }) => {
    const mock = await mockApi(page, { username: 'admin', permissions: DROITS }, {
      'GET /permissions': () => [
        { id: 1, code: 'PAIE_READ', description: 'Lire la paie' },
        { id: 2, code: 'PAIE_WRITE', description: 'Modifier la paie' },
        { id: 3, code: 'EMPLOYEE_READ', description: 'Lire les employés' }
      ],
      'POST /roles/search': () => pageDe([]),
      'POST /roles': () => ({ id: 5 }),
      'GET /roles': () => []
    });
    await page.goto('/admin/roles/new');
    await expect(page.getByRole('heading', { name: 'Nouveau rôle' })).toBeVisible();
    // La barre latérale s'élargit en recouvrant le contenu tant que le pointeur la survole (il démarre en haut à gauche, sur elle) :
    // on l'écarte avant de cliquer dans la page, comme le fait un utilisateur qui a quitté le menu.
    await page.mouse.move(900, 300);

    await page.getByRole('checkbox', { name: 'Tout sélectionner : PAIE', exact: true }).check();
    await expect(page.getByRole('checkbox', { name: 'PAIE_WRITE', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'EMPLOYEE_READ', exact: true })).not.toBeChecked();
    await page.locator('#nom').fill('Comptable');
    await page.getByRole('button', { name: 'Créer' }).click();

    await expect(page).toHaveURL(/\/admin\/roles$/);
    expect(mock.bodies['POST /roles']).toEqual([{ nom: 'Comptable', description: null, permissionIds: [1, 2] }]);
  });
});
