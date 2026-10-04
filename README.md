# rh-erp

Système de gestion du personnel, pointage et paie de **Staport**, une entreprise du BTP (bâtiment
et travaux publics).

Domaines métier en place : **Fonction** (référentiel des fonctions), **Chantier** (référentiel, chantiers
manquants ajoutés depuis l'ERP existant), **Équipe** (référentiel des équipes), **Employé** (fiche d'identité,
affectation fonction/chantier), **Paie** (bulletins mensuels, export Excel, rapport PDF de synthèse) et **Auth**
(comptes, rôles, permissions). Le domaine **Pointage** reste à construire (voir [TODO.md](TODO.md)).

> **Documentation** : tout est indexé dans [`docs/README.md`](docs/README.md). Les conventions de
> développement, génériques et réutilisables, sont dans [`conventions/`](conventions) et font foi pour toute
> contribution — voir [CLAUDE.md](CLAUDE.md) pour l'ordre de lecture recommandé.

---

## Stack technique

| Composant | Techno |
|---|---|
| Backend | Java 21, Spring Boot 4.1.1, Spring Data JPA/Hibernate, Spring Security (JWT), MapStruct |
| Base de données | PostgreSQL 17 (extension [pgvector](https://github.com/pgvector/pgvector), activée en anticipation d'un usage futur — voir `conventions/deployment.md`) |
| Migrations | [Flyway](https://flywaydb.org/) — voir `conventions/database.md` et [`docs/data-model.md`](docs/data-model.md) |
| Frontend | Angular 17, [PrimeNG](https://primeng.org/) |
| Imports / exports | Apache POI (Excel), jsoup + openhtmltopdf + Batik (rapport PDF) |
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

Frontend sur http://localhost:4200, backend (API ; Swagger UI sur `/swagger-ui.html` si activé, voir
`backend/.env.example`) sur http://localhost:8080. Toutes les variables d'environnement sont décrites dans
[`docs/configuration.md`](docs/configuration.md).

### Tests

```bash
cd backend && ./mvnw test                                           # nécessite PostgreSQL (docker compose up -d postgres)
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless  # tests frontend
cd frontend && npx ng build --configuration production              # le bundle de production compile
```

Détail de ce qui est testé : [`docs/testing.md`](docs/testing.md).

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
backend/      API Spring Boot (staport.rh.<domaine> : auth, chantier, employee, equipe, function, paie, common)
frontend/     Application Angular (PrimeNG), nginx.conf (nginx inner de production)
conventions/  Conventions du projet — source de vérité, génériques et réutilisables entre projets
docs/         Documentation propre à ce projet : architecture, modèle de données, domaines, RBAC, déploiement
.github/workflows/  CI (tests + build + publication des images Docker)
docker-compose.yml  Stack de production (images publiées uniquement, voir docs/deployment.md)
backend/Dockerfile, frontend/Dockerfile
CLAUDE.md, AGENTS.md  Point d'entrée du projet et ordre de lecture des conventions (contenu identique)
TODO.md       Sujets ouverts et décisions différées
```

---

## Documentation

Index complet et glossaire : [`docs/README.md`](docs/README.md).

| Sujet | Document |
|---|---|
| Vue d'ensemble, dépendances entre domaines, flux d'une requête | [`docs/architecture.md`](docs/architecture.md) |
| Schéma de base, contraintes, migrations | [`docs/data-model.md`](docs/data-model.md) |
| Variables d'environnement et démarrage | [`docs/configuration.md`](docs/configuration.md) |
| Imports Excel (règles communes) | [`docs/imports.md`](docs/imports.md) |
| Authentification, comptes, rôles | [`docs/auth/README.md`](docs/auth/README.md) |
| Permissions par endpoint et par écran | [`docs/rbac/README.md`](docs/rbac/README.md) |
| Interface (routes, guards, composants, tableaux) | [`docs/frontend/README.md`](docs/frontend/README.md) |
| Tests | [`docs/testing.md`](docs/testing.md) |
| Déploiement (Docker, nginx, CI, backup) | [`docs/deployment.md`](docs/deployment.md) |

Par domaine : [fonctions](docs/function/README.md) · [chantiers](docs/chantier/README.md) ·
[équipes](docs/equipe/README.md) · [employés](docs/employee/README.md) · [paie](docs/paie/README.md) ·
[export Excel et rapport PDF](docs/report/README.md).

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

Copier chacun en `.env` (jamais commité, voir `.gitignore`) et renseigner de vraies valeurs. Catalogue
complet : [`docs/configuration.md`](docs/configuration.md).

---

## Authentification et rôles

Authentification par JWT (jeton d'accès de 15 minutes en mémoire, jeton de rafraîchissement de 30 jours en
cookie `httpOnly`, rotation à usage unique avec révocation de toute la session en cas de réutilisation) avec
RBAC dynamique : 24 permissions fixes, rôles administrables via l'UI (`/admin/roles`, `/admin/users`), refus
individuels prioritaires sur les rôles. Chaque écran et chaque bouton d'action est conditionné par une
permission. Détail : [`docs/auth/README.md`](docs/auth/README.md) et [`docs/rbac/README.md`](docs/rbac/README.md).

Au premier démarrage, un compte `SYSTEM_ADMIN` est créé automatiquement depuis
`ADMIN_USERNAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` (voir `.env.example`) — à utiliser pour se connecter
la première fois, puis changer le mot de passe via l'UI.

## Règles de fonctionnement à connaître

- Les fichiers Excel **ajoutent** des données (fonctions, employés, bulletins) ; ils ne modifient jamais
  l'existant. Toute modification se fait depuis l'interface. Import atomique : une ligne invalide rejette tout le
  fichier ([`docs/imports.md`](docs/imports.md)).
- La synchronisation des chantiers avec l'ERP **ajoute** les chantiers manquants, sans rien modifier.
- La paie **n'est pas calculée** : le total est saisi ou importé tel quel.

## État du projet

- L'audit (Hibernate Envers + journal unique + événements de sécurité) est en place : voir [docs/audit/README.md](docs/audit/README.md). Les options non retenues (restauration d'un groupe supprimé, conservation, journal des consultations) sont dans [TODO.md](TODO.md).
- Domaine Pointage non construit. Voir [TODO.md](TODO.md).
- Prochaine tâche : qualité des données (tous champs obligatoires, aucun doublon). Voir [TODO.md](TODO.md).

L'architecture de déploiement (Docker Compose de production, nginx inner/outer, CI) est en place —
voir [`docs/deployment.md`](docs/deployment.md). Le backup PostgreSQL reste à implémenter avant une
vraie mise en production (voir ce même document et [TODO.md](TODO.md)).
