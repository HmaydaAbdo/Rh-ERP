---
title: Persistance et migrations
sidebar_position: 3
---

# Persistance et migrations (SQLAlchemy 2.x, psycopg 3, Alembic)

PostgreSQL reste le moteur de référence. Le schéma reste la source de vérité des migrations écrites à la main, jamais d'une génération automatique.

## Modèles

* Style déclaratif typé : `Mapped[...]` et `mapped_column(...)`. Un modèle est un modèle de persistance, jamais un contrat d'API.
* Les contraintes qui protègent l'intégrité sont déclarées dans le modèle **et** écrites dans la migration : le modèle ne crée ni ne modifie le schéma.
* Les relations sont **chargées explicitement** : en asynchrone, SQLAlchemy ne sait pas charger paresseusement hors d'un `await` ; on charge avec
  `selectinload` (ou équivalent) dans la requête. Aucun accès à une relation non chargée n'est permis dans un routeur ou un schéma de réponse.
* Cascades limitées aux relations de composition ; collections jamais `None` ; côté propriétaire et côté inverse explicites.
* Montants et mesures exactes : `Decimal` en mémoire, `NUMERIC` en base, jamais `float`. L'arrondi est toujours explicite (`quantize` avec un mode d'arrondi
  nommé, par exemple `ROUND_HALF_DOWN` pour les montants entiers des heures supplémentaires) et chaque règle est couverte par un test de parité avec le calcul Java.
* Instants en UTC avec fuseau (`TIMESTAMPTZ`), conversion à l'affichage uniquement.

## Verrouillage optimiste

Toute entité modifiable porte une colonne `version` (migration) déclarée comme `version_id_col` dans `__mapper_args__`. SQLAlchemy ajoute la version au `WHERE`
de l'`UPDATE` et lève `StaleDataError` quand aucune ligne ne correspond. Règles conservées :

* la version est exposée dans les réponses de lecture et **renvoyée par le client** à la modification ; le code métier ne la fixe ni ne l'incrémente ;
* `StaleDataError` est traduite en `409 Conflict` par un gestionnaire d'exceptions, avec le message actuel (« Cette ligne a été modifiée entre-temps ») ;
* pas de version sur les instantanés append-only ni les journaux immuables.

## Session et transactions

* Une `AsyncSession` par requête, fournie par une dépendance FastAPI avec `yield` (voir [architecture](./architecture.md)), créée par `async_sessionmaker`.
* `expire_on_commit=False` : après un `commit`, un objet expiré ne peut pas être rechargé en asynchrone (documenté par SQLAlchemy). Cela remplace l'interdiction
  d'« Open Session in View » : les accès aux données restent dans les frontières du service.
* La frontière transactionnelle est dans le **service** : une opération métier = une transaction. Écritures regroupées, lectures sans écriture inutile.
  Aucune transaction ouverte pendant un appel réseau ou une attente longue.
* Mécanisme documenté par SQLAlchemy : la session « autobegin » (une transaction démarre au premier usage) et `commit()` la termine. On choisit le style **« une
  transaction par bloc »** : le service ouvre `async with session.begin():` (validation à la sortie normale, annulation sur exception). `begin()` lève une erreur si la
  session est déjà dans une transaction : un service n'en appelle pas un autre qui rouvre une transaction ; une sous-étape annulable séparément utilise
  `begin_nested()` (SAVEPOINT). Les lectures qui précèdent le bloc déclenchent l'autobegin : la dépendance de session ne les laisse jamais ouvertes après la réponse.

## Requêtes

* `select()` explicites dans le repository ; filtres composés par la fonction de `criteria.py` ; jamais de nom de colonne interpolé depuis l'appelant
  (liste blanche de tris et de filtres).
* Pagination bornée et tri déterministe ; curseur plutôt qu'offset profond si le volume l'exige.
* N+1 évités par `selectinload`/`joinedload` ciblés, vérifiés par un test qui compte les requêtes sur les listes sérialisées.
* **Écritures en masse** (`update()`/`delete()` ORM) : interdites sur une entité auditée, car elles contournent l'écouteur d'audit ; charger puis traiter
  les objets (voir [audit](./audit.md)).

## Migrations (Alembic)

Flyway n'est plus exécuté (KAN-237) : ses 44 scripts (V1 à V44) restent figés dans `api/src/staport/migrations/flyway_v44` et sont rejoués par la révision `0001_base_v44` ; Alembic gère tout le schéma (ADR 0016, § 3).

La révision `0003_montants_entiers` (KAN-239) passe tous les montants à `NUMERIC(10,0)` (salaire de l'employé, bulletin de paie, salaire de référence des heures supplémentaires, tables d'audit comprises) : PostgreSQL arrondit les lignes existantes à l'entier le plus proche, les centimes sont perdus et le retour arrière ne les restitue pas ; faire une sauvegarde avant de la jouer en production.

1. Créer une révision par évolution cohérente, avec un message en minuscules ; **une migration déjà appliquée sur un environnement partagé n'est jamais modifiée** :
   toute correction est une nouvelle révision.
2. Écrire du SQL explicite avec `op.execute` pour garder `CHECK`, index et noms de contraintes lisibles (`fk_<table>_<cible>`, `uk_<table>_<colonnes>`,
   `idx_<table>_<colonne>`). L'autogénération compare modèles et base : c'est un **contrôle** de dérive, pas la source de vérité.
3. Une table auditée et sa table `<table>_aud` se créent ou évoluent dans la même révision (voir [audit](./audit.md)). Une migration qui modifie des lignes
   auditées écrit aussi leurs lignes d'audit, dans la même transaction.
4. Toute contrainte resserrée sur des données existantes (`NOT NULL`, `UNIQUE`, `CHECK`) est précédée de son backfill dans la même révision ; toute valeur de
   repli ou règle de fusion est une décision métier à faire valider, jamais une hypothèse.
5. Tester sur PostgreSQL réel : base vierge, montée depuis la révision précédente, contrôle de dérive entre modèles et schéma.

Mise en place documentée par Alembic :

* modèle `async` (`alembic init -t async`) pour le script `env.py`, avec `NullPool` pour la commande de migration ;
* base existante issue de Flyway : le garde de déploiement (`staport.migrations.deploiement`) vérifie que `flyway_schema_history` contient exactement V1 à V44, réussis, avec les sommes de contrôle des scripts fournis (algorithme de Flyway, `historique_flyway.py`), puis `alembic stamp` écrit la révision de base sans exécuter de migration ; les bases neuves sont construites à partir d'elle ;
* **exécution** : étape de déploiement dédiée avant le démarrage de l'application, jamais dans son `lifespan` ; la table `flyway_schema_history` est conservée en lecture seule.

Noms de contraintes : le `MetaData` de base déclare une `naming_convention` (clés `ix`, `uq`, `ck`, `fk`, `pk`), appliquée à tout objet sans nom explicite et visible dans les
migrations générées par l'autogénération. Les préfixes existants en V1 à V44 sont `pk_`, `fk_`, `uk_`, `ck_` et `idx_` (relevé dans les migrations Flyway) ; la convention les reprend
(`"uq"` → gabarit en `uk_...`). Certains noms existants sont abrégés à la main (`fk_chantier_aud_rev`) et ne se déduisent pas d'un gabarit : **les noms des objets existants sont déclarés
explicitement dans les modèles** (`name=...`), la convention ne nomme que les objets nouveaux sans nom explicite. Le contrôle de dérive compare les noms : une différence est corrigée
par une migration, jamais en modifiant la convention. Pour une contrainte `CHECK`, le jeton `%(constraint_name)s` exige un nom explicite sur la contrainte.

## Droits PostgreSQL

Deux comptes : un compte de migration (propriétaire du schéma) et un compte d'exécution sans droit de réécrire l'historique d'audit. Inchangé par rapport à
`conventions/audit.md` et `conventions/deployment.md`.

## Mots réservés et autres règles de base

La liste des mots réservés PostgreSQL, la procédure de montée de majeure PostgreSQL, pgvector et la base graphe facultative ne dépendent pas du langage :
elles restent celles de `conventions/database.md` jusqu'à leur migration vers le site (KAN-189), sans changement.
