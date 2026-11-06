---
title: Prototype du domaine common
sidebar_position: 3
---

# Prototype du domaine `common` (KAN-47)

Code : `api/` (projet uv `staport-api`, package `staport`). Il applique l'arborescence de
`conventions/backend-python` (`domains/<domaine>/api.py`, `platform/`).

## Ce qui est prouvé (9 tests, ruff et pyright strict verts)

| Comportement Spring | Équivalent FastAPI | Test |
|---|---|---|
| `ErrorResponseDto` `{timestamp, status, error, message, path}` | `ReponseErreur` (Pydantic) | `_forme_spring` sur chaque cas |
| 409 « L'enregistrement a été modifié… » (`ConflitModificationException`) | `ConflitModification` + `verifier_version` | `test_conflit_de_version…` |
| 403, 404, 405, 500 avec les mêmes messages français | gestionnaires sur l'application | tests dédiés |
| Erreur imprévue sans détail interne | gestionnaire `Exception` | `test_erreur_imprevue…` |
| 400 « champ : message » (validation) et « Corps de la requête illisible. » | gestionnaire `RequestValidationError` | tests dédiés |
| `X-Request-Id` toujours généré, jamais repris du client | middleware HTTP + `ContextVar` | `test_identifiant_de_requete…` |
| `MotifRecherche.contient` (jokers échappés) | `motif_contient` | `test_motif_de_recherche…` |

Documentation lue (Context7, FastAPI) : remplacement des gestionnaires de `RequestValidationError` et de `StarletteHTTPException`
(on enregistre celui de Starlette), `@app.middleware("http")`.

## Écarts connus, non cachés

- **Messages de validation** : traduits en français (`platform/validation_fr.py`, un modèle par type d'erreur Pydantic, test des types
  fréquents). Le texte exact des contraintes Jakarta de Spring (messages écrits à la main dans chaque DTO) sera comparé domaine par
  domaine par le test de contrat ; un type non traduit retombe sur le message anglais de Pydantic, jamais sur un message masqué.
- **`PageLoader`** (parcours paginé Spring Data) n'est pas porté : il n'a pas de sens sans le repository ; il renaît avec le premier
  domaine qui a un repository (SQLAlchemy).
- **`YearMonthAttributeConverter`, `AsyncConfig`, `MailExecutorProperties`, `OpenApiConfig`, `SchedulingConfig`** ne sont pas portés :
  ils relèvent de la persistance, des tâches de fond, du courriel et de la configuration (tranche KAN-48).
- **Mesures** : non relevées (voir [strategie.md](strategie.md)) ; ce prototype ne démontre ni le gain de latence ni celui du
  conteneur unique.
- Le client de test de Starlette signale qu'il préfère `httpx2` à `httpx` (avertissement de dépréciation) ; non adopté tant que le
  paquet n'est pas vérifié (règle : documentation officielle d'abord).

## Décision laissée au prototype par l'ADR

Le choix « MCP ou appel direct par outil LangChain » (ADR § 1) n'est pas tranché ici : il exige l'absorption du service IA et une
mesure de latence (tranche KAN-48).

## Socle de la plateforme (KAN-212)

Code : `api/src/staport/platform/configuration.py`, `base_de_donnees.py`, `api/src/staport/migrations/`.

- **Configuration** : mêmes variables d'environnement que Spring ; une variable absente fait échouer le démarrage ; secrets masqués.
- **Base de données** : SQLAlchemy asynchrone, psycopg 3, `expire_on_commit=False` (documentation officielle lue).
- **Traces SQL (KAN-220)** : l'[instrumentation OpenTelemetry SQLAlchemy 0.66b2](https://raw.githubusercontent.com/open-telemetry/opentelemetry-python-contrib/v0.66b2/instrumentation/opentelemetry-instrumentation-sqlalchemy/src/opentelemetry/instrumentation/sqlalchemy/package.py)
  refuse SQLAlchemy 2.1 (borne `< 2.1.0`). L'[instrumentation officielle Psycopg](https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/psycopg/psycopg.html)
  0.66b2 couvre psycopg 3 et est chargée par l'auto-instrumentation OpenTelemetry de l'image API. Une requête réelle
  SQLAlchemy asynchrone `SELECT 1` a produit un span client `SELECT` reçu par Phoenix avec `db.statement=SELECT 1`,
  dans la même trace que le span parent. L'instrumentation SQLAlchemy pourra être réexaminée à sa prochaine version
  publiée compatible 2.1 ; aucune borne de compatibilité n'est contournée.
- **Migrations** : Alembic, révision `0001_base_v44` qui rejoue les 44 scripts Flyway (copiés dans `migrations/flyway_v44/`) dans
  l'ordre numérique, **une transaction par script** comme Flyway (V9, V28, V32 créent des tables temporaires `ON COMMIT DROP`
  de même nom ; deux scripts dans une même transaction échouent). Schéma et données de référence sont donc identiques par
  construction ; ce n'est pas une preuve par comparaison avec une base Flyway réelle, qui reste à faire sur une copie de la base
  du propriétaire (étape de la répétition générale, `strategie.md`).
- **Droits** : `droits.py` reprend `afterMigrate.sql` (compte applicatif SELECT/INSERT seul sur `audit_*` et `*_aud`), avec
  `psycopg.sql` pour échapper identifiants et mot de passe (Flyway insérait le mot de passe par substitution de texte).
- **Déploiement préparé (KAN-219)** : `flyway-validate` exécute la commande officielle Flyway 13.12.1 sur les scripts
  V1–V44, puis `api-migrate` exécute Alembic avec le compte propriétaire ; `api` attend le succès des deux services.
  Sur une base neuve, Alembic construit le schéma. Sur une base Flyway, le garde exige exactement 44 migrations SQL
  réussies avant `stamp 0001_base_v44`, puis `upgrade head` recalcule les droits applicatifs. Un schéma non vide sans
  historique ou un historique Flyway partiel est refusé. Le serveur ne reçoit pas les identifiants du propriétaire.
  `PGAUDIT_ENABLED=true` en production, comme aujourd'hui. Cette branche intermédiaire ne doit pas être déployée avant
  KAN-50 : Spring est encore présent dans le Compose.
- **Tests** (8, image `pgvector/pgvector:0.8.7-pg18` comme les tests Java, ignorés sans Docker) : construction du schéma et
  des données de référence, droits du compte applicatif sur l'audit, estampillage, relance et refus d'un historique partiel.

### Vérification sur une vraie base Flyway (2026-11-03)

Sauvegarde chiffrée de production du 2026-11-03 02:00 (`backups/`, déchiffrée avec l'identité du propriétaire, sommes de contrôle
valides), restaurée dans un PostgreSQL jetable (pgvector 0.8.7-pg18, supprimé ensuite, copies en clair supprimées).

- La production est à **V41** (41 migrations réussies). Les scripts V42, V43 et V44 ont été appliqués sur la copie avant
  comparaison : ils passent sur les données réelles.
- `pg_dump --schema-only` de la copie et d'une base neuve construite par Alembic, comparés avec
  `scripts/migration/comparer-schemas.py` : **identiques** (798 lignes de définition, dans le même ordre ; hors historiques de
  migration et pgaudit, extension de production absente de l'image d'essai).
- Les contraintes CHECK sont comparées par colonnes et valeurs, car PostgreSQL 17 (production) et 18 n'écrivent pas de la même
  façon la même expression.
- Données de référence : les 37 permissions, les 3 rôles et les 6 clés de paramètres sont identiques. Écart de données, pas de
  schéma : le rôle `PAIE_MANAGER` a 58 droits en production contre 64 sur une base neuve ; les 6 droits absents sont
  `CHANTIER_DELETE`, `EMPLOYEE_DELETE`, `EQUIPE_DELETE`, `FUNCTION_DELETE`, `PAIE_DELETE` et `PAIE_PURGE`, que V4 et V15 accordent
  et que l'écran des rôles a pu retirer (les rôles sont modifiables). Cause non vérifiée ; à confirmer par le propriétaire. Une base
  existante est estampillée, jamais reconstruite : ces droits retirés sont donc conservés.
