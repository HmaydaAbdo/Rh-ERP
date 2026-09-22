# JPA & Persistence

> Conventions Hibernate/JPA applicables à toutes les entités et repositories.

## Entités

* Toutes les entités utilisent `@Entity` et `@Table`.
* Définir explicitement le nom de la table.
* Utiliser `@Column` dès qu'une contrainte ou un nom personnalisé est nécessaire.
* Les identifiants utilisent la stratégie définie par le projet.
* Ne jamais exposer une entité directement via une API.
* Les contraintes de persistance (`nullable`, `length`, `unique`) sont déclarées avec les annotations JPA.
* Les validations métier sont portées par les DTOs, pas par les entités, sauf lorsqu'elles garantissent l'intégrité des données quel que soit le point d'entrée.

---

# Relations

* `FetchType.LAZY` par défaut.
* Ne jamais utiliser `FetchType.EAGER` sans justification.
* Toujours préciser le `mappedBy` côté inverse.
* Limiter `CascadeType.ALL` aux véritables relations de composition.
* Utiliser `orphanRemoval = true` uniquement lorsqu'un enfant ne peut pas exister sans son parent.
* Initialiser les collections avec une implémentation vide (`ArrayList`, `HashSet`, etc.).
* Ne jamais laisser une collection à `null`.

---

# Repository

* Hériter de `JpaRepository`.
* Ajouter `JpaSpecificationExecutor` pour les listes filtrables.
* Utiliser `@EntityGraph` pour charger les relations nécessaires à la sérialisation.
* Ne jamais utiliser `spring.jpa.open-in-view`.
* Ne jamais implémenter de logique métier dans un Repository.

---

# Specifications

* Toute liste filtrable utilise une Specification.
* Convention :

```java
XSpecification.searchByCriteria(XSearchCriteria)
```

* Tout nouveau filtre ajouté à une Specification doit être accompagné des index nécessaires.

---

# Transactions

* `@Transactional` sur les opérations d'écriture.
* `@Transactional(readOnly = true)` sur les lectures transactionnelles.
* Une opération métier multi-étapes doit être atomique.
* Une transaction ne doit jamais contenir d'interaction utilisateur ni d'attente inutile.

---

# Index

Déclarer les index directement sur l'entité.

```java
@Table(
    indexes = {
        @Index(name = "idx_table_colonne", columnList = "colonne")
    }
)
```

Toujours indexer :

* les clés étrangères (`*_id`) ;
* les statuts et enums fréquemment filtrés ;
* les colonnes de date utilisées dans les recherches ou tris ;
* les colonnes utilisées régulièrement dans les `WHERE` ou `ORDER BY`.

Créer un index composite lorsque plusieurs colonnes sont systématiquement filtrées ensemble.

Ne pas indexer les champs texte libre rarement recherchés.

---

# Performance

* Éviter les requêtes N+1.
* Utiliser `@EntityGraph` plutôt que `FetchType.EAGER`.
* Toujours paginer les listes volumineuses.
* Ne charger que les relations réellement nécessaires.
* Ajouter les index dans le même changement que le nouveau filtre.

---

# BigDecimal

* Utiliser exclusivement `BigDecimal` pour les montants.
* Ne jamais utiliser `double` ou `float`.
* Comparer avec `compareTo()`, jamais avec `equals()`.
* Toujours préciser un `RoundingMode` lors des divisions.

---

# Principes

* Les entités représentent uniquement le modèle de persistance.
* Les DTOs représentent le contrat de l'API.
* Les Repositories accèdent aux données.
* Les Services implémentent la logique métier.
* Les performances et la cohérence des données priment sur la simplicité d'écriture des requêtes.
* Toute évolution d'une entité, d'une relation ou d'une Specification doit préserver ces conventions.
