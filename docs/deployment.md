# Déploiement — architecture réelle de rh-erp

> Ce document décrit l'architecture de déploiement **concrète** de ce projet. Pour le pattern
> générique réutilisable (Docker Compose + Flyway, sans détail propre à rh-erp), voir
> `conventions/deployment.md`. Pour les conventions de sécurité (JWT/RBAC, secrets), voir
> `conventions/security.md`.

---

## Architecture

```
Internet
   │
   ▼
NGINX OUTER (hors de ce dépôt — géré sur le serveur, partagé avec d'autres applications)
   │  proxy_pass + sub_filter (base href), 127.0.0.1:${FRONTEND_PORT}
   ▼
NGINX INNER (conteneur "frontend", voir frontend/nginx.conf)
   │
   ├── fichiers statiques Angular (dist/frontend/browser) — servis directement
   │
   └── proxy_pass interne, réseau Docker "web-net" ──▶ BACKEND (Spring Boot, conteneur "backend")
                                                              │
                                                              ▼
                                                    POSTGRESQL 18 + pgvector
                                                    (réseau Docker "db-net")
```

Nginx **outer** est le seul point d'entrée public, TLS terminé là. Il ne parle qu'à nginx **inner**
(le conteneur `frontend`) — c'est nginx inner qui décide, en interne, si une requête sert un
fichier statique Angular ou doit être relayée au backend (voir `frontend/nginx.conf` : les
préfixes `/employees`, `/chantiers`, `/functions`, `/equipes`, `/paie` sont ambigus — à la fois une route
Angular et un préfixe d'API — et sont désambiguïsés par l'en-tête `Accept`, comme le fait déjà
`frontend/proxy.conf.js` en développement).

Le backend n'est **jamais** exposé à Internet, même indirectement : nginx inner l'atteint
uniquement via le nom de service Docker `backend` sur le réseau interne `web-net`. PostgreSQL n'est
joignable que par le backend, sur le réseau `db-net` — le frontend ne peut pas l'atteindre, même en
cas de compromission du conteneur.

Tous les ports publiés par `docker-compose.yml` (`POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`)
sont liés à `127.0.0.1` — accessibles uniquement depuis le serveur lui-même (nginx outer, ou un
accès SSH direct pour l'administration/le backup), jamais depuis l'extérieur.

---

## Intégration à nginx outer

Nginx outer est géré séparément (partagé avec d'autres applications sur le même serveur) — l'ajout
du bloc ci-dessous reste une action manuelle sur le serveur, pas automatisée par ce dépôt. Pattern
repris de celui déjà utilisé pour les autres applications du serveur (sous-chemin dédié +
`sub_filter` pour réécrire `<base href>`), simplifié à un seul bloc puisque nginx inner gère déjà
lui-même la distinction page Angular / appel API :

```nginx
# Redirige /rh-erp (sans slash final) vers /rh-erp/ — nécessaire pour que le location ci-dessous
# matche, et construit l'URL absolue explicitement via $http_host (jamais $host, qui tronque le
# port) pour rester correct derrière un NAT/port-forward où le port externe diffère du port sur
# lequel nginx outer écoute réellement (ex. box/routeur qui redirige :650 vers :80 en interne).
location = /rh-erp {
    return 301 $scheme://$http_host/rh-erp/;
}

location /rh-erp/ {
    proxy_pass http://127.0.0.1:${FRONTEND_PORT}/;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Sans ça, sub_filter ne peut pas réécrire un corps que nginx inner a compressé (gzip) —
    # sub_filter n'opère que sur du texte brut.
    proxy_set_header Accept-Encoding "";

    # OBLIGATOIRE sous un sous-chemin : le backend pose le cookie du jeton de rafraîchissement avec
    # Path=/auth, or le navigateur appelle /rh-erp/auth/refresh. Sans cette réécriture, le cookie n'est
    # jamais renvoyé et l'utilisateur doit se reconnecter à chaque rechargement de page.
    proxy_cookie_path /auth /rh-erp/auth;

    sub_filter '<base href="/">' '<base href="/rh-erp/">';
    sub_filter_once on;
}
```

Si le sous-chemin change, adapter aussi `proxy_cookie_path`. `COOKIE_SECURE=true` exige un accès HTTPS : en HTTP
le navigateur rejette le cookie.

Remplacer `${FRONTEND_PORT}` par la valeur réelle configurée dans `.env` sur le serveur, et
`/rh-erp/` par le sous-chemin réellement choisi.

`FRONTEND_URL` (dans `.env`) n'est **plus** utilisé pour CORS (voir plus bas) — uniquement pour
construire le lien de réinitialisation de mot de passe envoyé par email (`EmailService`). Il doit
donc correspondre à l'URL publique complète résultante (ex. `https://<domaine>/rh-erp`) pour que ce
lien soit valide, même si ça n'a plus d'incidence sur les appels API.

### CORS

**Décision (HMAYDA, 2026-09-23)** : CORS ouvert à toute origine
(`SecurityConfig.corsConfigurationSource`, `allowedOriginPatterns("*")`), plutôt que restreint à
`FRONTEND_URL` comme auparavant. Risque accepté en connaissance de cause : `/auth/refresh` et
`/auth/logout` restent les seuls endpoints lus depuis un cookie (Refresh Token), mais ce cookie est
`SameSite=Lax` (voir `AuthController`), ce qui empêche déjà son envoi sur une requête cross-origin
déclenchée par du JavaScript tiers — le risque résiduel d'ouvrir le CORS en plus de ça est donc
limité en pratique.

---

## Démarrage

```bash
cp .env.example .env   # une seule fois, puis renseigner de vraies valeurs (voir .env.example)
docker compose pull    # récupère les images publiées par la CI (voir .github/workflows/ci.yml)
docker compose up -d
```

### Deux comptes PostgreSQL

Le backend se connecte avec un **compte applicatif** (`POSTGRES_APP_USER`) qui n'a que `SELECT` et `INSERT` sur les tables
d'audit ; le **propriétaire** (`POSTGRES_USER`) ne sert qu'à Flyway. Au démarrage, Flyway crée le compte applicatif s'il
n'existe pas et recalcule ses droits (`afterMigrate.sql`) : **aucune étape manuelle**.

- **Bascule** : ajouter `POSTGRES_APP_USER` et `POSTGRES_APP_PASSWORD` dans `.env` (voir `.env.example`), puis
  `docker compose pull && docker compose up -d`. Vérifier dans les logs du backend : « Intégrité de l'audit : le compte
  applicatif ne peut pas modifier les tables d'audit ». À essayer d'abord sur une copie de la base.
- **Retour arrière** : retirer ces deux variables ; le compte propriétaire sert de nouveau à tout (l'application signale
  alors, au démarrage, que l'intégrité de l'audit n'est pas garantie).
- **Restauration d'une sauvegarde** : l'audit est dans la même base ; il revient au même instant que les données. À noter
  dans le registre d'exploitation (voir [audit/README.md](audit/README.md)).
- **Adresse IP** : l'audit enregistre l'adresse du client réel. Le bloc nginx outer ci-dessus pose `X-Forwarded-For`
  (`$proxy_add_x_forwarded_for`), nginx inner le relaie, et Tomcat l'honore des seuls proxys internes
  (`server.forward-headers-strategy: native`) : un client ne peut pas usurper l'adresse enregistrée.

Aucun `build:` dans `docker-compose.yml` — uniquement des `image:` déjà publiées sur Docker Hub.
Pour re-déployer une nouvelle version : `docker compose pull && docker compose up -d` (met à jour
les conteneurs dont l'image a changé, sans toucher au volume `postgres_data_v18`). Sur la machine de
développement, la migration logique de PG17 vers PG18 a été répétée et contrôlée le 2026-10-10 ;
l'ancien volume `erp-rh_postgres_data` reste conservé. **Cette validation locale ne migre pas la
production. Ne déploie pas le Compose PG18 en production avant d'avoir exécuté la procédure ci-dessous** :
le nom de volume a changé, donc le nouveau conteneur utiliserait un volume vide si aucune restauration
n'y était faite. Ne jamais lancer `docker compose down -v`.

### Migration majeure PG17 → PG18 en production

La migration se fait par export/restauration logique : un volume PostgreSQL 17 ne peut pas être
réutilisé directement par PostgreSQL 18. Prévoir une fenêtre de maintenance et garder les écritures
suspendues jusqu'à la décision de réouverture.

1. **Inventorier la production** : relever le projet Compose, les noms exacts des conteneurs et des
   volumes, la version du serveur, celle de pgvector, la dernière migration Flyway et les nombres de
   lignes des tables métier. Les noms de volumes dépendent du nom de projet Compose : ne pas supposer
   que celui de la machine de développement s'applique.
2. **Sauvegarder PG17 hors du volume** : réaliser un dump logique complet incluant les rôles et bases,
   le transférer vers un stockage distinct du serveur et vérifier son empreinte. Conserver aussi une
   sauvegarde restaurable selon la procédure d'exploitation. Le volume seul n'est pas une sauvegarde.
3. **Répéter avant la fenêtre** : restaurer cette sauvegarde dans un PostgreSQL 18 isolé avec pgvector,
   puis vérifier les extensions, les rôles, Flyway, les nombres de lignes et le démarrage de l'application.
   Ne pas exposer les mots de passe de production dans les commandes, le shell partagé ou les journaux.
4. **Arrêter les écritures** : activer la maintenance, arrêter les services backend et tout autre client
   qui écrit en base, puis produire le dump final PG17. Garder le conteneur PG17 et son volume présents.
5. **Restaurer dans le nouveau volume PG18** : démarrer un conteneur PG18 temporaire sur un port local
   différent, monté sur le volume cible `postgres_data_v18` et initialisé avec un compte de migration
   distinct des rôles exportés. Restaurer le dump logique (rôles, droits, extensions et bases), puis
   contrôler que la dernière migration Flyway est `V15`, que les tables attendues et leurs données sont
   présentes, et que pgvector est disponible. Garder backend et trafic public arrêtés.
6. **Basculer Compose** : arrêter proprement le conteneur temporaire PG18, puis lancer le service
   `postgres` du Compose publié avec l'image PG18. Vérifier qu'il remonte le même volume cible et qu'il
   devient `healthy`. Démarrer backend seul, vérifier les logs, l'Actuator, l'authentification et les
   permissions ; démarrer le frontend et retirer la maintenance seulement après validation.
7. **Retour arrière** : avant la réouverture, en cas d'échec, arrêter PG18 et remettre l'ancien Compose
   PG17 avec son volume d'origine. Le volume PG17 n'est jamais supprimé. Après réouverture et nouvelles
   écritures sur PG18, un simple retour à PG17 perdrait ces écritures : il faut d'abord les réconcilier
   par une migration inverse contrôlée. Conserver les deux volumes jusqu'à validation métier et
   sauvegarde PG18 restaurable.

État au 2026-10-10 : migration locale PG17→PG18 vérifiée (PostgreSQL 18.6, pgvector 0.8.7, Flyway V15,
28 tables ; nombres de lignes identiques), tests backend propres passés sur PG18. **Migration du serveur
de production à planifier/exécuter séparément**.

---

## CI/CD — état actuel

**CI en place** (`.github/workflows/ci.yml`) : à chaque push sur `main`, tests backend (contre un
PostgreSQL de service GitHub Actions) et frontend, puis build + push des images vers Docker Hub
(tags `<git-sha>` et `latest`, plus le tag de version sur un push de tag `v*`). Sur une pull
request, seuls les tests tournent (pas de push d'image, pas d'exposition des secrets Docker Hub à
une PR).

**CD non traité** — le déploiement (`docker compose pull && up -d` sur le serveur) reste manuel
pour l'instant. À prévoir séparément (ex. déclenchement SSH depuis la CI, ou `watchtower`/
webhook côté serveur) une fois le besoin confirmé.

Secrets CI requis (variables secrètes GitHub Actions, jamais dans le dépôt) :
`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (token d'accès Docker Hub, pas le mot de passe du compte).

---

## Backup PostgreSQL — préparé, pas encore implémenté

Le volume Docker `postgres_data` assure la persistance des données face à un redémarrage/une
recréation de conteneur — **ce n'est pas un backup** : il ne protège pas contre une suppression du
volume, une corruption, ou une erreur humaine (ex. `DELETE` sans `WHERE`). Un vrai backup, distinct
du volume et stockable hors du serveur, reste à implémenter.

### Approche prévue

Un service dédié, séparé de `postgres`/`backend`/`frontend` (pour ne pas complexifier le Compose de
production tant que le besoin réel — fréquence, rétention, destination — n'est pas confirmé) :

- `pg_dump` planifié (fréquence configurable, ex. variable d'environnement `BACKUP_CRON`).
- Rétention configurable (`BACKUP_RETENTION_DAYS`) — purge des dumps plus anciens que N jours.
- Upload vers un stockage externe compatible S3 (`BACKUP_S3_BUCKET`, `BACKUP_S3_ENDPOINT`,
  identifiants dédiés — jamais les identifiants PostgreSQL eux-mêmes) — ou tout autre emplacement
  hors serveur selon l'infrastructure réellement disponible.
- Options déjà évaluées : un conteneur dédié tout-en-un (ex. `prodrigestivill/postgres-backup-local`
  couplé à un `rclone` pour l'upload distant), ou un script `pg_dump` + upload exécuté par un cron
  externe au Compose (sur le serveur, ou une Action GitHub planifiée avec accès réseau au serveur).
  Choix à trancher au moment de l'implémentation, selon l'infrastructure de stockage externe
  réellement disponible (aucune n'est encore choisie).

### Ce qui reste à décider avant implémentation

- Fréquence et rétention réelles souhaitées.
- Destination du stockage externe (S3, autre serveur, service tiers...).
- Qui déclenche la restauration en cas d'incident, et comment (procédure à documenter ici une fois
  le backup en place).

Voir `TODO.md` pour le suivi.
