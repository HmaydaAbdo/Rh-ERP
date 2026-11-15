---
title: Backend Python (FastAPI)
sidebar_position: 1
---

# Backend Python (FastAPI)

Profil Python des conventions du backend ([ADR 0016](../../decisions/0016-backend-python-fastapi.md)). Les principes (monolithe
modulaire, refus par défaut, audit, tests par couches, mesures avant optimisation) sont ceux de `conventions/` ; ces pages les
traduisent dans l'idiome de FastAPI, Pydantic, SQLAlchemy et Alembic.

| Page | Contenu |
| --- | --- |
| [Architecture](./architecture.md) | couches d'un domaine, façades, gestionnaires d'exceptions, `async def` ou `def`, principes de conception |
| [Persistance et migrations](./persistance.md) | SQLAlchemy 2.x, transactions, montants, révisions Alembic |
| [API, contrat et erreurs](./api.md) | OpenAPI, format d'erreur, exports PDF et Excel |
| [Sécurité](./securite.md) | mise en œuvre de `security.md` |
| [Audit](./audit.md) | mise en œuvre de `audit.md` |
| [Tests et qualité](./tests.md) | mise en œuvre de `testing.md` (pytest, testcontainers, Ruff, pyright, coverage.py) |
| [Configuration](./configuration.md) | mise en œuvre de `configuration.md` (pydantic-settings) |
| [Observabilité et performance](./observabilite.md) | mise en œuvre de `logging.md`, `metrics.md`, `performance.md` |
| [Serveur MCP](./mcp.md) | mise en œuvre de `mcp.md` (FastMCP monté dans FastAPI) |

## Sources lues (relecture d'entrée, 2026-11-03)

Règle d'`AGENTS.md` : ne jamais supposer le comportement d'un framework. Les règles ci-dessous s'appuient sur la documentation officielle
lue via Context7 puis la source officielle : FastAPI (grandes applications, dépendances avec `yield`, `lifespan`, tests, gestion des
erreurs, sécurité OAuth2/JWT, `async`/`def`, réglages), SQLAlchemy 2.x (asyncio, `version_id_col`, événements de session), Alembic
(`stamp`, modèle `async`, `op.execute`), Pydantic et pydantic-settings, joserfc et Authlib, pytest, testcontainers-python, Ruff,
OpenTelemetry Python (instrumentation FastAPI).

Lectures complémentaires du même jour : SDK MCP Python (ligne 2.x), pyright, coverage.py, pytest-asyncio et le plugin AnyIO, pwdlib, `CORSMiddleware` de Starlette,
WeasyPrint, openpyxl, `Session.begin`/autobegin, `MetaData.naming_convention`, événements `before_flush`/`after_flush`.

:::note Ce qui reste à prouver par des tests, pas par de la lecture
Quelques points sont documentés mais se démontrent sur le code réel au premier domaine migré : lignes d'audit des objets nouveaux (`after_flush`), portée des fixtures
asynchrones, rendu visuel des PDF (SVG, polices), mesure de couverture du code asynchrone. Chacun a son test obligatoire dans la page concernée.
:::
