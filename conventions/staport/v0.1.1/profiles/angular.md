# Profil Angular

Baseline vérifiée le 2026-10-10 : Angular 22.1.6 est la dernière stable observée ; Angular 22 est
en support actif. Matrice officielle à revérifier avant chaque démarrage/upgrade : Angular ↔ Node.js
↔ TypeScript ↔ RxJS.

- Utiliser le dernier correctif stable de la majeure supportée, aligner core/CLI/compiler/CDK et
  toutes les dépendances peer.
- Signals, Signal Forms et Angular Aria sont annoncés stables en v22. Choisir Signal Forms pour les
  nouveaux formulaires compatibles ; garder Reactive Forms quand le code existant ou une
  intégration le justifie.
- Écarter toute version `next`, `rc`, `alpha`, `beta` et snapshot des baselines de production.
- Les upgrades depuis Angular 17 traversent les majeures une à une et incluent migration du builder,
  tests de composants, bundle et parcours navigateur.
