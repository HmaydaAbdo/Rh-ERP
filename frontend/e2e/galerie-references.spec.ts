import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

/**
 * Captures de référence de la galerie de composants (`/catalogue`) : clair et sombre, ordinateur et téléphone.
 * Elles servent de repère visuel lors d'une revue ; elles ne sont pas comparées pixel à pixel (les polices et le rendu varient d'une
 * machine à l'autre). Régénération : `npm run e2e:references` (écrit dans `site/docs/frontend/references/`).
 */
test.skip(!process.env['E2E_REFERENCES'], 'Captures de référence : lancer `npm run e2e:references`.');

const DOSSIER = resolve(process.cwd(), '..', 'site', 'docs', 'frontend', 'references');

for (const theme of ['light', 'dark'] as const) {
  for (const [vue, taille] of [['ordinateur', { width: 1280, height: 800 }], ['telephone', { width: 390, height: 844 }]] as const) {
    test(`galerie ${theme} — ${vue}`, async ({ page }) => {
      await page.setViewportSize(taille);
      await page.addInitScript((valeur) => localStorage.setItem('staport-theme', valeur), theme);
      await page.goto('/catalogue');
      await expect(page.getByRole('heading', { name: 'Vocabulaire partagé' })).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({ path: resolve(DOSSIER, `galerie-${theme}-${vue}.png`), fullPage: true, animations: 'disabled' });
    });
  }
}
