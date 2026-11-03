---
title: Backend Python (FastAPI)
sidebar_position: 1
---

# Backend Python (FastAPI)

Profil Python des conventions du backend, qui remplace le profil Java/Spring à la bascule décidée par l'[ADR 0016](../../decisions/index.md).
Les principes (monolithe modulaire, refus par défaut, audit, tests par couches, mesures avant optimisation) ne changent pas : ces pages
les traduisent dans l'idiome de FastAPI, Pydantic, SQLAlchemy et Alembic. Tant que Spring sert la production, les conventions Java
restent applicables au code Java ; ce profil s'applique au code de la branche `migration/fastapi`.

| Page | Remplace |
| --- | --- |
| [Architecture](./architecture.md) | `architecture.md` (profil Java), `design-patterns.md` (exemples Java) |
| [Persistance et migrations](./persistance.md) | `jpa.md`, partie Flyway de `database.md` |
| [API, contrat et erreurs](./api.md) | `swagger.md` (mise en œuvre), DTO et mappers |
| [Sécurité](./securite.md) | mise en œuvre de `security.md` |
| [Audit](./audit.md) | mise en œuvre de `audit.md` (Envers) |
| [Tests et qualité](./tests.md) | mise en œuvre de `testing.md` (JUnit, ArchUnit, Checkstyle, JaCoCo) |
| [Configuration](./configuration.md) | mise en œuvre de `configuration.md` (Spring) |
| [Observabilité et performance](./observabilite.md) | mise en œuvre de `logging.md`, `metrics.md`, `performance.md` |
| [Règles supprimées ou changées](./regles-changees.md) | liste exigée par KAN-44 |

## Sources lues (relecture d'entrée, 2026-11-03)

Règle d'`AGENTS.md` : ne jamais supposer le comportement d'un framework. Les règles ci-dessous s'appuient sur la documentation officielle
lue via Context7 puis la source officielle : FastAPI (grandes applications, dépendances avec `yield`, `lifespan`, tests, gestion des
erreurs, sécurité OAuth2/JWT, `async`/`def`, réglages), SQLAlchemy 2.x (asyncio, `version_id_col`, événements de session), Alembic
(`stamp`, modèle `async`, `op.execute`), Pydantic et pydantic-settings, PyJWT, pytest, testcontainers-python, import-linter, Ruff,
OpenTelemetry Python (instrumentation FastAPI).

:::warning Non vérifié
Ce qui suit n'a pas été lu dans la documentation officielle et reste à confirmer avant d'être appliqué (relecture d'entrée de KAN-47 et KAN-48) :
le SDK MCP Python (donc **la convention MCP n'est pas encore écrite**, `mcp.md` s'applique jusque-là), pyright, WeasyPrint, openpyxl,
pwdlib (migration de hachage), `pytest-asyncio`/anyio, coverage.py, le middleware CORS de Starlette, la gestion fine des transactions
(`Session.begin`), les conventions de nommage de `MetaData`. Chaque point concerné est signalé « à confirmer » dans sa page.
:::
