# Performance

> Conventions de performance applicables à tout le projet.

## Principes

* La performance fait partie de la conception de l'application.
* Toute nouvelle fonctionnalité doit être conçue pour rester performante à mesure que les données augmentent.
* Corriger un problème de performance est préférable dès sa détection plutôt qu'après la mise en production.

---

# Base de données

## Requêtes

* Toujours récupérer uniquement les données nécessaires.
* Éviter les requêtes inutiles.
* Éviter les appels répétés à la base dans une boucle.
* Préférer une requête optimisée à plusieurs petites requêtes.

---

## Pagination

* Toute liste pouvant contenir un grand volume de données doit être paginée.
* Ne jamais retourner une liste complète lorsque le volume peut devenir important.
* Toute pagination doit également supporter le tri (`sorting`) et le filtrage (`filtering`).

---

## Tri

* Les tris sont réalisés en base de données.
* Ne jamais trier une grande collection en mémoire lorsqu'elle peut être triée par la base.

---

## Filtrage

* Les filtres sont réalisés via les Specifications.
* Ne jamais charger toutes les données pour filtrer ensuite en mémoire.

---

# Index

* Toute colonne utilisée fréquemment dans un `WHERE`, `JOIN` ou `ORDER BY` doit être indexée.
* Les index sont déclarés dans les entités via `@Table(indexes = ...)`.
* Lorsqu'un nouveau filtre est ajouté, vérifier si un index est nécessaire dans le même changement.

---

# JPA

## Fetch

* `FetchType.LAZY` par défaut.
* Ne jamais utiliser `FetchType.EAGER` sans justification.

---

## EntityGraph

* Utiliser `@EntityGraph` pour charger uniquement les relations nécessaires.
* Préférer `@EntityGraph` à `EAGER`.

---

## N+1

* Toute requête doit être vérifiée afin d'éviter le problème N+1.
* Si un N+1 est identifié, le corriger avant la fin de la tâche.

---

# Services

* Éviter les traitements inutiles.
* Éviter les appels répétés au même Service avec les mêmes paramètres dans une même opération.
* Factoriser les traitements communs.

---

# Boucles

Ne jamais :

* effectuer un appel HTTP dans une boucle ;
* effectuer une requête SQL dans une boucle ;
* recalculer plusieurs fois une même valeur.

Privilégier :

* le préchargement ;
* le regroupement des traitements ;
* les opérations batch.

---

# Collections

* Utiliser la collection adaptée (`List`, `Set`, `Map`).
* Éviter les parcours multiples lorsqu'un seul suffit.
* Préférer une recherche par `Map` lorsqu'un accès par clé est fréquent.

---

# Calculs

* Ne jamais recalculer une valeur identique plusieurs fois dans une même opération.
* Extraire le résultat dans une variable lorsque cela améliore les performances ou la lisibilité.

---

# Frontend

* Toutes les listes utilisent la pagination.
* Toutes les listes supportent le tri.
* Toutes les listes supportent le filtrage lorsque pertinent.
* Utiliser le Lazy Loading Angular pour les pages.
* Éviter les appels HTTP redondants.
* Désactiver les actions pendant les appels mutateurs pour éviter les doubles soumissions.

---

# API

* Les endpoints de liste sont paginés.
* Les réponses doivent contenir uniquement les données nécessaires.
* Les DTO ne transportent jamais de données inutilisées par l'interface.

---

# Monitoring

Les métriques Micrometer permettent de mesurer les performances métier.

Selon le module, utiliser :

* `Gauge` pour les valeurs instantanées ;
* `Counter` pour les opérations ;
* `Timer` pour mesurer la durée des traitements.

---

# Optimisation

Avant toute optimisation :

* identifier le véritable goulot d'étranglement ;
* mesurer l'impact attendu.

Ne jamais complexifier le code sans bénéfice mesurable.

---

# Principes

* Toujours privilégier une bonne conception avant une optimisation prématurée.
* La lisibilité ne doit pas être sacrifiée pour une optimisation marginale.
* Toute nouvelle fonctionnalité doit rester scalable.
* Une fonctionnalité performante doit le rester lorsque le volume de données augmente.
* Les optimisations doivent être réalisées dans le respect des conventions d'architecture du projet.