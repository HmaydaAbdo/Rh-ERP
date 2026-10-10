# Frontend Angular

## Baseline

Baseline vérifiée pour cette édition : Angular 22.1.x, dernière stable observée 22.1.6 le
2026-10-10. À chaque démarrage de projet, vérifier les releases actives, versions de Node/TypeScript/
RxJS et peer dependencies ; utiliser le dernier correctif stable pris en charge. Une application
existante migre une majeure à la fois.

## Réactivité et structure

- Standalone et lazy loading par domaine ; composants orientés présentation, services/adaptateurs
  pour accès API, logique métier dans le backend.
- Signals pour état synchrone local, dérivations par `computed`, `linkedSignal` seulement pour état
  dérivé éditable. RxJS pour événements/flux asynchrones, HTTP, streaming et orchestration complexe.
  Ne pas maintenir deux sources de vérité pour la même donnée.
- Utiliser les API stables de la version cible. `effect` n'est pas un mécanisme général de calcul
  d'état ; réserver ses effets aux interopérations externes.
- Pour les nouveaux formulaires Angular 22, préférer Signal Forms quand le composant de contrôle et
  la validation métier s'y prêtent ; Reactive Forms restent adaptées au code existant et aux
  intégrations incompatibles. Éviter une réécriture globale de formulaires pendant un simple upgrade.
- Injecter avec `inject()`, types stricts, composants petits, templates sémantiques et nouvelle
  syntaxe de contrôle (`@if`, `@for`, `@switch`).
- Un guard Angular conditionne navigation et UX ; le backend reste l'autorité RBAC.

## Bibliothèques et expérience

Angular Aria/CDK fournit des comportements accessibles/headless ; Lucide Angular remplace PrimeIcons
pour les nouvelles icônes ; Tailwind CSS 4 remplace PrimeFlex pour layout/utilitaires. Une façade
Staport garde les composants métiers cohérents et empêche les dépendances visuelles dispersées.
L'évaluation/licence de la bibliothèque de composants est faite séparément avant de migrer PrimeNG.

Les événements agentiques passent par un client de protocole AG-UI, rendus exclusivement dans des
composants Angular connus. Ne jamais exécuter du HTML, template, style ou script généré par le modèle.

## Performance, accessibilité et tests

Contrôle du bundle, lazy loading, listes virtualisées pour les grands volumes, annulation des
requêtes obsolètes, pas de recalcul coûteux dans les templates. Respecter WCAG AA, clavier,
lecteur d'écran, reduced motion et états de chargement/erreur/vide. Tests unitaires et composants
selon `testing.md` ; parcours E2E des flux métier à risque.
