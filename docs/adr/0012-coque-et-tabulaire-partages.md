# ADR 0012 — Coque et vue Tabulaire partagées par domaine

- Date : 2026-10-23
- Statut : accepté par le propriétaire
- Remplace : les dispositions de l'ADR 0011 et de `conventions/frontend.md` qui réservaient la coque et la vue Tabulaire à chaque domaine

## Contexte

Les domaines Paie, Employé, Équipe, Fonction et Chantier proposent le même parcours de collection : filtres, vues Tabulaire / Cartes / Analytique, actions de page, chargement et navigation. `stp-table` et les vues Cartes / Analytique sont déjà partagés, mais chaque domaine recopie encore la structure de la coque et l'assemblage du tableau. Les cinq copies peuvent diverger sur l'accessibilité, les états de chargement, la navigation, le tri ou la pagination.

Les domaines ont toutefois des contrats différents : colonnes et rendu des cellules, filtres, critères HTTP, permissions et actions métier. Ces différences ne doivent pas être déplacées dans un composant générique ni interprétées par des noms de champs.

## Décision

1. Créer dans `frontend/src/app/shared/components/` un composant partagé de coque de collection. Il rend le titre, le sélecteur de vues, les emplacements d'actions et de filtres, ainsi que le `RouterOutlet`. Une configuration typée fournit le titre, le libellé accessible et les trois liens.
2. Créer un composant partagé de vue Tabulaire. Il rend le compteur, le choix des colonnes et `stp-table`, et relaie la pagination serveur ainsi que les événements de chargement et de réordonnancement. Une configuration typée fournit les libellés; le domaine passe ses données et son `ColumnState`.
3. Les filtres, adaptateurs API, critères, colonnes, rendu des cellules, actions de ligne, permissions et règles métier restent déclarés dans le domaine propriétaire. Les actions et filtres entrent dans la coque par projection de contenu ; les cellules et actions de ligne entrent dans la vue Tabulaire par les contrats existants de `stp-table`.
4. Appliquer le pattern aux cinq domaines dans l'ordre de revue demandé : Équipe, Fonction, Chantier, Employé, Paie. Les routes de création, détail et modification restent hors de la coque de collection.
5. Préserver la synchronisation des filtres et du périmètre dans l'URL, les contrôles d'accès backend, l'accès conditionnel aux données sensibles, la pagination serveur et les particularités Paie (colonnes, navigation de mois, suppression autorisée).
6. Tout nouveau domaine avec une collection consultable réutilise la coque et la vue Tabulaire partagées, puis fournit ses propres filtres, colonnes, cellules, actions et adaptateur de données.

## Conséquences

- Les cinq coques et tableaux partagent désormais les mêmes structures HTML, emplacements et interactions communes ; les changements d'accessibilité et de présentation s'appliquent à tous.
- Les hôtes de domaine restent responsables des contrats et des décisions métier. Le composant commun ne connaît ni les DTO ni les permissions concrètes des domaines.
- Les tests comprennent des tests directs de la coque et de la vue Tabulaire partagées, des tests d'intégration de chaque configuration de domaine et les parcours E2E par domaine. La revue reste organisée dans l'ordre Équipe, Fonction, Chantier, Employé, Paie.
- Une modification du composant partagé est transversale : elle requiert une vérification des cinq domaines, de l'accessibilité, de l'URL et de la CI complète.

## Alternatives examinées

- **Garder uniquement `stp-table` partagé** : rejeté, car le compteur, le choix des colonnes et l'assemblage du tableau restent copiés dans chaque domaine.
- **Partager des primitives visuelles seulement** : rejeté, car les composants de page continueraient à réimplémenter la structure et les interactions communes.
- **Créer une page métier universelle avec chargement des données, formulaires, filtres et règles conditionnels** : rejeté, car les contrats de domaine et permissions seraient mélangés dans un composant à nombreuses branches.

