import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours E2E du frontend contre une API simulée (voir `e2e/support/api-mock.ts`) : rapides, déterministes, sans backend.
 * Le contrat réel avec le backend est couvert par les tests d'intégration Spring ; ici on vérifie ce que l'utilisateur voit
 * et peut faire (connexion, permissions, listes, formulaires, export) et l'accessibilité (axe).
 * Hors CI, le Chrome installé sur la machine est utilisé ; en CI, `npx playwright install chromium`.
 */
const PORT = 4300;
const channel = process.env['CI'] ? undefined : 'chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Africa/Casablanca'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel }, testIgnore: /responsive\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel }, testMatch: /responsive\.spec\.ts/ }
  ],
  webServer: {
    command: `npx ng serve --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000
  }
});
