import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi, page as pageDe } from './support/api-mock';

/**
 * E0.7 : garde automatisée du déploiement domaine par domaine. Chaque écran principal, dans les deux thèmes, sur ordinateur et sur
 * téléphone : aucun débordement horizontal de la page, aucune violation d'accessibilité, aucune erreur de console. La validation
 * visuelle reste celle du propriétaire (captures par `npm run e2e:references`).
 */
const DROITS = [
  'ACCUEIL_READ', 'ACCUEIL_WRITE', 'ACCUEIL_ADMIN',
  'EMPLOYEE_READ', 'EMPLOYEE_WRITE', 'CHANTIER_READ', 'CHANTIER_WRITE', 'FUNCTION_READ', 'FUNCTION_WRITE', 'EQUIPE_READ', 'EQUIPE_WRITE',
  'PAIE_READ', 'PAIE_EXPORT', 'PAIE_IMPORT', 'HEURES_SUPP_READ', 'USER_MANAGE', 'ROLE_MANAGE', 'PARAMETRE_READ', 'AUDIT_READ'
];

const ECRANS: string[] = [
  '/employees',
  '/chantiers',
  '/chantiers/cartes',
  '/functions',
  '/equipes',
  '/paie',
  '/paie/cartes',
  '/heures-supp',
  '/audit',
  '/admin/users',
  '/admin/roles',
  '/admin/parametres'
];

const VUES = [
  ['ordinateur', { width: 1280, height: 800 }],
  ['téléphone', { width: 390, height: 844 }]
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const [vue, taille] of VUES) {
    test.describe(`${theme} — ${vue}`, () => {
      for (const url of ECRANS) {
        test(`${url} reste net`, async ({ page }) => {
          const erreurs: string[] = [];
          page.on('pageerror', (e) => erreurs.push(e.message));
          await mockApi(page, { username: 'admin', permissions: DROITS }, {
            'POST /employees/search': () => pageDe([]),
            'POST /chantiers/search': () => pageDe([]),
            'POST /equipes/search': () => pageDe([]),
            'POST /functions/search': () => pageDe([]),
            'POST /users/search': () => pageDe([]),
            'POST /roles/search': () => pageDe([]),
            'POST /paie/search': () => pageDe([]),
            'POST /logs/search': () => pageDe([]),
            'GET /paie/periodes': () => [],
            'GET /accueil': () => ({ version: null, personnalise: false, indicateurs: [], disponibles: [] }),
            'GET /parametres': () => []
          });
          await page.setViewportSize(taille);
          await page.emulateMedia({ colorScheme: theme });
          await page.addInitScript((valeur) => localStorage.setItem('staport-theme', valeur), theme);
          await page.goto(url);
          await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
          await page.waitForTimeout(400);

          const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(debordement, 'débordement horizontal de la page').toBeLessThanOrEqual(0);
          const resultats = await new AxeBuilder({ page }).analyze();
          expect(resultats.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
          expect(erreurs).toEqual([]);
        });
      }
    });
  }
}
