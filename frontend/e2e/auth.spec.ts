import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe, utilisateur } from './support/api-mock';

test.describe('Connexion', () => {
  test('affiche l’accueil de connexion sans violation d’accessibilité', async ({ page }) => {
    await mockApi(page, null);
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Bienvenue' })).toBeVisible();
    const resultats = await new AxeBuilder({ page }).analyze();
    expect(resultats.violations).toEqual([]);
  });

  test('redirige vers la connexion quand aucune session n’existe', async ({ page }) => {
    await mockApi(page, null);
    await page.goto('/functions');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('connecte l’utilisateur et ouvre le premier écran qu’il peut lire', async ({ page }) => {
    await mockApi(page, null, {
      'POST /auth/login': () => ({ accessToken: 'jeton-test', utilisateur: utilisateur({ username: 'rh', permissions: ['FUNCTION_READ'] }) }),
      'POST /functions/search': () => pageDe([{ id: 1, libelle: 'MACON' }])
    });
    await page.goto('/login');

    await page.getByLabel(/Nom d.utilisateur/).fill('rh');
    await page.getByLabel('Mot de passe', { exact: true }).fill('Secret-123');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/functions$/);
    await expect(page.getByRole('heading', { name: 'Fonctions' })).toBeVisible();
  });

  test('signale des identifiants refusés sans quitter la page', async ({ page }) => {
    await mockApi(page, null, {
      'POST /auth/login': (_requete, route) => {
        void route.fulfill({ status: 401, json: { message: 'Identifiants invalides' } });
        return null;
      }
    });
    await page.goto('/login');

    await page.getByLabel(/Nom d.utilisateur/).fill('rh');
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
