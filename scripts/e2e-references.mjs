// Régénère les captures de référence de la galerie (docs/frontend/references/) : clair et sombre, ordinateur et téléphone.
// À lancer depuis frontend/ (`npm run e2e:references`) ; E2E_PORT désigne un serveur de développement déjà démarré.
import { spawnSync } from 'node:child_process';

const resultat = spawnSync('npx', ['playwright', 'test', 'galerie-references.spec.ts', '--project=chromium', '--workers=1'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_REFERENCES: '1' }
});
process.exit(resultat.status ?? 1);
