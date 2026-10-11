# JPA et persistance

> Profil Java/JPA. Les migrations restent la source de vérité du schéma (`conventions/database.md`).

## Versions et dépendances Spring

Pour une application Spring Boot, choisir une version stable et prise en charge, compatible avec le
JDK, les starters et les bibliothèques du projet. Vérifier les matrices officielles avant une
création de projet ou une mise à niveau ; planifier l'adoption des versions majeures stables et
documenter un report motivé.

Utiliser le BOM Spring Boot pour les dépendances qu'il gère et celui de Spring AI lorsque le projet
l'adopte. Ne pas ajouter de version individuelle ni remplacer une version gérée sans raison
documentée et vérification de compatibilité. Verrouiller les versions du JDK, du build et des
dépendances dans les fichiers du projet.

Après une mise à niveau majeure, vérifier notamment les starters modularisés, Jakarta, Spring
Framework, la sécurité, l'observabilité et les dépendances tierces. Avant fusion, compiler et lancer
les tests unitaires, les intégrations avec Testcontainers et les tests de contrats concernés.

## Entités

* Utiliser une entité pour le modèle de persistance, jamais comme contrat d'API. Mapper les
  colonnes et tables explicitement lorsqu'un nom, un type ou une contrainte doit être stable.
* Déclarer les contraintes de persistance qui protègent l'intégrité des données. Les écrire aussi
  dans la migration correspondante ; les annotations JPA ne créent ni ne modifient le schéma.
* Garder les invariants métier dans le domaine. Valider les entrées à la frontière de l'API et
  répéter les contraintes nécessaires au niveau persistance lorsqu'elles doivent s'appliquer à tous
  les chemins d'écriture.
* Utiliser la stratégie d'identifiants définie par le projet et compatible avec ses migrations.
* Pour toute entité persistée modifiable, utiliser `@Version` et une colonne `version` déclarée par migration. Exposer
  cette version dans les réponses de lecture et exiger que le client la renvoie lors d'une modification ; ne jamais
  la fixer ni l'incrémenter dans le code métier. Une version périmée renvoie `409 Conflict` et ne remplace aucune
  donnée. Ne pas versionner les instantanés append-only ou les journaux immuables ; documenter toute autre exception.

## Relations

* Préférer le chargement paresseux (`LAZY`) pour les associations ; le déclarer explicitement pour
  les relations dont la valeur par défaut JPA est `EAGER`. N'utiliser `EAGER` qu'avec une raison
  documentée et des mesures montrant que ce chargement convient aux cas d'usage.
* Définir clairement le côté propriétaire et le côté inverse (`mappedBy`) d'une relation.
* Limiter les cascades aux opérations réellement propagées par le cycle de vie du parent. Réserver
  `CascadeType.ALL` et `orphanRemoval` aux relations de composition où l'enfant ne peut pas exister
  indépendamment.
* Initialiser les collections et ne jamais les laisser à `null`.
* Les suppressions en cascade au niveau SQL et JPA doivent respecter les invariants du domaine et
  les exigences d'audit (`conventions/audit.md`, `conventions/database.md`).

## Repositories et requêtes

* Les repositories accèdent aux données et n'implémentent pas de décisions métier.
* Dans Spring Data JPA, utiliser `JpaRepository` pour les opérations usuelles. Utiliser une
  `Specification` ou un mécanisme de requête équivalent lorsque plusieurs filtres optionnels doivent
  être combinés ; une requête dérivée simple convient pour un critère fixe.
* Charger seulement les relations requises par le cas d'usage avec une projection, un fetch dédié
  ou `@EntityGraph`. Ne pas charger des relations uniquement pour sérialiser une entité dans une
  réponse API.
* Désactiver Open Session in View (`spring.jpa.open-in-view=false`) afin que les accès aux données
  restent explicites dans les frontières de service.
* Paginer ou borner les listes volumineuses. Choisir `Page`, `Slice` ou un curseur selon que le
  nombre total est réellement nécessaire.

## Transactions

* Placer les frontières transactionnelles au niveau des opérations applicatives ou métier qui
  doivent être cohérentes. Regrouper dans une transaction les écritures qui forment une seule
  opération métier.
* Utiliser une transaction en lecture seule lorsque le framework et le cas d'usage en bénéficient.
* Ne pas garder une transaction ouverte pendant une interaction utilisateur, un appel réseau ou une
  attente longue. Définir explicitement la cohérence requise pour les opérations qui traversent des
  systèmes externes.

## Écritures en masse et audit

Les écritures SQL/JPQL en masse contournent le cycle de vie des entités et peuvent contourner
l'audit. Sur une entité auditée, ne pas utiliser de suppression/mise à jour en masse (`@Modifying`,
SQL natif, `deleteAllInBatch` ou équivalent) ; charger et traiter les entités selon la convention
d'audit. Les contraintes d'audit et de suppression sont détaillées dans `conventions/audit.md`.

## Index et performances

Les migrations Flyway définissent le schéma et ses index. Une annotation `@Index` peut documenter
le mapping, mais ne remplace pas la migration. Ajouter un index lorsqu'il est justifié par une
contrainte ou par les requêtes réellement exécutées ; examiner leur fréquence, leur sélectivité et
le plan d'exécution. Indexer les clés étrangères lorsque les jointures, suppressions ou mises à
jour associées le justifient.

* Éviter les requêtes N+1 par des projections, fetch ciblés ou `@EntityGraph` adaptés au cas d'usage.
* Concevoir les index composites selon l'ordre et la combinaison des filtres observés.
* Ne pas ajouter un index pour chaque filtre ou champ sans bénéfice mesuré : les index ont un coût
  d'écriture, de stockage et de maintenance.
* Utiliser les types décimaux exacts pour les montants et ne pas employer `float` ou `double` pour
  l'arithmétique financière. En Java, utiliser `BigDecimal`, comparer avec `compareTo()` et définir
  explicitement le `RoundingMode` des divisions.

## Évolution

Toute évolution d'entité, relation ou requête persistante est accompagnée de sa migration, de tests
sur le moteur relationnel cible et d'une vérification des contraintes et performances concernées.

## Références officielles

Vérifier les exigences et la gestion des dépendances à chaque mise à niveau :

* [Exigences système Spring Boot](https://docs.spring.io/spring-boot/system-requirements.html)
* [Gestion des dépendances Spring Boot](https://docs.spring.io/spring-boot/reference/using/build-systems.html)
* [Référence Spring AI](https://docs.spring.io/spring-ai/reference/)
