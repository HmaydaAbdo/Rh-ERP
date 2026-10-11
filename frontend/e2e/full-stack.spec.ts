import { expect, test } from '@playwright/test';

test('parcourt les domaines avec le frontend, API et PostgreSQL réels', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel(/Nom d.utilisateur/).fill(process.env['ADMIN_USERNAME'] ?? 'ci-admin');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env['ADMIN_PASSWORD'] ?? 'ci-admin-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('a[href="/paie"]').first()).toBeVisible();

  for (const [url, titre] of [
    ['/employees', 'Employés'], ['/chantiers', 'Chantiers'], ['/functions', 'Fonctions'],
    ['/equipes', 'Équipes'], ['/paie', 'Paie'], ['/admin/users', 'Utilisateurs'],
    ['/admin/roles', 'Rôles'], ['/admin/parametres', 'Paramètres'], ['/audit', 'Journal d’audit']
  ] as const) {
    await page.locator(`a[href="${url}"]`).first().click();
    await expect(page.getByRole('heading', { name: titre })).toBeVisible();
  }
});
