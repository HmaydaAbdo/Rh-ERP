import { defineConfig } from 'vitest/config';

// Le pré-bundler de Vitest résout `fflate` (dépendance de `pmtiles`) avec la condition `node`, qui importe
// `createRequire` et casse le chargement dans le navigateur. Le build de production prend déjà la version navigateur.
export default defineConfig({
  resolve: {
    alias: [{ find: /^fflate$/, replacement: 'fflate/browser' }]
  }
});
