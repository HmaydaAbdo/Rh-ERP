# Déploiement — architecture réelle de rh-erp

## Journaux et répertoires locaux

Le backend émet ses journaux sur la sortie console (consultables en temps réel avec
`docker compose logs --follow backend`) et écrit les archives quotidiennes compressées dans
`./logs/`, à côté de `docker-compose.yml`. Les archives utilisent UTC et sont conservées 30 jours.
Le dossier est monté depuis l'hôte et exclu de Git. Avant le premier démarrage sur un hôte Linux,
le créer avec des droits d'écriture pour l'UID/GID 10001 du conteneur, par exemple :

```sh
install -d -o 10001 -g 10001 -m 0750 logs
install -d -o 70 -g 70 -m 0700 backups
```

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

Nginx outer existe déjà sur le serveur et est géré séparément (partagé avec d'autres applications).
Avant de recommander ou modifier un bloc pour rh-erp, comparer l'exemple de configuration fourni
par l'exploitant avec le pattern ci-dessous. Les informations à fournir sont suivies dans
[`deployment-informations-a-fournir.md`](deployment-informations-a-fournir.md). Toute modification
du nginx outer reste une action manuelle sur le serveur, pas automatisée par ce dépôt. Pattern
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
- **Limite de débit** : nginx inner limite, par adresse de client réel, la connexion (20 par minute, rafale de 10), la demande et la consommation d'un lien de réinitialisation (5 par minute), le renouvellement de session (120 par minute) et les `POST` coûteux — export, rapport PDF, imports, synchronisation des chantiers, suppression en groupe (30 par minute). Au-delà : `429`. L'adresse vient de `X-Forwarded-For` (posé par nginx outer), accepté des seuls réseaux privés (`set_real_ip_from`) ; si nginx outer cessait de le poser, la limite deviendrait commune à tous les utilisateurs. Les valeurs sont dans `frontend/nginx.conf`.
- **Adresse IP** : l'audit enregistre l'adresse du client réel. Le bloc nginx outer ci-dessus pose `X-Forwarded-For`
  (`$proxy_add_x_forwarded_for`), nginx inner le relaie, et Tomcat l'honore des seuls proxys internes
  (`server.forward-headers-strategy: native`) : un client ne peut pas usurper l'adresse enregistrée.

Aucun `build:` dans `docker-compose.yml` — uniquement des `image:` déjà publiées sur Docker Hub. L'image
`erp-rh-postgres` est construite depuis `database/Dockerfile` (PostgreSQL 18 + pgvector + pgAudit).
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
   le conserver sur le serveur dans le répertoire de sauvegarde configuré, hors du volume PostgreSQL,
   puis vérifier son empreinte et sa restaurabilité. Le volume seul n'est pas une sauvegarde ; aucun
   transfert hors du serveur n'est prévu dans ce chantier.
3. **Répéter avant la fenêtre** : restaurer cette sauvegarde dans l'image PostgreSQL 18 ERP-RH (pgvector + pgAudit),
   puis vérifier les extensions, les rôles, les migrations Flyway en attente jusqu'à V21, les nombres
   de lignes et le démarrage de l'application. Les migrations ajoutées après la validation locale
   PG18 (V16 à V21) doivent être rejouées et validées sur cette restauration avant la bascule de production.
   Ne pas exposer les mots de passe de production dans les commandes, le shell partagé ou les journaux.
4. **Arrêter les écritures** : activer la maintenance, arrêter les services backend et tout autre client
   qui écrit en base, puis produire le dump final PG17. Garder le conteneur PG17 et son volume présents.
5. **Restaurer dans le nouveau volume PG18** : démarrer un conteneur PG18 temporaire sur un port local
   différent, monté sur le volume cible `postgres_data_v18` et initialisé avec un compte de migration
   distinct des rôles exportés. Restaurer le dump logique (rôles, droits, extensions et bases), puis
   inventorier la dernière version Flyway déjà appliquée puis appliquer les migrations manquantes
   jusqu'à V21 avec `PGAUDIT_ENABLED=true`. Contrôler que les tables attendues et leurs données sont
   présentes, et que pgvector est disponible. Garder backend et trafic public arrêtés.
6. **Basculer Compose** : arrêter proprement le conteneur temporaire PG18, puis lancer le service
   `postgres` du Compose publié avec l'image ERP-RH PG18. Vérifier qu'il remonte le même volume cible et qu'il
   devient `healthy`. Démarrer backend seul, vérifier les logs, l'Actuator, l'authentification et les
   permissions, `shared_preload_libraries=pgaudit`, l'extension `pgaudit`, le réglage `pgaudit.log=all`
   sur la seule base ERP-RH et la présence de traces de contrôle, y compris les événements `ROLE` ; démarrer le frontend
   et retirer la maintenance seulement après validation.
7. **Retour arrière** : avant la réouverture, en cas d'échec, arrêter PG18 et remettre l'ancien Compose
   PG17 avec son volume d'origine. Le volume PG17 n'est jamais supprimé. Après réouverture et nouvelles
   écritures sur PG18, un simple retour à PG17 perdrait ces écritures : il faut d'abord les réconcilier
   par une migration inverse contrôlée. Conserver les deux volumes jusqu'à validation métier et
   sauvegarde PG18 restaurable.

État au 2026-10-10 : migration locale PG17→PG18 vérifiée (PostgreSQL 18.6, pgvector 0.8.7, Flyway V15 à cette date,
28 tables ; nombres de lignes identiques), tests backend propres passés sur PG18. **Migration du serveur
de production à planifier/exécuter séparément**. Les migrations V16 à V21 sont postérieures à cette
validation et doivent être rejouées sur une restauration de production PG17 avant la bascule.

Validation locale pgAudit au 2026-10-11 : l'image PostgreSQL ERP-RH se construit ; PostgreSQL 18.6 charge l'extension,
`CREATE EXTENSION pgaudit` réussit et une requête de contrôle apparaît dans les logs `AUDIT: SESSION`. L'activation
de la base de production reste à vérifier après la migration PG17→PG18 et l'obtention de l'accès SSH.

---

## CI/CD — état actuel

**CI en place** (`.github/workflows/ci.yml`) : à chaque push sur `main`, tests backend (contre un
PostgreSQL jetable démarré par Testcontainers) et frontend, puis build + push des images PostgreSQL 18 (pgvector + pgAudit), backend, frontend
(tags `<git-sha>` et `latest`, plus le tag de version sur un push de tag `v*`). Sur une pull
request, seuls les tests tournent (pas de push d'image, pas d'exposition des secrets Docker Hub à
une PR).

**Chaîne d'approvisionnement** : la CI du backend génère un SBOM CycloneDX (`./mvnw cyclonedx:makeBom`, artefact `sbom-backend`), l'analyse avec OSV-Scanner (échec à la première vulnérabilité connue ; exceptions motivées dans `backend/osv-scanner.toml`) et conserve le rapport de couverture JaCoCo (artefact `backend-coverage`). Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour Maven, npm, Docker (balise et empreinte) et GitHub Actions. Les images sont non-root et épinglées par empreinte (voir [../conventions/deployment.md](../conventions/deployment.md)) : le conteneur frontend écoute sur **8080** (le Compose publie `127.0.0.1:${FRONTEND_PORT}` vers ce port ; nginx outer n'est pas concerné).

**CD non traité** — le déploiement (`docker compose pull && up -d` sur le serveur) reste manuel
pour l'instant. Proposition à valider : déployer sur un tag `v*` uniquement après réussite de la CI,
par SSH depuis GitHub Actions, puis vérifier la santé des services. Les secrets SSH et les paramètres
du serveur seraient configurés dans GitHub Actions, jamais dans le dépôt. Cette mise en production
doit attendre la migration PG17→PG18 décrite plus haut ; le Compose actuel démarre PostgreSQL 18 et
un volume distinct. Aucune livraison ne doit être déclenchée sur la production avant cette migration.
Après l'accès SSH, la première bascule doit définir le tag PostgreSQL à déployer et vérifier l'activation pgAudit
par Flyway (`PGAUDIT_ENABLED=true`) ainsi que les droits applicatifs. L'image DB conserve les fichiers CSV sans purge
dans le volume PostgreSQL ; surveiller l'espace disque du serveur.

Secrets CI requis (variables secrètes GitHub Actions, jamais dans le dépôt) :
`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (token d'accès Docker Hub, pas le mot de passe du compte).

---

## Sauvegarde PostgreSQL

Le volume Docker `postgres_data_v18` assure la persistance des données face à un redémarrage/une
recréation de conteneur — **ce n'est pas un backup** : il ne protège pas contre une suppression du
volume, une corruption, ou une erreur humaine (ex. `DELETE` sans `WHERE`). Un vrai backup, distinct
du volume, est exécuté par le service Compose `backup`.

Les archives PostgreSQL complètes sont créées chaque jour à `02:00 UTC` et conservées 30 jours. Si
le service démarre sans archive datant de moins de 24 heures, il en crée une immédiatement ; un
échec est retenté chaque heure.
Le service place `rh-erp-<horodatage-UTC>.tar.gz` dans `./backups/`, à côté de
`docker-compose.yml`. Chaque archive contient le dump PostgreSQL au format custom, les rôles sans
leurs mots de passe et les sommes SHA-256 des deux fichiers. Le dump custom est validé avec
`pg_restore --list` avant publication de l'archive. Les permissions sont restreintes au compte
`postgres` du conteneur (UID/GID 70) ; sur un hôte Linux, préparer le dossier avec la commande
indiquée en tête de ce document avant le démarrage.

`BACKUP_TIME_UTC` et `BACKUP_RETENTION_DAYS` sont configurables dans `.env` ; les valeurs par défaut
sont `02:00` et `30`. La sauvegarde est stockée sans chiffrement, conformément au choix confirmé
pour ce déploiement local. Les archives contiennent des données personnelles et salariales : toute
personne ou processus pouvant lire `./backups/` peut lire ces données. Ne pas synchroniser le
dossier vers un stockage partagé non contrôlé. Le répertoire est exclu de Git.

### Vérifier et restaurer

Vérifier les exécutions récentes avec `docker compose logs backup` et l'existence d'une archive
datée de moins de 24 heures dans `backups/`. Pour vérifier les sommes et préparer une restauration
isolée :

```sh
mkdir -m 0700 restore-check
tar -xzf backups/rh-erp-<horodatage-UTC>.tar.gz -C restore-check
cd restore-check
sha256sum -c SHA256SUMS
pg_restore --list database.dump
```

Pour une restauration, utiliser une instance PostgreSQL isolée et vide, créée avec un compte
administrateur temporaire distinct des rôles sauvegardés. Restaurer `globals.sql`, créer la base
`POSTGRES_DB` puis restaurer `database.dump` avec `pg_restore`. Les mots de passe des rôles ne sont
pas inclus : les rétablir depuis la configuration de secrets avant de connecter l'application.
Contrôler extensions, migrations Flyway, volumes de données, permissions et démarrage applicatif
avant tout retour au service. Ne jamais tester sur le seul volume de production.

Par décision du 2026-10-11, les sauvegardes restent sur le serveur pour l'instant ; aucune copie
indépendante hors hôte ni exercice de restauration hors hôte n'est planifié. Cette sauvegarde locale
ne protège pas contre la perte ou la compromission de l'hôte. Voir `TODO.md`.

Voir `TODO.md` pour le suivi.
