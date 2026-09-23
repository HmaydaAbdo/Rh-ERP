# rh-erp

Système de gestion du personnel, pointage et paie de **Staport**, une entreprise du BTP (bâtiment
et travaux publics).

Quatre domaines métier aujourd'hui : **Fonction** (référentiel des fonctions occupées),
**Chantier** (référentiel synchronisé depuis l'ERP existant), **Employé** (fiche d'identité,
affectation fonction/chantier) et **Paie** (bulletins mensuels). Le domaine **Pointage** reste à
construire (voir [TODO.md](TODO.md)).

> Les conventions détaillées du projet sont dans [`conventions/`](conventions) et font foi pour
> toute contribution — voir [CLAUDE.md](CLAUDE.md) pour l'ordre de lecture recommandé.

---

## Stack technique

| Composant | Techno |
|---|---|
| Backend | Java 21, Spring Boot 4.1.1, Spring Data JPA/Hibernate |
| Base de données | PostgreSQL 17 (extension [pgvector](https://github.com/pgvector/pgvector), activée en anticipation d'un usage futur — voir `conventions/deployment.md`) |
| Migrations | [Flyway](https://flywaydb.org/) — voir `conventions/database.md` |
| Frontend | Angular 17, [PrimeNG](https://primeng.org/) |
| Documentation API | springdoc-openapi (Swagger UI) |
| Conteneurisation | Docker Compose de production (images publiées, pas de build local) — nginx inner sert le frontend et relaie les appels API au backend, voir [`docs/deployment.md`](docs/deployment.md) |

---

## Développement local (recommandé au quotidien)

Le `docker-compose.yml` à la racine est un **Compose de production** : il ne contient aucun `build:`,
uniquement des images déjà publiées sur Docker Hub par la CI (voir
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)). Pour développer, lancer le backend et le
frontend directement en local (rechargement à chaud, bien plus rapide qu'un conteneur reconstruit à
chaque changement) pendant que Docker ne fournit que la base de données :

```bash
docker compose up -d postgres        # seule la base tourne en Docker (ports liés à 127.0.0.1)

cd backend
cp .env.example .env                 # adapter DB_HOST/DB_PORT si besoin
./mvnw spring-boot:run

cd ../frontend
npm install
npm start                            # proxy vers http://localhost:8080 par défaut (proxy.conf.js)
```

Frontend sur http://localhost:4200, backend (API + Swagger UI sur `/swagger-ui.html`) sur
http://localhost:8080.

### Tests backend

```bash
cd backend
./mvnw test
```

Nécessite une instance PostgreSQL accessible (voir `backend/.env`) — `docker compose up -d
postgres` suffit.

### Tests frontend

```bash
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless
```

---

## Stack complète (production, ou test local de l'image de prod)

```bash
cp .env.example .env
# renseigner DOCKERHUB_USERNAME + toutes les valeurs (voir .env.example) ; COOKIE_SECURE=true,
# FRONTEND_URL en HTTPS réel pour une vraie mise en production.
docker compose pull    # récupère les images publiées par la CI
docker compose up -d
```

Sans image déjà publiée sur Docker Hub (ex. avant le premier run de la CI, ou pour tester la stack
de production localement sans dépendre d'un registre), construire et tagger les images soi-même
avant `docker compose up -d` — `docker compose pull` échouera sinon :

```bash
docker build -t $DOCKERHUB_USERNAME/erp-rh-backend:$BACKEND_IMAGE_TAG ./backend
docker build -t $DOCKERHUB_USERNAME/erp-rh-frontend:$FRONTEND_IMAGE_TAG ./frontend
docker compose up -d
```

Tous les ports publiés sont liés à `127.0.0.1` (jamais exposés directement à Internet, voir
`conventions/security.md`) — accès via `http://localhost:${FRONTEND_PORT}`. Architecture complète
(nginx inner/outer, réseaux, backup) : voir [`docs/deployment.md`](docs/deployment.md).

Arrêter la stack :

```bash
docker compose down          # conserve les données
docker compose down -v       # supprime aussi les données PostgreSQL
```

---

## Structure du dépôt

```
backend/      API Spring Boot (staport.rh.<domaine> : auth, chantier, employee, function, paie)
frontend/     Application Angular (PrimeNG), nginx.conf (nginx inner de production)
conventions/  Conventions du projet — source de vérité, génériques et réutilisables entre projets
docs/         Documentation fonctionnelle par domaine métier + RBAC + déploiement (propres à ce projet)
.github/workflows/  CI (tests + build + publication des images Docker)
docker-compose.yml  Stack de production (images publiées uniquement, voir docs/deployment.md)
backend/Dockerfile, frontend/Dockerfile
CLAUDE.md     Point d'entrée du projet et ordre de lecture des conventions
TODO.md       Suivi des sujets d'architecture transverse et décisions différées
```

Documentation par domaine :

- [docs/function/README.md](docs/function/README.md) — référentiel des fonctions
- [docs/chantier/README.md](docs/chantier/README.md) — référentiel des chantiers, synchronisation ERP
- [docs/employee/README.md](docs/employee/README.md) — fiches employés
- [docs/paie/README.md](docs/paie/README.md) — bulletins de paie
- [docs/rbac/](docs/rbac) — permissions requises par endpoint, par domaine
- [docs/deployment.md](docs/deployment.md) — architecture de déploiement réelle (nginx inner/outer, CI, backup)

---

## Configuration

Toute valeur dépendant de l'environnement (URL, port, identifiants) est lue via une variable
d'environnement **sans valeur par défaut dans le code** — l'application refuse de démarrer si une
variable requise est absente (`conventions/configuration.md`). Deux fichiers d'exemple documentent
les variables attendues :

- [`.env.example`](.env.example) (racine) — variables du Compose de production (Postgres, ports,
  images Docker Hub, JWT/RBAC, SMTP).
- [`backend/.env.example`](backend/.env.example) — variables backend pour un lancement local hors
  Docker (connexion base, endpoint ERP).

Copier chacun en `.env` (jamais commité, voir `.gitignore`) et renseigner de vraies valeurs.

---

## Authentification et rôles

Authentification par JWT (Access Token + Refresh Token, voir `conventions/security.md`) avec RBAC
dynamique : rôles et permissions administrables via l'UI (`/admin/roles`, `/admin/users`), deny
overrides individuels. Catalogue permission ↔ endpoint par domaine : `docs/rbac/`.

Au premier démarrage, un compte `SYSTEM_ADMIN` est créé automatiquement depuis
`ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` (voir `.env.example`) — à utiliser pour se connecter
la première fois, puis changer le mot de passe via l'UI.

## État du projet

- Aucun audit (Hibernate Envers) n'est encore en place. Voir [TODO.md](TODO.md), section « Audit ».
- Domaine Pointage non construit ; calcul automatique de la paie depuis le pointage prévu en
  roadmap. Voir [TODO.md](TODO.md).

L'architecture de déploiement (Docker Compose de production, nginx inner/outer, CI) est en place —
voir [`docs/deployment.md`](docs/deployment.md). Le backup PostgreSQL reste à implémenter avant une
vraie mise en production (voir ce même document et [TODO.md](TODO.md)).
