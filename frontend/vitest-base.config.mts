import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sharedPath = fileURLToPath(new URL('./src/app/shared', import.meta.url));
const cryptoNavigateur = fileURLToPath(new URL('./src/testing/crypto-navigateur.ts', import.meta.url));
process.env['PLAYWRIGHT_BROWSERS_PATH'] ??= fileURLToPath(new URL('./.angular/playwright-browsers', import.meta.url));

// Le pré-bundler de Vitest résout `fflate` (dépendance de `pmtiles`) avec la condition `node`, qui importe
// `createRequire` et casse le chargement dans le navigateur. Le build de production prend déjà la version navigateur.
// Sur les machines partagées de la CI, Chromium met parfois plus de 60 s (défaut) à se connecter : sans cette marge, le test échoue
// avec « Failed to connect to the browser session » sans qu'aucun test ne soit en cause (constaté sur la PR 194).
export default defineConfig({
  test: { browser: { connectTimeout: 180_000 } },
  resolve: {
    alias: [
      { find: /^@shared/, replacement: sharedPath },
      { find: /^fflate$/, replacement: 'fflate/browser' },
      { find: /^(node:)?crypto$/, replacement: cryptoNavigateur }
    ]
  }
});
