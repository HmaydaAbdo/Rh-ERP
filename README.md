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
| Conteneurisation | Docker Compose (PostgreSQL + backend + frontend) |

---

## Démarrer le projet (Docker Compose — recommandé)

Prérequis : Docker et Docker Compose.

```bash
cp .env.example .env
# éditer .env si besoin (identifiants Postgres, ports, endpoint ERP)
docker compose up -d --build
```

| Service | URL par défaut |
|---|---|
| Frontend (Angular) | http://localhost:4200 |
| Backend (API + Swagger UI) | http://localhost:8080 — Swagger UI sur `/swagger-ui.html` |
| PostgreSQL | `localhost:5432` |

Au démarrage, le backend applique automatiquement les migrations Flyway (aucune action manuelle
requise). Les données PostgreSQL persistent entre redémarrages (volume Docker nommé).

Arrêter la stack :

```bash
docker compose down          # conserve les données
docker compose down -v       # supprime aussi les données PostgreSQL
```

Détail complet des services, variables d'environnement et du workflow de migration : voir
[`conventions/deployment.md`](conventions/deployment.md).

---

## Développement local (hors Docker)

Utile pour itérer rapidement sur le backend ou le frontend sans reconstruire d'image à chaque
changement — voir `conventions/deployment.md`, section « Développement backend actif ».

```bash
docker compose up -d postgres        # seule la base tourne en Docker

cd backend
cp .env.example .env                 # adapter DB_HOST/DB_PORT si besoin
./mvnw spring-boot:run

cd ../frontend
npm install
npm start                            # proxy vers http://localhost:8080 par défaut
```

### Tests backend

```bash
cd backend
./mvnw test
```

Nécessite une instance PostgreSQL accessible (voir `backend/.env`) — `docker compose up -d
postgres` suffit.

---

## Structure du dépôt

```
backend/      API Spring Boot (staport.rh.<domaine> : chantier, employee, function, paie)
frontend/     Application Angular (PrimeNG)
conventions/  Conventions du projet — source de vérité (architecture, sécurité, base de données…)
docs/         Documentation fonctionnelle par domaine métier
docker-compose.yml, backend/Dockerfile, frontend/Dockerfile
CLAUDE.md     Point d'entrée du projet et ordre de lecture des conventions
TODO.md       Suivi des sujets d'architecture transverse et décisions différées
```

Documentation par domaine :

- [docs/function/README.md](docs/function/README.md) — référentiel des fonctions
- [docs/chantier/README.md](docs/chantier/README.md) — référentiel des chantiers, synchronisation ERP
- [docs/employee/README.md](docs/employee/README.md) — fiches employés
- [docs/paie/README.md](docs/paie/README.md) — bulletins de paie

---

## Configuration

Toute valeur dépendant de l'environnement (URL, port, identifiants) est lue via une variable
d'environnement **sans valeur par défaut dans le code** — l'application refuse de démarrer si une
variable requise est absente (`conventions/configuration.md`). Deux fichiers d'exemple documentent
les variables attendues :

- [`.env.example`](.env.example) (racine) — variables Docker Compose (Postgres, ports).
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

Ce projet n'a pas vocation à être déployé en production dans son état actuel — voir les sections
correspondantes de `conventions/security.md` et [TODO.md](TODO.md) avant toute mise en production.
