# TODO frontend — samedi 31 octobre 2026

> Liste de travail isolée du [`TODO.md`](../../TODO.md) général, pour traiter et clôturer les points frontend de cette revue.
> Inventaire de référence : [composants partagés et domaines à aligner](audit-composants-partages.md).

## Règle applicable dès maintenant

- [ ] Pour toute nouvelle interface ou interaction, réutiliser un composant du socle partagé et l'inscrire au catalogue.
- [ ] Ne créer aucun contrôle, filtre, tableau, dialogue, état, assistant, visualisation ou style de composant propre à un domaine.
- [ ] Les domaines fournissent leurs données, règles métier, permissions et critères aux API partagées ; ils ne portent pas un rendu parallèle.
- [ ] Avant un éventuel écart temporaire : vérifier l'option officielle du framework puis le socle ; demander l'accord du propriétaire et consigner le blocage, le responsable, l'échéance et le plan de sortie.

## Réutilisation et harmonisation des domaines

- [ ] Ajouter au catalogue `/catalogue` les composants partagés existants absents de sa démo :
  `app-collection-shell`, `app-collection-table`, `app-column-chooser`, `app-lazy-select`, `app-month-picker`
  et `app-vue-switcher`.
- [ ] Référencer et démontrer Cartes et Analytique partagées avec un jeu de données déterministe.
- [ ] Concevoir, cataloguer puis adopter un cockpit de filtres commun pour Paie, Heures supplémentaires, Employés,
  Chantiers, Équipes, Fonctions, Utilisateurs, Rôles et Journal d'audit.
- [ ] Migrer Utilisateurs, Rôles et Journal vers la coque et le tableau de collection partagés.
- [ ] Étudier le partage du gabarit d'assistant et l'appliquer aux imports/exports Paie et à l'import Heures supplémentaires.
- [ ] Auditer les formulaires, fiches, Auth, Paramètres et rendus d'Audit ; remplacer les contrôles et styles locaux par
  des composants partagés et cataloguer les coques communes utiles.
- [ ] Pour la carte Chantier, évaluer d'abord l'intégration Angular officielle `@maplibre/ngx-maplibre-gl` avec les versions
  du projet ; partager/cataloguer la configuration Staport si nécessaire, et laisser au domaine le raccordement des données.
- [ ] Ajouter des contrôles de revue/lint empêchant l'arrivée de nouvelles implémentations visuelles locales.

## Heures supplémentaires — corrections et diagnostic

- [ ] **Tri du tableau**. Cause identifiée : `stp-table` émet `sortField` et `sortOrder`, mais `HeuresSuppListComponent.charger()`
  ne les transmet pas à la recherche ; `HeuresSuppService.search()` fixe toujours `sort=periode,desc`. Transmettre le tri
  choisi au backend. Vérifier les champs de tri acceptés et désactiver le tri des colonnes non prises en charge. Ajouter un
  test couvrant champ et sens de tri.
- [ ] **Cartes vides**. Cause identifiée : `CartesPerimetreComponent.aucuneSource` vérifie Employé et Paie, mais oublie
  `voitHeuresSupp()`. En configuration Heures supplémentaires seule, le message d'absence de source masque donc les cartes.
  Corriger la condition et ajouter un test avec HS comme seule source autorisée.
- [ ] **Analytique non visible**. La route, son hôte et la source `HEURES_SUP` sont configurés ; le template contient le bloc
  HS. Reproduire `/heures-supp/analytique` en local avec la session concernée. Contrôler les droits `HEURES_SUP_READ` et le
  garde parent `PAIE_READ`, puis les statuts/réponses de `heures-supp/periodes` et `heures-supp/analytique`. Le test actuel
  ne vérifie que les métadonnées de routes ; ajouter un test de parcours/rendu selon le résultat reproduit.

## Clôture

- [ ] Les défauts du tri et des Cartes ont des tests de régression qui passent.
- [ ] L'Analytique est reproduite directement ; sa cause est confirmée et le parcours est vérifié avec les appels API réels
  de l'environnement local.
- [ ] Les composants partagés concernés sont visibles dans le catalogue, documentés, accessibles au clavier et cohérents
  entre domaines.
- [ ] Les domaines concernés utilisent effectivement les mêmes composants, sans changement des règles métier ni des contrats API.
- [ ] Build frontend et contrôles pertinents passent ; navigateur vérifié sur grand écran et téléphone, thèmes clair/sombre.
- [ ] L'inventaire, les README frontend concernés et ce TODO sont mis à jour ; fermer cette note quand les cases applicables
  sont terminées et retirer son lien d'index si la tâche est entièrement clôturée.
