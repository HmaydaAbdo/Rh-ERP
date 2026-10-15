# Contrôle déploiement — 2026-10-12

## Résultat du contrôle local

Le périmètre reproductible dans le dépôt est **conforme localement**. Les quatre images de la pile
ont été construites depuis leur Dockerfile et le Compose a été validé. Les actions qui exigent
l'hôte de production sont exclues de ce statut et restent dans la section **Travail côté serveur**
de [`TODO.md`](../../TODO.md).

| Vérification | Preuve exécutée | Résultat |
|---|---|---|
| Image PostgreSQL | `docker build --pull -t erp-rh-postgres:deployment-control -f database/Dockerfile database` | Image construite avec PostgreSQL 18 et pgAudit épinglé sur la version `18.0` |
| Extensions PostgreSQL | Conteneur jetable sans volume : `SELECT version()`, `CREATE EXTENSION vector`, `CREATE EXTENSION pgaudit`, requête auditée | PostgreSQL 18.6, pgvector 0.8.7 et pgAudit 18.0 chargés ; événement `AUDIT: SESSION` trouvé dans les journaux ; conteneur supprimé |
| Image backend | `docker build --pull -t erp-rh-backend:deployment-control ./backend` | Build Maven de l'image réussi |
| Image frontend | `docker build --pull -t erp-rh-frontend:deployment-control ./frontend` | `npm ci` (462 paquets, aucune vulnérabilité signalée) et `ng build --configuration production` réussis dans l'image avec Node 24.15 |
| Image de sauvegarde | `docker build --pull -t erp-rh-backup:deployment-control ./backup` | Image construite |
| Compose | `docker compose --env-file .env.example config --quiet` | Configuration valide avec les variables d'exemple |
| Refus d'un tag absent | Compose exécuté avec `POSTGRES_IMAGE_TAG` vide | Échec attendu et explicite : `POSTGRES_IMAGE_TAG immuable est obligatoire` |
| Santé, réseau et exposition | Inspection de `docker-compose.yml` | Healthchecks PostgreSQL/backend/frontend/sauvegarde ; base sur `db-net`, frontend sur `web-net`, ports publiés sur `127.0.0.1` |
| Utilisateurs d'exécution | `docker image inspect` sur backend, frontend et sauvegarde | `appuser`, UID `101` et `postgres` respectivement ; processus non-root |
| Tags | `.env.example`, Compose et documentation de déploiement | Les quatre images exigent un tag SHA explicite commun ; pas de repli implicite `latest` |
| Intégrité du patch | `git diff --check` | Réussi |

Le Dockerfile frontend utilisait Node 26.10 alors que `frontend/package.json` impose Node `^24.15.0`.
Il est maintenant aligné sur Node 24.15 et son empreinte vérifiée ; le build de production passe.
Le service planifié de sauvegarde possède aussi un healthcheck qui vérifie l'accès PostgreSQL et
l'écriture dans son répertoire de sauvegarde.

Les validations de santé de la pile complète, de nginx inner et du comportement HTTP ont déjà été
exécutées lors du contrôle consigné dans [`controle-2026-10-11.md`](controle-2026-10-11.md).

## Travail côté serveur exclu du statut local

Les points suivants nécessitent les accès ou l'environnement de production ; ils restent suivis dans
[`TODO.md`](../../TODO.md) :

- revue de la configuration Nginx outer existante et de ses en-têtes/TLS ;
- choix et validation de l'automatisation CD sur l'hôte ;
- vérifications post-bascule PostgreSQL 18 : rapprochement des données restaurées, conservation du
  volume PG17 et événements pgAudit dans les journaux ;
- copie des sauvegardes hors hôte, différée par décision du propriétaire.

Ce rapport décrit le contrôle local du 2026-10-12. La migration PG17→PG18 a ensuite été effectuée le
2026-10-14 ; le suivi des vérifications post-bascule reste dans `TODO.md`.
