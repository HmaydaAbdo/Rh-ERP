---
title: "ADR 0016 — Backend Python FastAPI et service IA Python"
sidebar_position: 17
---

- **Statut** : accepté le 2026-11-03 par le propriétaire (preuve de terminé de KAN-43)
- **Date** : 2026-11-02
- **Décideur** : propriétaire du projet
- **Suivi** : KAN-19 (E2), KAN-43 (cet ADR), KAN-44 (conventions)

## Contexte

Les outils de l'assistant IA sont natifs en Python (LangChain, LangGraph, Deep Agents, FastMCP). Le backend est donc écrit en
Python avec le même écosystème que le service IA : un seul langage, des contrats d'outils partagés, aucune frontière de
langage à maintenir. Le backend est un monolithe modulaire de 12 domaines (`common`, `auth`, `audit`, `parametre`, MCP,
`function`, `equipe`, `chantier`, `employee`, `heuresupp`, `paie`, `accueil`) ; le service IA (`ia/`) est un second service
Python qui appelle l'API par MCP et lui échange ses jetons.

Garanties du backend : RBAC et périmètres par fiche de poste, journal d'audit, calculs de paie et d'heures supplémentaires,
façades métier entre domaines, 32 outils MCP, tests par domaine et couverture, contrôles OSV et sécurité de la CI, contrat OpenAPI
consommé par le frontend. Aucune brique payante.

## Décision

### 0. Principe directeur : le meilleur écosystème, sur la seule documentation officielle

On adopte l'écosystème qui implémente le mieux les pratiques éprouvées de l'IA, en s'appuyant **uniquement sur la
documentation officielle** de chaque composant (lue en entier via Context7 puis la source officielle, règle d'`AGENTS.md`),
jamais sur une supposition de comportement. On utilise le composant officiel du framework (LangChain, LangGraph, Deep Agents,
FastMCP, AG-UI, CopilotKit, A2UI) avant d'écrire du code maison.

**Clause de limite** : quand un composant atteint une limite documentée ou mesurée (fonction manquante, version instable,
performance, licence payante), on n'écrit pas de contournement. On rédige un court comparatif sourcé (au moins deux concurrents
gratuits, critères, limites, coût de sortie), on le propose au propriétaire, et on ne change qu'après son accord et, si le choix
est structurant, un ADR.

### 1. Forme : un monolithe modulaire Python

- Une application FastAPI unique. L'arborescence suit `conventions/architecture.md` (`domains/<domaine>`, `platform/`,
  `integrations/`) ; les frontières de domaine sont vérifiées par un test d'architecture (`api/tests/test_architecture.py`), et
  un domaine n'appelle un autre que par sa façade publique.
- Le serveur MCP est monté dans la même application. Les outils MCP appellent directement les façades de domaine en processus :
  la sécurité (permissions, périmètres, audit) est celle des routes HTTP.
- Le service IA reste un service distinct (`ia/`) : il échange le jeton de connexion de l'utilisateur contre un jeton agent,
  puis charge les outils de l'API par MCP.

### 2. Accès aux données : SQLAlchemy 2.x (ORM) avec psycopg 3

- SQLAlchemy 2.x, style déclaratif typé (`Mapped`, `mapped_column`), pilote psycopg 3, sessions asynchrones fournies par une
  dépendance FastAPI avec `yield`. Pydantic porte les DTO.
- **Verrouillage optimiste** : colonne `version BIGINT` ; le conflit rend HTTP 409 (« Cette ligne a été modifiée entre-temps »).
- **Audit** : les tables d'historique `*_aud` et le journal d'audit sont alimentés par des écouteurs de session SQLAlchemy
  (`before_flush`) et par un décorateur d'action auditée.
- Les calculs monétaires restent en `Decimal`, avec des règles d'arrondi explicites (montants entiers `HALF_DOWN` des heures
  supplémentaires, `NUMERIC` en base), chacune couverte par un test.

### 3. Migrations : Alembic

- Le schéma est géré **exclusivement** par des révisions Alembic. La révision de base `0001_base_v44` rejoue les 44 scripts SQL
  de `api/src/staport/migrations/base_v44` ; une base déjà migrée ne les rejoue pas.
- Les révisions sont écrites à la main en SQL explicite (`op.execute`) pour garder les contraintes `CHECK`, les index et les
  règles de `conventions/database.md` ; l'autogénération sert de contrôle de dérive, pas de source de vérité.
- Exécution : étape de déploiement dédiée (`api-migrate`) avant le démarrage de l'application, jamais dans sa durée de vie.

### 4. Authentification et autorisation

- **RS256 pour tous les jetons** (clé privée seule sur le serveur, clé publique publiable). Un **seul jeu de clés** signe les
  jetons utilisateur et les jetons de l'agent IA, séparés par leur audience (variables `MCP_JWT_*`).
- Mots de passe : Argon2 pour tout nouveau hachage ; les empreintes BCrypt existantes restent vérifiables et sont remplacées à la
  première connexion réussie.
- RBAC et périmètres par fiche de poste : dépendances FastAPI et façade `platform/identite` ; chaque route et chaque outil MCP
  déclare sa permission, et un test de couverture des routes le vérifie.

### 5. Tâches de fond, rapports et fichiers

- Pas de courtier de messages. Les traitements longs (PDF, import Excel, exports) s'exécutent dans un pool de threads
  (`run_in_threadpool`) pour ne pas bloquer la boucle d'événements ; les planifications sont portées par l'application avec un
  verrou consultatif PostgreSQL, car plusieurs processus ne doivent pas jouer la même tâche.
- **PDF** : WeasyPrint (HTML/CSS vers PDF, gratuit), avec un `URLFetcher` restreint. **Excel** : `openpyxl` avec `defusedxml`.
  **Courriel** : SMTP asynchrone.
- Les paquets système requis par le moteur PDF figent le `Dockerfile` de l'API.

### 6. Contrat d'API, observabilité, tests, qualité

- **OpenAPI** : généré par FastAPI à partir des modèles Pydantic ; le frontend en consomme le contrat.
- **Observabilité** : OpenTelemetry pour traces et métriques, journaux JSON, métriques Prometheus ; Phoenix pour les traces IA.
- **Tests** : `pytest`, `testcontainers` pour PostgreSQL réel, `TestClient` avec `dependency_overrides` pour substituer identité et
  configuration, tests de contrat HTTP, `coverage.py` avec seuils (90 % par domaine, 80 % global).
- **Qualité** : `ruff` (règles bandit incluses) et `pyright` en mode strict ; OSV et CycloneDX en CI ; portes de CI `backend`,
  `full-stack`, `ia` et `performance-profile`.

## Options écartées

- **Deux écosystèmes (un backend dans un autre langage, un service IA Python)** : duplique les contrats d'outils, ajoute une
  frontière réseau et un second outillage ; écarté par décision du propriétaire (Q15).
- **Django ou Litestar** : le service IA est déjà en FastAPI/Pydantic, ses outils et AG-UI s'y branchent ; un autre framework
  ajouterait un troisième écosystème sans gain mesuré.
- **SQLModel** : couche mince sur SQLAlchemy et Pydantic, mais moins éprouvée pour le verrouillage, l'audit et les contraintes
  SQL fines dont ce projet dépend ; SQLAlchemy seul est retenu.
- **Courtier de messages dès le départ** : écarté tant qu'aucun besoin mesuré ne le justifie.

## Conséquences

- Les conventions `backend-python` du site de documentation (architecture, persistance, API, sécurité, audit, tests,
  configuration, observabilité, MCP) détaillent la mise en œuvre de chaque point.
- Risques suivis : fidélité des PDF (comparaison d'images), arrondis monétaires (tests de calcul), perte d'horodatage ou de colonne
  dans l'audit (comparaison des lignes `*_aud` sur un scénario donné), dérive de schéma (contrôle d'autogénération).

## Règles propres au profil Python

Règles du backend, détaillées dans les conventions `backend-python` : injection par `Depends()` avec `Annotated` ; entités
SQLAlchemy 2.x jamais exposées par l'API ; frontière transactionnelle explicite (`session.begin()`, `expire_on_commit=False`,
`selectinload`) ; `async def` pour la base, `def` ou `run_in_threadpool` pour le bloquant ; aucune migration dans le `lifespan` ;
interdiction des écritures ORM en masse sur une entité auditée ; sélection d'outils juste-à-temps bornée et utilisation stricte
des capacités de LangChain, LangGraph et Deep Agents (`AGENTS.md`, `conventions/agents-ia.md`).
