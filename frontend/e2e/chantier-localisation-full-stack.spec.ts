import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('qualifie un chantier, affiche son point puis le retire de la carte avec la vraie API', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await page.getByLabel(/Nom d.utilisateur/).fill(process.env['ADMIN_USERNAME'] ?? 'ci-admin');
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env['ADMIN_PASSWORD'] ?? 'ci-admin-password');
  const connexion = page.waitForResponse(r => r.url().endsWith('/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  const session = await connexion;
  expect(session.status()).toBe(200);
  const { accessToken } = await session.json() as { accessToken: string };
  const api = process.env['BACKEND_URL'] ?? 'http://localhost:8080';
  const headers = { Authorization: `Bearer ${accessToken}` };
  const code = `GEO-E2E-${Date.now()}`;

  await page.locator('a[href="/chantiers"]').first().click();
  await page.getByRole('link', { name: 'Nouveau chantier' }).click();
  await page.getByRole('textbox', { name: 'Code', exact: true }).fill(code);
  await page.getByRole('textbox', { name: 'Désignation', exact: true }).fill('Site géographique synthétique');
  const nature = page.getByRole('combobox', { name: 'Nature du chantier', exact: true });
  await nature.click();
  await nature.fill('AO');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const afficherSurCarte = page.getByRole('combobox', { name: 'Afficher sur la carte', exact: true });
  await afficherSurCarte.click();
  await page.locator('.stp-select__option').filter({ hasText: 'Oui' }).click();
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByText('La localisation est obligatoire pour afficher le chantier sur la carte.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Lien Google Maps', exact: true }).fill('google.com/maps?q=31.12345678,-8.12345678&z=17&hl=fr');
  const creation = page.waitForResponse(r => r.url().endsWith('/chantiers') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  const reponse = await creation;
  expect(reponse.status()).toBe(201);
  const chantier = await reponse.json() as { id: number; latitude: number; longitude: number; afficherSurCarte: boolean };
  expect(chantier).toMatchObject({ latitude: 31.12345678, longitude: -8.12345678, afficherSurCarte: true });
  await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible();

  try {
    await page.locator('a[href="/carte"]').first().click();
    const marqueur = page.getByRole('button', { name: `Chantiers ${code} Site géographique synthétique`, exact: true });
    await expect(marqueur).toBeVisible();
    await marqueur.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.maplibregl-popup')).toContainText(code);

    await page.goto(`/chantiers/${chantier.id}/edit`);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(page.getByRole('combobox', { name: 'Nature du chantier', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const audit = await new AxeBuilder({ page }).analyze();
        expect(audit.violations.map(v => v.id)).toEqual([]);
        await page.screenshot({ path: `test-results/chantier-localisation-${theme}-${width}.png`, fullPage: true });
      }
    }
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(page.getByRole('textbox', { name: 'Lien Google Maps', exact: true })).toBeVisible();
    await page.emulateMedia({ forcedColors: 'none' });
    const desactiverCarte = page.getByRole('combobox', { name: 'Afficher sur la carte', exact: true });
    await desactiverCarte.click();
    await page.locator('.stp-select__option').filter({ hasText: 'Non' }).click();
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(page.getByRole('heading', { name: code, exact: true })).toBeVisible();
    const points = await (await page.request.get(`${api}/chantiers/carte`, { headers })).json() as { id: number }[];
    expect(points.some(p => p.id === chantier.id)).toBe(false);
    await page.locator('a[href="/carte"]').first().click();
    await expect(marqueur).toHaveCount(0);
  } finally {
    const suppression = await page.request.delete(`${api}/chantiers/${chantier.id}`, { headers });
    expect(suppression.status()).toBe(204);
  }
});
