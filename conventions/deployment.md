# Déploiement — Docker Compose, PostgreSQL, migrations

> La stack de référence pour développer et faire tourner ce projet est Docker Compose. Toute
> évolution de l'infrastructure (services, variables d'environnement, migrations) doit rester
> cohérente avec ce document.

---

## Stack

| Service | Rôle | Image / build |
|---|---|---|
| `postgres` | Base de données | `pgvector/pgvector:pg17` (PostgreSQL 17 + extension `vector`) |
| `backend` | API Spring Boot | build multi-stage depuis `backend/Dockerfile` |
| `frontend` | UI Angular (serveur de dev) | build depuis `frontend/Dockerfile`, code monté en volume |

Fichier d'orchestration : `docker-compose.yml` à la racine du dépôt. Variables lues depuis `.env` à
la racine (voir `.env.example`) — jamais de secret commité (`conventions/configuration.md`).

---

## Pourquoi PostgreSQL plutôt que MySQL/MariaDB

Décision produit (2026-09-22) : le projet est passé de MySQL à PostgreSQL 17. `conventions/database.md`
décrit les conventions de migration qui en découlent — ce document-ci ne couvre que l'aspect
infrastructure (comment la base tourne, comment elle est démarrée).

`pgvector` est activé (`CREATE EXTENSION IF NOT EXISTS vector`, voir la première migration Flyway)
en anticipation d'un usage futur (recherche sémantique/embeddings). Aucune colonne vectorielle
n'existe à ce jour — ne pas en introduire sans besoin métier clairement identifié
(`conventions/architecture.md`).

---

## Démarrer le projet

```bash
cp .env.example .env   # une seule fois, puis renseigner de vraies valeurs
docker compose up -d --build
```

- `postgres` expose son port sur l'hôte (`POSTGRES_PORT`, défaut `5432`) — utile pour se connecter
  avec un client SQL ou lancer le backend en local (voir ci-dessous).
- `backend` expose `BACKEND_PORT` (défaut `8080`), applique les migrations Flyway puis démarre.
- `frontend` expose `FRONTEND_PORT` (défaut `4200`), sert l'application via `ng serve` avec
  rechargement à chaud (le code source est monté en volume, `node_modules` reste dans un volume
  nommé séparé pour ne pas être écrasé par celui de l'hôte).

Arrêter : `docker compose down` (ajouter `-v` pour supprimer aussi les données PostgreSQL
persistées).

### Développement backend actif

Le conteneur `backend` reconstruit l'image à chaque changement de code (`docker compose up --build
backend`) — correct pour "faire tourner le projet", mais plus lent qu'un cycle de développement
actif. Pour itérer rapidement sur le backend, lancer `./mvnw spring-boot:run` en local (le fichier
`backend/.env` local pointe alors `DB_HOST=localhost`, `DB_PORT` sur le port publié par le service
`postgres`) pendant que `postgres` (et éventuellement `frontend`) restent gérés par Docker Compose :

```bash
docker compose up -d postgres
cd backend && ./mvnw spring-boot:run
```

### Tests

Les tests qui chargent le contexte Spring (`PaieApplicationTests`) ont besoin d'une base PostgreSQL
réelle et accessible (les autres tests sont des tests unitaires avec repositories mockés, sans base
réelle) — démarrer `docker compose up -d postgres` avant `./mvnw test` si ce n'est pas déjà fait.

---

## Migrations — Flyway

Le schéma est géré exclusivement par Flyway (`backend/src/main/resources/db/migration/`), jamais
par Hibernate : `spring.jpa.hibernate.ddl-auto` est fixé à `validate` (voir
`conventions/database.md` pour le détail des conventions de migration). Flyway s'exécute
automatiquement au démarrage de l'application, avant l'initialisation de Hibernate.

Nommage des fichiers : `V<numéro>__description_en_minuscules_avec_underscores.sql`, numéros
strictement croissants, jamais réutilisés ni modifiés une fois appliqués sur un environnement
partagé (voir `conventions/database.md`, section « Ajouter une migration »).

---

## Variables d'environnement

| Variable | Portée | Description |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `.env` racine, service `postgres` | Identifiants de la base — repris tels quels par le service `backend` |
| `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` | `.env` racine | Ports publiés sur l'hôte |
| `CHANTIER_SYNC_BASE_URL` | `.env` racine (Docker) ou `backend/.env` (local) | Endpoint ERP, obligatoire (`conventions/security.md`) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `backend/.env` (développement local hors Docker uniquement) | Connexion à la base — en Docker, ces valeurs sont injectées directement par `docker-compose.yml` |
| `BACKEND_URL` | Service `frontend` (Docker uniquement) | Cible du proxy de développement Angular (`frontend/proxy.conf.js`) — `http://backend:8080` en Docker, `http://localhost:8080` par défaut en local |

Aucune de ces variables n'a de valeur par défaut dans `application.yml` (`conventions/configuration.md`)
— l'application refuse de démarrer si l'une d'elles manque.

---

## Ce qui n'existe pas encore

- Pas d'image "production" pour le frontend (pas de build Angular optimisé servi par nginx) —
  seul un mode développement existe, aucun besoin de déploiement en production identifié à ce jour.
- Pas de CI/CD.
- Pas de secrets manager — `.env` reste la seule source de configuration sensible, adaptée au stade
  actuel du projet (développement), à revoir avant toute mise en production
  (`conventions/security.md`).
