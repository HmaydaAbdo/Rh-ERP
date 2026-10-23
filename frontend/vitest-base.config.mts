import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const sharedPath = fileURLToPath(new URL('./src/app/shared', import.meta.url));
process.env['PLAYWRIGHT_BROWSERS_PATH'] ??= fileURLToPath(new URL('../.cache/playwright-browsers', import.meta.url));

// Le pré-bundler de Vitest résout `fflate` (dépendance de `pmtiles`) avec la condition `node`, qui importe
// `createRequire` et casse le chargement dans le navigateur. Le build de production prend déjà la version navigateur.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@shared/, replacement: sharedPath },
      { find: /^fflate$/, replacement: 'fflate/browser' }
    ]
  }
});
