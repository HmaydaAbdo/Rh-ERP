// Lint du frontend (angular-eslint + typescript-eslint, configuration plate officielle). Lancé par `npm run lint` et par la CI.
// Règles recommandées des deux projets ; les écarts assumés sont consignés ici, avec leur raison.
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = tseslint.config(
  { ignores: ['dist/**', 'coverage/**', '.angular/**', 'e2e/**', 'node_modules/**', '.vitest/**'] },
  {
    files: ['src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, ...tseslint.configs.stylistic, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      // Préfixes de sélecteurs : `app-` (application), `stp-` (composants partagés du design system).
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: ['app', 'stp'], style: 'camelCase' }],
      // Un composant peut se poser sur un élément natif (`button[stpButton]`) : sélecteur d'attribut permis.
      '@angular-eslint/component-selector': ['error', { type: ['element', 'attribute'], prefix: ['app', 'stp'], style: 'kebab-case' }],
      // Espaces insécables et fines des montants et des libellés français : voulus dans les chaînes, gabarits et commentaires.
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
      // Les variables inutilisées préfixées par `_` sont voulues (paramètres imposés par une signature).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },
  {
    // Composants d'hôte des tests : la stratégie de détection de changements n'y compte pas.
    files: ['src/**/*.spec.ts'],
    rules: { '@angular-eslint/prefer-on-push-component-change-detection': 'off' }
  },
  {
    files: ['src/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // Les composants de saisie maison sont des contrôles de formulaire : un `<label>` qui les enveloppe est bien associé.
      '@angular-eslint/template/label-has-associated-control': ['error', { controlComponents: ['stp-select', 'stp-date-input', 'app-lazy-select'] }],
      '@angular-eslint/template/eqeqeq': 'error',
      '@angular-eslint/template/interactive-supports-focus': 'error',
      '@angular-eslint/template/click-events-have-key-events': 'error'
    }
  }
);
