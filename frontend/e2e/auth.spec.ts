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

  test('centre la récupération du mot de passe sur ordinateur et téléphone', async ({ page }) => {
    await mockApi(page, null, { 'POST /auth/forgot-password': () => null });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/forgot-password');

    await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Retour à la connexion' })).toBeVisible();
    await expect(page.getByText(/Staport|Espace privé|Fonctionnalités|Paie et ressources humaines/i)).toHaveCount(0);

    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      const carte = await page.locator('.auth-card').boundingBox();
      expect(carte).not.toBeNull();
      expect(Math.abs(carte!.x + carte!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
      // Sur un téléphone, le contenu peut dépasser la hauteur utile : le navigateur privilégie
      // alors un début de carte visible plutôt qu’un centrage qui masquerait le formulaire.
      const ecartVertical = Math.abs(carte!.y + carte!.height / 2 - viewport.height / 2);
      expect(ecartVertical).toBeLessThanOrEqual(viewport.width < 500 ? 64 : 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    const accessibilite = await new AxeBuilder({ page }).analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);
  });

  test('centre le nouveau mot de passe et reste lisible en couleurs forcées', async ({ page }) => {
    await mockApi(page, null);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/reset-password?token=preview');
    await page.setViewportSize({ width: 1280, height: 720 });

    await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nouveau mot de passe' })).toBeVisible();
    const carte = await page.locator('.auth-card').boundingBox();
    expect(carte).not.toBeNull();
    expect(Math.abs(carte!.x + carte!.width / 2 - 640)).toBeLessThanOrEqual(1);
    expect(Math.abs(carte!.y + carte!.height / 2 - 360)).toBeLessThanOrEqual(1);

    const accessibilite = await new AxeBuilder({ page }).analyze();
    expect(accessibilite.violations.map((v) => v.id)).toEqual([]);

    await page.emulateMedia({ forcedColors: 'active' });
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    expect(await page.locator('.auth-page').evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
  });
});
