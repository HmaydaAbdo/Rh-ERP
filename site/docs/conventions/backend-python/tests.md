---
title: Tests et qualité
sidebar_position: 7
---

# Tests et qualité

La pyramide, les quatre niveaux de tests et l'exigence « un test avant le code, un test de non-régression par bogue » ne changent pas. Cette page donne les outils
de l'[ADR 0016](../../decisions/0016-backend-python-fastapi.md).

## Outils

| Besoin | Outil |
| --- | --- |
| Exécution des tests | `pytest`, fixtures, `unittest.mock` |
| Base de données réelle | `testcontainers-python` (`PostgresContainer`) |
| Remplacement d'une dépendance | `app.dependency_overrides` |
| Test d'API | `TestClient` de FastAPI (HTTPX) |
| Architecture | test statique des imports (`api/tests/test_architecture.py`) |
| Style, bogues courants | Ruff (lint et format) |
| Types | pyright (mode strict) |
| Couverture | coverage.py (avec `pytest-cov` ou `coverage run -m pytest`) |

## Règles de test

1. Domaine métier : tests unitaires de fonctions pures et de services, sans base ni réseau. Les montants se comparent en `Decimal`, jamais en `float`.
2. Persistance : tests d'intégration sur **PostgreSQL réel** (testcontainers), jamais une base en mémoire de substitution. Avec `psycopg` 3, instancier le conteneur
   avec `driver=None` pour obtenir une URL utilisable (documenté par testcontainers-python). Les migrations sont appliquées avant les tests.
3. API : `TestClient` ; le `lifespan` ne s'exécute que dans un bloc `with TestClient(app)`. Les dépendances externes (identité, horloge, client HTTP, modèle d'IA)
   sont remplacées par `app.dependency_overrides`, remis à zéro en fin de test.
4. Fixtures : portée la plus étroite qui reste économique (la base partagée par session, les données par test avec annulation de transaction). Aucune donnée réelle :
   identités, secrets et données de test sont synthétiques.
5. Un test ignoré porte une raison (`pytest.mark.skip(reason=...)`) et un ticket Jira ; aucun test désactivé sans suivi.
6. **Tests de calcul** : pour chaque règle de calcul, des entrées figées et des sorties attendues (paie, heures supplémentaires, arrondis, exports). C'est la
   preuve de non-régression des montants.
7. Test de contrat OpenAPI (voir [API](./api.md)), test de couverture des routes (voir [sécurité](./securite.md)), test de couverture de l'audit (voir [audit](./audit.md)).
8. **Tests asynchrones : plugin pytest d'AnyIO, marqueur `@pytest.mark.anyio`.** C'est celui de la documentation FastAPI (tests asynchrones avec `httpx.AsyncClient` et
   `ASGITransport`) et du SDK MCP (`Client(mcp)` en mémoire) : un seul mécanisme pour l'API et le serveur MCP. `pytest-asyncio` (mode `auto`, `loop_scope`) est une alternative
   documentée, **non retenue** pour ne pas avoir deux exécuteurs. Les tests d'API synchrones continuent d'utiliser `TestClient` ; `AsyncClient` ne déclenche pas le `lifespan` : un
   test qui en dépend l'entoure d'un gestionnaire de `lifespan` (`LifespanManager` de `asgi-lifespan`, cité par la documentation FastAPI). Les fixtures asynchrones à portée large
   (base de données de la session) supposent une boucle de même portée : à valider par le premier test d'intégration de KAN-47, qui sert de modèle.

## Qualité statique

* **Ruff** : `extend-select` pour ajouter les familles utiles (erreurs, imports triés, bogues courants, sécurité de type bandit, simplifications), `per-file-ignores`
  pour les exceptions motivées (par exemple `assert` dans les tests). Format imposé par `ruff format`. Zéro avertissement toléré en CI.
* **Test d'architecture** : `api/tests/test_architecture.py` analyse statiquement les imports (couches d'un domaine, aucun accès au dépôt ou au routeur d'un autre domaine) et échoue au premier écart.
* **pyright** : `typeCheckingMode = "strict"` dans `[tool.pyright]` de `pyproject.toml` (`include = ["src"]`, `pythonVersion` explicite) ; le défaut documenté est `standard`.
  Une bibliothèque sans types ne se contourne pas par un `Any` : on déclare un `Protocol` et un `cast` (modèle recommandé par les tests de pyright), ou on ajoute un stub. Une
  suppression locale utilise `# pyright: ignore[règle]` (règle nommée) et `reportUnnecessaryTypeIgnoreComment` signale les suppressions devenues inutiles.
* Aucun code mort, aucun `TODO` sans ticket Jira.

## Seuils de couverture

Les seuils (90 % lignes sur les domaines métier, 80 % global) s'appliquent à coverage.py **tant que le propriétaire n'en décide pas autrement**.
La couverture se lit comme un filet, pas comme un objectif : un test qui n'affirme rien ne compte pas.

Configuration coverage.py (documentée) dans `pyproject.toml` : `[tool.coverage.run]` avec `branch = true`, `source_pkgs = ["staport"]` et `omit` limité aux fichiers générés ;
`[tool.coverage.report]` avec `fail_under` (équivalent de `--fail-under`, sortie en code 2 sous le seuil) et `show_missing = true`. Le code asynchrone de la bibliothèque standard
(`asyncio`) est mesuré par défaut (`concurrency = thread`) ; `greenlet` n'est à nommer dans `concurrency` que si le pilote ou l'ORM en dépend dans le chemin mesuré (SQLAlchemy asynchrone
utilise greenlet en interne) — le premier rapport sert à vérifier que le code des services n'apparaît pas à tort comme non exécuté. Seuils par domaine : un `coverage report` par
sous-ensemble (`--include`), pas une valeur globale qui masque un domaine.

## Ordre d'exécution en CI

Format et lint → types → tests d'architecture et unitaires → tests d'intégration (conteneurs) → calculs et contrat → audit des dépendances (OSV) et SBOM CycloneDX.
La CI ne se lance que sur demande du propriétaire (règle du dépôt).
