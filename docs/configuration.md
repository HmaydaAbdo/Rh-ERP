# Configuration et démarrage

> Catalogue de **toutes** les variables d'environnement du projet et procédure de lancement. Règle
> (`conventions/configuration.md`) : toute valeur qui dépend de l'environnement est lue dans une variable
> d'environnement **sans valeur par défaut dans le code** ; l'application **refuse de démarrer** si une variable
> requise est absente.

---

## Fichiers de configuration

| Fichier | Rôle |
|---|---|
| `backend/src/main/resources/application.yml` | Configuration unique du backend ; ne contient que des références `${VARIABLE}` et des réglages non sensibles |
| `backend/.env.example` → `backend/.env` | Variables du backend pour un lancement **local hors Docker** (chargées par `springboot4-dotenv`) |
| `.env.example` → `.env` (racine) | Variables du Compose de **production** (base, ports, images, secrets) |

Les fichiers `.env` ne sont **jamais** commités (`.gitignore`). Copier l'exemple et renseigner de vraies valeurs.

---

## Variables du backend

| Variable | Rôle | Exemple (développement) |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Connexion PostgreSQL du compte **applicatif** (l'application, à l'exécution) | `localhost`, `5432`, `staport_rh`, `staport_app` |
| `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD` | Compte **propriétaire** du schéma, utilisé par Flyway seulement. Distinct de `DB_USER` en production : le compte applicatif n'a que `SELECT` et `INSERT` sur les tables d'audit (voir [audit/README.md](audit/README.md)). Identiques en développement et en CI (l'application le signale au démarrage) | `staport` |
| `CHANTIER_SYNC_BASE_URL` | URL de l'ERP qui liste les chantiers | `http://staport.dyndns.org/webServiceBS/getChantiers` |
| `JWT_SECRET` | Secret HMAC (HS256) qui signe les jetons d'accès : **base64, 256 bits minimum** | `openssl rand -base64 32` |
| `FRONTEND_URL` | URL **publique complète** de l'application ; sert à construire le lien du courriel « mot de passe oublié » | `http://localhost:4200`, `https://<domaine>/rh-erp` |
| `COOKIE_SECURE` | `true` pour tout accès HTTPS (production) ; `false` seulement en HTTP direct | `false` en local, `true` en production |
| `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Compte `SYSTEM_ADMIN` créé au premier démarrage s'il n'en existe aucun | |
| `SMTP_HOST`, `SMTP_PORT` | Serveur de courriel | `localhost`, `1025` (Mailpit) |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | Identifiants SMTP (vides si le serveur n'exige pas d'authentification) | |
| `SMTP_AUTH`, `SMTP_STARTTLS` | `true`/`false` | `false` en local |
| `MAIL_FROM` | Adresse expéditrice des courriels | `noreply@staport-rh.local` |
| `LOGGING_FORMAT` | **Facultative** (réglage `logging.format`) : `json` pour des journaux en JSON asynchrones (une ligne par événement), `text` (défaut) pour le format lisible. Le Compose de production la positionne à `json` | `text` en local |
| `SPRINGDOC_API_DOCS_ENABLED`, `SPRINGDOC_SWAGGER_UI_ENABLED` | **Facultatives** : `true` allume la documentation d'API (Swagger UI) — développement seulement. Absentes, elle est éteinte (réglage `springdoc.*` de `application.yml`) ; le Compose de production ne les transmet pas | `true` en local |

Dans le Compose de production, `DB_HOST` vaut `postgres`, `DB_PORT` `5432`, `DB_NAME` vient de `POSTGRES_DB`,
`DB_MIGRATION_USER`/`DB_MIGRATION_PASSWORD` de `POSTGRES_USER`/`POSTGRES_PASSWORD` et `DB_USER`/`DB_PASSWORD` de
`POSTGRES_APP_USER`/`POSTGRES_APP_PASSWORD` (repli de transition : sans elles, le compte propriétaire sert aussi à
l'application). Le compte applicatif est créé tout seul par Flyway s'il n'existe pas.

## Variables du Compose de production (`.env` racine)

| Variable | Rôle |
|---|---|
| `DOCKERHUB_USERNAME` | Compte Docker Hub qui publie les images |
| `BACKEND_IMAGE_TAG`, `FRONTEND_IMAGE_TAG`, `BACKUP_IMAGE_TAG` | Version des images (`latest` par défaut) |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Base PostgreSQL et son compte **propriétaire** (migrations) |
| `POSTGRES_APP_USER`, `POSTGRES_APP_PASSWORD` | Compte **applicatif** du backend (créé par le rappel Flyway `afterMigrate.sql`, mot de passe sans apostrophe) |
| `BACKUP_TIME_UTC`, `BACKUP_RETENTION_DAYS` | Heure quotidienne UTC (`02:00`) et conservation des archives (`30` jours) ; le service de backup utilise le compte propriétaire PostgreSQL pour dumper la base et les rôles |
| `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT` | Ports publiés, **liés à `127.0.0.1`** (jamais exposés à Internet) |
| `CHANTIER_SYNC_BASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `COOKIE_SECURE`, `ADMIN_*`, `SMTP_*`, `MAIL_FROM` | Transmises telles quelles au backend |

Variable du frontend (développement) : `BACKEND_URL` (défaut `http://localhost:8080`), lue par
`frontend/proxy.conf.js`.

## Réglages fixes de `application.yml`

| Réglage | Valeur | Remarque |
|---|---|---|
| `spring.jpa.hibernate.ddl-auto` | `validate` | Le schéma n'est géré que par Flyway |
| `spring.jpa.show-sql` | `false` | Aucune requête SQL dans les logs (bruit et coût en production) ; le développement les allume avec `SPRING_JPA_SHOW_SQL=true` |
| `spring.jpa.open-in-view` | `false` | Pas de session JPA ouverte pendant le rendu de la réponse (`conventions/jpa.md`) : une association paresseuse se charge dans la transaction du service |
| `springdoc.api-docs.enabled`, `springdoc.swagger-ui.enabled` | `false` | Documentation d'API éteinte par défaut, donc en production (voir `SPRINGDOC_*` plus haut) |
| `spring.servlet.multipart.max-file-size` | `20MB` | Taille maximale d'un fichier d'import |
| `spring.data.web.pageable.max-page-size` | `200` | Plafond du paramètre de taille de page |
| `spring.jpa.properties.org.hibernate.envers.*` | `audit_table_suffix=_aud`, `revision_field_name=rev`, `revision_type_field_name=revtype`, `store_data_at_delete=true` | Instantanés d'audit (stratégie par défaut : insertions seulement) — voir [audit/README.md](audit/README.md) |
| `spring.jpa.properties.hibernate.jdbc.batch_size`, `order_inserts`, `order_updates` | `50`, `true`, `true` | Écritures regroupées : un import ou une suppression de 1 000 lignes écrit autant de lignes d'audit en quelques requêtes |
| `server.forward-headers-strategy` | `native` | L'adresse IP enregistrée par l'audit est celle du client réel (`X-Forwarded-For` posé par nginx, honoré des proxys internes) |
| `spring.flyway.user` / `password` / `placeholders` | `DB_MIGRATION_*` ; `app_user`, `app_password` ← `DB_USER`, `DB_PASSWORD` | Flyway s'exécute avec le propriétaire ; `afterMigrate.sql` reçoit le compte applicatif à créer et à restreindre |
| `management.health.mail.enabled` | `false` | Une panne SMTP ne doit pas faire passer l'application en `DOWN` |

Les valeurs métier réglables (durées des jetons, mot de passe, analytique de paie et planification de la synchronisation)
sont gérées dans la table `parametre` et dans l'écran Paramètres ; voir [docs/parametre/README.md](parametre/README.md).

---

## Secrets

- Jamais de secret dans le dépôt, ni dans une image, ni dans un log.
- `JWT_SECRET` : un secret **différent par environnement** ; le changer **invalide tous les jetons d'accès**
  en cours (les utilisateurs rafraîchissent alors leur session).
- Les mots de passe d'exemple (`change-me…`) ne doivent jamais servir en production.
- Les secrets de CI (`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`) sont des secrets GitHub Actions.

---

## Lancer le projet

### Développement (recommandé)

```bash
docker compose up -d postgres        # seule la base tourne en Docker

cd backend
cp .env.example .env                 # adapter DB_* si besoin
./mvnw spring-boot:run               # API ; Swagger UI sur http://localhost:8080/swagger-ui.html (si activé dans .env)

cd ../frontend
npm install
npm start                            # http://localhost:4200
```

Au premier démarrage, Flyway crée le schéma (V1 → V10) et le compte administrateur est créé depuis `ADMIN_*`.
Pour tester le courriel « mot de passe oublié » en local, lancer un serveur SMTP de test (par exemple Mailpit sur
le port 1025, valeur par défaut de `backend/.env.example`).

### Pile complète (production ou test de l'image de production)

Voir [deployment.md](deployment.md) : `docker compose --profile backup pull && docker compose --profile backup up -d`.

### Tests

Voir [testing.md](testing.md).

---

## Ajouter une variable

1. La lire dans `application.yml` par `${NOM}` **sans valeur par défaut**.
2. L'ajouter à `backend/.env.example` et, si elle est utilisée en production, à `.env.example`, à
   `docker-compose.yml` et aux variables de la CI (`.github/workflows/ci.yml`).
3. L'ajouter à ce document.
