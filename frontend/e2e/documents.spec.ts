import { expect, Page, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

const DROITS = ['DOCUMENT_ADMIN_EDITER', 'EMPLOYEE_READ'];
const EMPLOYE = {
  id: 9, version: 0, nomPrenom: 'ALAMI YOUSSEF', cin: 'AB123456', dateNaissance: '1990-03-07', dateEmbauche: '2024-06-01',
  fonction: { id: 1, libelle: 'CHAUFFEUR CAMION' }, chantier: { id: 2, code: 'C196' }, equipe: null, salaire: null,
  typeSalaire: null, statut: 'ACTIF', matriculeCnss: '123456789', dateDeclarationCnss: '2024-06-01', civilite: null
};

async function choisir(page: Page, nom: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: nom }).click();
  await page.getByRole('option', { name: option }).click();
}

test.describe('Documents administratifs', () => {
  test('attestation de travail : la civilité choisie reste choisie et part avec la demande du Word', async ({ page }) => {
    const mock = await mockApi(page, { username: 'rh', permissions: DROITS }, {
      'POST /employees/search': () => pageDe([EMPLOYE]),
      'GET /employees/9': () => EMPLOYE,
      'POST /employees/9/attestation-travail': (_requete, route) => {
        void route.fulfill({
          body: 'PK',
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        return null;
      }
    });
    await page.goto('/documents');

    await choisir(page, 'Employé', 'ALAMI YOUSSEF — AB123456');
    await expect(page.getByText('123456789')).toBeVisible();
    await choisir(page, 'Civilité', 'Madame');
    await expect(page.getByRole('combobox', { name: 'Civilité' })).toHaveValue('Madame');
    // Changer la civilité ne recharge pas la fiche (qui remettait sa propre civilité par-dessus le choix).
    expect(mock.calls.filter((appel) => appel === 'GET /employees/9').length).toBeLessThanOrEqual(2);

    await page.getByRole('combobox', { name: 'Civilité' }).click();
    await expect(page.getByRole('option')).toHaveText(['Monsieur', 'Madame']);
    await page.keyboard.press('Escape');

    await expect(page.getByRole('button', { name: 'Imprimer l’attestation' })).toHaveCount(0);
    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger en Word' }).click();
    expect((await telechargement).suggestedFilename()).toBe('Attestation_de_travail_AB123456.docx');
    expect(mock.bodies['POST /employees/9/attestation-travail']).toEqual([{ civilite: 'MADAME' }]);
  });
});
