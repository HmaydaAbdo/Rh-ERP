---
title: Tests et qualité
sidebar_position: 7
---

# Tests et qualité

La pyramide, les quatre niveaux de tests et l'exigence « un test avant le code, un test de non-régression par bogue » ne changent pas. Cette page donne les outils
de l'ADR 0016 (§ 8, § 9).

## Outils

| Besoin | Java (avant) | Python (après) |
| --- | --- | --- |
| Exécution des tests | JUnit 5, Mockito | `pytest`, fixtures, `unittest.mock` |
| Base de données réelle | Testcontainers PostgreSQL | `testcontainers-python` (`PostgresContainer`) |
| Remplacement d'une dépendance | `@MockitoBean` | `app.dependency_overrides` |
| Test d'API | `MockMvc` | `TestClient` de FastAPI (HTTPX) |
| Architecture | ArchUnit | import-linter (`lint-imports`) |
| Style, bogues courants | Checkstyle, PMD | Ruff (lint et format) |
| Types | compilateur Java | pyright (à confirmer) |
| Couverture | JaCoCo | coverage.py (à confirmer) |

## Règles de test

1. Domaine métier : tests unitaires de fonctions pures et de services, sans base ni réseau. Les montants se comparent en `Decimal`, jamais en `float`.
2. Persistance : tests d'intégration sur **PostgreSQL réel** (testcontainers), jamais une base en mémoire de substitution. Avec `psycopg` 3, instancier le conteneur
   avec `driver=None` pour obtenir une URL utilisable (documenté par testcontainers-python). Les migrations sont appliquées avant les tests.
3. API : `TestClient` ; le `lifespan` ne s'exécute que dans un bloc `with TestClient(app)`. Les dépendances externes (identité, horloge, client HTTP, modèle d'IA)
   sont remplacées par `app.dependency_overrides`, remis à zéro en fin de test.
4. Fixtures : portée la plus étroite qui reste économique (la base partagée par session, les données par test avec annulation de transaction). Aucune donnée réelle :
   identités, secrets et données de test sont synthétiques.
5. Un test ignoré porte une raison (`pytest.mark.skip(reason=...)`) et un ticket Jira ; aucun test désactivé sans suivi.
6. **Tests de parité** : pour chaque domaine migré, mêmes entrées → mêmes sorties que Spring (calculs de paie, heures supplémentaires, arrondis, exports). C'est la
   preuve de non-régression de la bascule.
7. Test de contrat OpenAPI (voir [API](./api.md)), test de couverture des routes (voir [sécurité](./securite.md)), test de couverture de l'audit (voir [audit](./audit.md)).
8. Les tests asynchrones utilisent un exécuteur de tests asynchrones unique pour tout le projet (pytest-asyncio ou anyio) : **choix à confirmer** à la relecture de KAN-47.

## Qualité statique

* **Ruff** : `extend-select` pour ajouter les familles utiles (erreurs, imports triés, bogues courants, sécurité de type bandit, simplifications), `per-file-ignores`
  pour les exceptions motivées (par exemple `assert` dans les tests). Format imposé par `ruff format`. Zéro avertissement toléré en CI.
* **import-linter** : contrats `layers` (domaine → plateforme) et d'interdiction d'import entre domaines hors `api.py`, exécutés par `lint-imports` en CI.
* **pyright** (à confirmer) : mode strict sur `src/`.
* Aucun code mort, aucun `TODO` sans ticket Jira.

## Seuils de couverture

Les seuils de JaCoCo (90 % lignes sur les domaines métier, 80 % global) sont repris tels quels pour coverage.py **tant que le propriétaire n'en décide pas autrement**.
La couverture se lit comme un filet, pas comme un objectif : un test qui n'affirme rien ne compte pas.

## Ordre d'exécution en CI

Format et lint → types → import-linter → tests unitaires → tests d'intégration (conteneurs) → parité et contrat → audit des dépendances (OSV) et SBOM CycloneDX.
La CI ne se lance que sur demande du propriétaire (règle du dépôt).
