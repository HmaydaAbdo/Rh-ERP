---
title: Backend Python (FastAPI)
sidebar_position: 1
---

# Backend Python (FastAPI)

Profil Python des conventions du backend, qui remplace le profil Java/Spring à la bascule décidée par l'[ADR 0016](../../decisions/index.md).
Les principes (monolithe modulaire, refus par défaut, audit, tests par couches, mesures avant optimisation) ne changent pas : ces pages
les traduisent dans l'idiome de FastAPI, Pydantic, SQLAlchemy et Alembic. Tant que Spring sert la production, les conventions Java
restent applicables au code Java ; ce profil s'applique au code Python du backend, écrit pendant la migration (E2, ADR 0016).

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
| [Serveur MCP](./mcp.md) | mise en œuvre de `mcp.md` (Spring AI MCP) |
| [Règles supprimées ou changées](./regles-changees.md) | liste exigée par KAN-44 |

## Sources lues (relecture d'entrée, 2026-11-03)

Règle d'`AGENTS.md` : ne jamais supposer le comportement d'un framework. Les règles ci-dessous s'appuient sur la documentation officielle
lue via Context7 puis la source officielle : FastAPI (grandes applications, dépendances avec `yield`, `lifespan`, tests, gestion des
erreurs, sécurité OAuth2/JWT, `async`/`def`, réglages), SQLAlchemy 2.x (asyncio, `version_id_col`, événements de session), Alembic
(`stamp`, modèle `async`, `op.execute`), Pydantic et pydantic-settings, PyJWT, pytest, testcontainers-python, import-linter, Ruff,
OpenTelemetry Python (instrumentation FastAPI).

Lectures complémentaires du même jour : SDK MCP Python (ligne 2.x), pyright, coverage.py, pytest-asyncio et le plugin AnyIO, pwdlib, `CORSMiddleware` de Starlette,
WeasyPrint, openpyxl, `Session.begin`/autobegin, `MetaData.naming_convention`, événements `before_flush`/`after_flush`.

:::note Ce qui reste à prouver par des tests, pas par de la lecture
Quelques points sont documentés mais se démontrent sur le code réel au premier domaine migré : lignes d'audit des objets nouveaux (`after_flush`), portée des fixtures
asynchrones, rendu visuel des PDF (SVG, polices), mesure de couverture du code asynchrone. Chacun a son test obligatoire dans la page concernée.
:::
