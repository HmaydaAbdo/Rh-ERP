# Staport Intelligence

Système de gestion du personnel, pointage et paie de **Staport**, une entreprise du BTP (bâtiment
et travaux publics).

Domaines métier en place : **Fonction** (référentiel des fonctions), **Chantier** (référentiel, chantiers
manquants ajoutés depuis l'ERP existant), **Équipe** (référentiel des équipes), **Employé** (fiche d'identité,
affectation fonction/chantier), **Paie** (bulletins mensuels, export Excel, rapport PDF de synthèse) et **Auth**
(comptes, rôles, permissions). Le domaine **Pointage** reste à construire (voir Jira, KAN-171).

> **Documentation** : tout est dans le site [`site/`](site) (pages dans [`site/docs`](site/docs/index.md)). Les conventions de
> développement, génériques et réutilisables, sont dans [`conventions/`](conventions) et font foi pour toute
> contribution — voir [CLAUDE.md](CLAUDE.md) pour l'ordre de lecture recommandé.

---

## Stack technique

| Composant | Techno |
|---|---|
| Backend | Python 3.14, FastAPI, Pydantic, SQLAlchemy 2 (asynchrone), Alembic, authentification par jetons JWT, serveur MCP FastMCP |
| Base de données | PostgreSQL 18 + pgvector + pgAudit (migration logique depuis PostgreSQL 17 ; l'ancien volume reste conservé comme retour arrière) |
| Migrations | [Alembic](https://alembic.sqlalchemy.org/) (base d'origine = scripts V1 à V44 conservés dans `api/src/staport/migrations/flyway_v44`, rejoués par la révision `0001_base_v44`) — voir `conventions/database.md` et [`site/docs/architecture/modele-de-donnees.md`](site/docs/architecture/modele-de-donnees.md) |
| Frontend | Angular 22.2.2 (standalone, OnPush, Signals, zoneless), kit Staport sur Angular Aria/CDK, Lucide, Tailwind CSS 4 ; tests Vitest et E2E Playwright |
| Imports / exports | openpyxl (Excel), WeasyPrint (rapport PDF) |
| Documentation API | OpenAPI générée par FastAPI (Swagger UI) |
| Conteneurisation | Docker Compose de production (images publiées, pas de build local) — nginx inner sert le frontend et relaie les appels API au backend, voir [`site/docs/exploitation/deploiement.md`](site/docs/exploitation/deploiement.md) |

---

## Développement local (recommandé au quotidien)

Le `docker-compose.yml` à la racine est un **Compose de production** : il ne contient aucun `build:`,
uniquement des images déjà publiées sur Docker Hub par la CI (voir
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Pour développer, lancer le backend et le
frontend directement en local (rechargement à chaud, bien plus rapide qu'un conteneur reconstruit à
chaque changement) pendant que Docker ne fournit que la base de données :

```bash
docker compose up -d postgres        # seule la base tourne en Docker (ports liés à 127.0.0.1)

cd api
uv sync                              # dépendances Python (uv)
uv run alembic upgrade head          # migrations (compte propriétaire de la base)
# variables : voir .env.example à la racine et site/docs/exploitation/developpement-local.md
# lancer le serveur : de préférence le conteneur `api` (Linux), voir site/docs/exploitation/developpement-local.md

cd ../frontend
npm install
npm start                            # proxy vers http://localhost:8080 par défaut (proxy.conf.js)
```

Frontend sur http://localhost:4200, API (documentation OpenAPI sur `/docs`) sur http://localhost:8080. Toutes les variables d'environnement sont décrites dans
[`site/docs/exploitation/configuration.md`](site/docs/exploitation/configuration.md).

### Tests

```bash
cd api && uv run pytest                                              # PostgreSQL réel démarré par testcontainers (Docker requis)
cd frontend && npm test                                             # tests frontend (Vitest)
cd frontend && npm run e2e                                          # parcours E2E (Playwright)
cd frontend && npx ng build --configuration production              # le bundle de production compile
```

Détail de ce qui est testé : [`site/docs/exploitation/tests.md`](site/docs/exploitation/tests.md).

---

## Stack complète (production, ou test local de l'image de prod)

```bash
cp .env.example .env
# renseigner DOCKERHUB_USERNAME + toutes les valeurs (voir .env.example) ; COOKIE_SECURE=true,
# FRONTEND_URL en HTTPS réel pour une vraie mise en production.
docker compose pull    # récupère les images publiées par la CI
docker compose up -d   # toute la pile : ERP, sauvegarde, rétention pgAudit, LiteLLM et assistant IA
```

Aucun profil Compose n'est à passer : tous les services démarrent par défaut. Les clés virtuelles LiteLLM du `.env`
sont enregistrées toutes seules au démarrage (service ponctuel `litellm-cles`) ; `IA_ENABLED=false` ou
`MCP_ENABLED=false` coupe l'assistant sans arrêter l'ERP.

Sans image déjà publiée sur Docker Hub (ex. avant le premier run de la CI, ou pour tester la stack
de production localement sans dépendre d'un registre), construire et tagger les images soi-même
avant `docker compose up -d` — `docker compose pull` échouera sinon :

```bash
docker build -t $DOCKERHUB_USERNAME/staport-intelligence-api:$BACKEND_IMAGE_TAG ./backend
docker build -t $DOCKERHUB_USERNAME/staport-intelligence-frontend:$FRONTEND_IMAGE_TAG ./frontend
docker build -t $DOCKERHUB_USERNAME/staport-intelligence-postgres:$POSTGRES_IMAGE_TAG ./database
docker build -t $DOCKERHUB_USERNAME/staport-intelligence-backup:$BACKUP_IMAGE_TAG ./backup
docker build -t $DOCKERHUB_USERNAME/staport-intelligence-litellm:$LITELLM_IMAGE_TAG ./litellm
docker build -t $DOCKERHUB_USERNAME/staport-intelligence-ia:$IA_IMAGE_TAG ./ia
docker compose up -d
```

Tous les ports publiés sont liés à `127.0.0.1` (jamais exposés directement à Internet, voir
`conventions/security.md`) — accès via `http://localhost:${FRONTEND_PORT}`. Architecture complète
(nginx inner/outer, réseaux, backup) : voir [`site/docs/exploitation/deploiement.md`](site/docs/exploitation/deploiement.md).

Arrêter la stack :

```bash
docker compose down          # conserve les données
docker compose down -v       # supprime aussi les données PostgreSQL
```

---

## Structure du dépôt

```
api/          API FastAPI (staport.domains.<domaine> : auth, chantier, employee, equipe, function, paie, heuresupp, audit, mcp…)
frontend/     Application Angular (migration vers Angular Aria/CDK + composants Staport), nginx.conf (nginx de production)
conventions/  Conventions du projet — source de vérité, génériques et réutilisables entre projets
site/         Site de documentation (Docusaurus) : architecture, modèle de données, domaines, RBAC, IA, décisions, déploiement
.github/workflows/  CI (tests + build + publication des images Docker)
docker-compose.yml  Stack de production (images publiées uniquement, voir site/docs/exploitation/deploiement.md)
api/Dockerfile, frontend/Dockerfile
CLAUDE.md, AGENTS.md  Point d'entrée du projet et ordre de lecture des conventions (contenu identique)
```

---

## Documentation

Index complet : [`site/docs/index.md`](site/docs/index.md).

| Sujet | Document |
|---|---|
| Vue d'ensemble, dépendances entre domaines, flux d'une requête | [`site/docs/architecture/vue-d-ensemble.md`](site/docs/architecture/vue-d-ensemble.md) |
| Schéma de base, contraintes, migrations | [`site/docs/architecture/modele-de-donnees.md`](site/docs/architecture/modele-de-donnees.md) |
| Variables d'environnement et démarrage | [`site/docs/exploitation/configuration.md`](site/docs/exploitation/configuration.md) |
| Imports Excel (règles communes) | [`site/docs/domaines/imports.md`](site/docs/domaines/imports.md) |
| Authentification, comptes, rôles | [`site/docs/domaines/auth/index.md`](site/docs/domaines/auth/index.md) |
| Permissions par endpoint et par écran | [`site/docs/domaines/rbac/index.md`](site/docs/domaines/rbac/index.md) |
| Interface (routes, guards, composants, tableaux) | [`site/docs/frontend/index.md`](site/docs/frontend/index.md) |
| Tests | [`site/docs/exploitation/tests.md`](site/docs/exploitation/tests.md) |
| Déploiement (Docker, nginx, CI, backup) | [`site/docs/exploitation/deploiement.md`](site/docs/exploitation/deploiement.md) |

Par domaine : [fonctions](site/docs/domaines/function/index.md) · [chantiers](site/docs/domaines/chantier/index.md) ·
[équipes](site/docs/domaines/equipe/index.md) · [employés](site/docs/domaines/employee/index.md) · [paie](site/docs/domaines/paie/index.md) ·
[export Excel et rapport PDF](site/docs/domaines/rapport/index.md).

---

## Configuration

Toute valeur dépendant de l'environnement (URL, port, identifiants) est lue via une variable
d'environnement **sans valeur par défaut dans le code** — l'application refuse de démarrer si une
variable requise est absente (`conventions/configuration.md`). Deux fichiers d'exemple documentent
les variables attendues :

- [`.env.example`](.env.example) (racine) — variables du Compose de production (Postgres, ports,
  images Docker Hub, JWT/RBAC, SMTP).

Copier-le en `.env` (jamais commité, voir `.gitignore`) et renseigner de vraies valeurs. Catalogue
complet : [`site/docs/exploitation/configuration.md`](site/docs/exploitation/configuration.md).

---

## Authentification et rôles

Authentification par JWT (jeton d'accès de 15 minutes en mémoire, jeton de rafraîchissement de 30 jours en
cookie `httpOnly`, rotation à usage unique avec révocation de toute la session en cas de réutilisation) avec
RBAC dynamique : 24 permissions fixes, rôles administrables via l'UI (`/admin/roles`, `/admin/users`), refus
individuels prioritaires sur les rôles. Chaque écran et chaque bouton d'action est conditionné par une
permission. Détail : [`site/docs/domaines/auth/index.md`](site/docs/domaines/auth/index.md) et [`site/docs/domaines/rbac/index.md`](site/docs/domaines/rbac/index.md).

Au premier démarrage, un compte `SYSTEM_ADMIN` est créé automatiquement depuis
`ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` (voir `.env.example`) — à utiliser pour se connecter
la première fois, puis changer le mot de passe via l'UI.

## Règles de fonctionnement à connaître

- Les fichiers Excel **ajoutent** des données (fonctions, employés, bulletins) ; ils ne modifient jamais
  l'existant. Toute modification se fait depuis l'interface. Import atomique : une ligne invalide rejette tout le
  fichier ([`site/docs/domaines/imports.md`](site/docs/domaines/imports.md)).
- La synchronisation des chantiers avec l'ERP **ajoute** les chantiers manquants, sans rien modifier.
- La paie **n'est pas calculée** : le total est saisi ou importé tel quel.

## État du projet

- L'audit (historique des entités par écouteurs de session SQLAlchemy + journal unique + événements de sécurité et consultations métier HTTP) est en place : voir [site/docs/domaines/audit/index.md](site/docs/domaines/audit/index.md). Les options restantes et leurs déclencheurs sont suivies dans Jira (projet `KAN`).
- Domaine Pointage non construit : KAN-171.
- Prochaine tâche d'exploitation : qualité des données (tous champs obligatoires, aucun doublon) : KAN-177 et KAN-160.

L'architecture de déploiement (Docker Compose de production, nginx inner/outer, CI) est en place —
voir [`site/docs/exploitation/deploiement.md`](site/docs/exploitation/deploiement.md). Le service de backup PostgreSQL démarre par défaut
avec le reste de la pile, sans profil Compose. Les éléments qui restent à préparer pour la mise en
production sont suivis dans ce même document et dans Jira (KAN-161 à KAN-164).
