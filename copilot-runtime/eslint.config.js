// Lint du runtime CopilotKit (ES modules Node) : règles recommandées d'ESLint, globaux Node. Lancé par `npm run lint` et par la CI.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      // Les variables inutilisées préfixées par `_` sont voulues (paramètres imposés par une signature).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
];
