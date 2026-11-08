// Régénère les captures de référence (site/docs/frontend/references/) : la galerie, la paie sur ordinateur et les chantiers sur téléphone,
// en clair et en sombre.
// À lancer depuis frontend/ (`npm run e2e:references`) ; E2E_PORT désigne un serveur de développement déjà démarré.
import { spawnSync } from 'node:child_process';

const resultat = spawnSync('npx', ['playwright', 'test', 'galerie-references.spec.ts', 'ecrans-references.spec.ts', '--project=chromium', '--workers=1'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_REFERENCES: '1' }
});
process.exit(resultat.status ?? 1);
