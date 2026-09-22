# Déploiement — Docker Compose, PostgreSQL, migrations

> Pattern de référence pour développer et faire tourner un projet Spring Boot + Angular avec
> PostgreSQL, réutilisable d'un projet à l'autre. La liste réelle des services, ports et variables
> d'un projet donné vit dans son propre `docker-compose.yml` et son README, pas ici.

---

## Stack de référence

| Service | Rôle | Image / build |
|---|---|---|
| `postgres` | Base de données | `postgres:<version>` (ou `pgvector/pgvector:pg<version>` si des embeddings/recherche vectorielle sont nécessaires) |
| `backend` | API Spring Boot | build multi-stage depuis `backend/Dockerfile` |
| `frontend` | UI Angular (serveur de dev) | build depuis `frontend/Dockerfile`, code monté en volume |
| `mailpit` (dev uniquement) | Attrape-mail local pour tester les flows email sans SMTP réel | `axllent/mailpit` |

Fichier d'orchestration : `docker-compose.yml` à la racine du dépôt. Variables lues depuis `.env` à
la racine — jamais de secret commité (`conventions/configuration.md`).

---

## Choix technologiques — PostgreSQL, pgvector

PostgreSQL est le choix par défaut pour un nouveau projet (large écosystème, JSON natif, extensions
matures). L'extension `pgvector` n'est activée que si un besoin réel de recherche
vectorielle/embeddings est identifié — ne jamais l'activer par anticipation
(`conventions/architecture.md`).

---

## Démarrer le projet

```bash
cp .env.example .env   # une seule fois, puis renseigner de vraies valeurs
docker compose up -d --build
```

- `postgres` expose son port sur l'hôte — utile pour se connecter avec un client SQL ou lancer le
  backend en local (voir ci-dessous).
- `backend` expose son port HTTP, applique les migrations Flyway puis démarre.
- `frontend` expose son port, sert l'application via `ng serve` avec rechargement à chaud (le code
  source est monté en volume, `node_modules` reste dans un volume nommé séparé pour ne pas être
  écrasé par celui de l'hôte).

Arrêter : `docker compose down` (ajouter `-v` pour supprimer aussi les données PostgreSQL
persistées).

### Développement backend actif

Le conteneur `backend` reconstruit l'image à chaque changement de code — correct pour "faire
tourner le projet", mais plus lent qu'un cycle de développement actif. Pour itérer rapidement sur
le backend, lancer le serveur en local (`./mvnw spring-boot:run` ou équivalent) pendant que
`postgres` (et éventuellement `frontend`) restent gérés par Docker Compose :

```bash
docker compose up -d postgres
cd backend && ./mvnw spring-boot:run
```

### Tests

Les tests qui chargent le contexte Spring ont besoin d'une base PostgreSQL réelle et accessible
(les tests unitaires avec repositories mockés n'en ont pas besoin) — démarrer `docker compose up -d
postgres` avant de lancer les tests si ce n'est pas déjà fait.

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
| Identifiants base de données | `.env` racine, service `postgres` | Repris tels quels par le service `backend` |
| Ports exposés sur l'hôte | `.env` racine | Un par service publié |
| Endpoints externes obligatoires du projet | `.env` racine (Docker) ou `backend/.env` (local) | Toute intégration externe requise par le projet — voir sa propre documentation |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `backend/.env` (développement local hors Docker uniquement) | Connexion à la base — en Docker, ces valeurs sont injectées directement par `docker-compose.yml` |
| `BACKEND_URL` | Service `frontend` (Docker uniquement) | Cible du proxy de développement Angular — service Docker en Docker, `localhost` par défaut en local |

Aucune de ces variables n'a de valeur par défaut dans `application.yml`
(`conventions/configuration.md`) — l'application refuse de démarrer si l'une d'elles manque.

---

## Frontend/backend same-origin via le proxy de développement

Faire proxifier les appels API du serveur de développement Angular vers le backend (plutôt que de
laisser le navigateur appeler directement un autre port) a un effet de bord utile au-delà du
confort de développement : le navigateur ne voit qu'une seule origine, ce qui simplifie la gestion
des cookies d'authentification (voir `conventions/security.md`, section Cookie Refresh Token) et
évite toute configuration CORS en développement. Un `bypass` distinguant navigation de page (HTML)
et appels API (JSON) est nécessaire dès qu'un chemin proxifié coïncide avec une route Angular
existante.

---

## Ce qui n'existe pas forcément

- Une image "production" pour le frontend (build Angular optimisé servi par nginx) n'est pas
  systématique — ne l'ajouter que lorsqu'un déploiement en production est réellement planifié.
- CI/CD — à mettre en place selon le besoin du projet.
- Un secrets manager — `.env` convient au stade développement ; à revoir avant toute mise en
  production réelle (`conventions/security.md`).
