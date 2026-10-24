# Déploiement — architecture réelle de rh-erp

## Journaux et répertoires locaux

Le backend émet ses journaux JSON sur la sortie console en production (consultables en temps réel avec
`docker compose logs --follow backend`) et écrit les archives quotidiennes compressées dans
`./logs/`, à côté de `docker-compose.yml`. Les archives utilisent UTC et sont conservées 30 jours.
Chaque événement porte le nom de l'application et le `requestId` lorsque l'appel vient d'une requête HTTP.
L'identité de l'acteur reste dans le journal d'audit ; les logs techniques excluent noms d'utilisateur,
adresses e-mail, identifiants d'employé, secrets, jetons, cookies, corps de requête et valeurs métier/financières.
L'encodeur JSON n'autorise que `requestId` parmi les champs MDC ; un `TaskDecorator` le propage aux tâches `@Async`.
L'accès aux flux et aux archives est réservé aux administrateurs de l'hôte disposant des droits Docker et du
répertoire ; cette séparation des droits doit être contrôlée sur l'hôte de production. Le dossier est monté depuis
l'hôte et exclu de Git. Avant le premier démarrage sur un hôte Linux,
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
sont liés à `127.0.0.1` — accessibles uniquement depuis le serveur lui-même (nginx outer ou les
services locaux), jamais depuis l'extérieur.

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

`FRONTEND_URL` (dans `.env`) sert à construire le lien de réinitialisation de mot de passe envoyé
par email (`EmailService`). Il doit correspondre à l'URL publique complète résultante (ex.
`https://<domaine>/rh-erp`) pour que ce lien soit valide. `CORS_ALLOWED_ORIGINS` porte séparément
les origines navigateur autorisées (sans chemin), car une URL d'application peut inclure un sous-chemin.

### CORS

`SecurityConfig` lit `CORS_ALLOWED_ORIGINS` et refuse le démarrage si une valeur est vide, contient
un wildcard ou n'est pas une origine `http(s)://hôte[:port]`. Chaque environnement déclare sa propre
liste : l'environnement local contient `http://localhost:4200` ; la production contient l'origine
publique réelle, par exemple `https://<domaine>`, sans le sous-chemin `/rh-erp`. Les credentials restent
activés uniquement pour ces origines explicites.

Pour l'URL de production observée le 2026-10-16 (`http://staport.dyndns.org:650/erp-rh/`), l'origine
CORS correspondante est `http://staport.dyndns.org:650` (sans le chemin). Cette origine HTTP est
temporaire ; la valeur devra passer à HTTPS lorsque TLS sera configuré.

---

## Démarrage

```bash
cp .env.example .env   # une seule fois, puis renseigner de vraies valeurs (voir .env.example)
```

Sur le serveur de production, ajouter `COMPOSE_PROFILES=backup` au fichier `.env` une seule fois,
puis lancer les commandes ordinaires :

```bash
docker compose pull    # récupère les images publiées par la CI (voir .github/workflows/ci.yml)
docker compose up -d   # démarre aussi les planificateurs de sauvegarde et de rétention pgAudit
```

Compose active alors ce profil pour les commandes. Le profil lance le planificateur de sauvegarde
et le planificateur de rétention pgAudit ; ce n'est pas une commande de restauration. Sans cette
variable ou `--profile backup`, ces services optionnels ne sont pas inclus.

Les services IA (`litellm-db`, `litellm`, `ia`) appartiennent au profil `ia`
(`COMPOSE_PROFILES=backup,ia` pour les inclure) ; la pile ERP n'en dépend pas. Leurs variables
sont dans la section IA du même `.env` ; voir [ia.md](ia.md) et [litellm/README.md](../litellm/README.md).

Le fond de la carte des chantiers est un dossier de l'hôte (`CARTE_FOND_DIR`, défaut `./carte-fond`) monté en lecture
seule dans le frontend ; le préparer une fois avec `scripts/carte/preparer-fond-carte.sh ./carte-fond` (voir
[chantier/carte.md](chantier/carte.md)). Sans lui, l'application fonctionne, la carte s'affiche sans fond.
L'imagerie satellite passe par le nginx du frontend, qui y ajoute la clé ArcGIS gratuite `ARCGIS_API_KEY` de `.env`
(obligatoire : `docker compose` refuse de démarrer sans elle ; création pas à pas dans [chantier/carte.md](chantier/carte.md#clé-arcgis)).

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
- **Limite de débit** : nginx inner limite, par adresse de client réel, la connexion (20 par minute, rafale de 10), la demande et la consommation d'un lien de réinitialisation (5 par minute), le renouvellement de session (120 par minute) et les `POST` coûteux — export, rapport PDF, imports, synchronisation des chantiers, suppression en groupe (30 par minute). Au-delà : `429`. L'adresse vient de `X-Forwarded-For` (posé par nginx outer) ; nginx inner n'accepte cette adresse que depuis le pair explicitement approuvé `set_real_ip_from` configuré dans `frontend/nginx.conf`. Si nginx outer cesse de transmettre l'en-tête, la limite devient commune à tous les utilisateurs. Les valeurs sont dans `frontend/nginx.conf`.
- **Adresse IP** : l'audit enregistre l'adresse du client réel. Le bloc nginx outer ci-dessus pose `X-Forwarded-For`
  (`$proxy_add_x_forwarded_for`), nginx inner le relaie, et Tomcat l'honore des seuls proxys internes
  (`server.forward-headers-strategy: native`) : un client ne peut pas usurper l'adresse enregistrée.

`docker-compose.yml` ne contient aucun `build:` : il utilise uniquement des images publiées sur
Docker Hub. L'image `erp-rh-postgres` est construite depuis `database/Dockerfile` (PostgreSQL 18 +
pgvector + pgAudit). Pour redéployer la production, vérifier que la CI de `main` a réussi, puis exécuter
`docker compose pull && docker compose up -d`. Les quatre variables d'image suivent `latest` par
décision du propriétaire (voir [ADR 0004](adr/0004-production-latest-tag.md)).
Cette opération ne supprime pas le volume `postgres_data_v18`. Ne jamais lancer
`docker compose down -v`.

### Rétention des journaux CSV PostgreSQL

Le service `postgres-log-retention`, activé par le profil `backup`, utilise l'image PostgreSQL ERP-RH
et monte le volume `postgres_data_v18` avec l'utilisateur `postgres`, sans réseau. Il supprime au
démarrage puis chaque jour à 03:00 UTC les fichiers réguliers du premier niveau qui correspondent
à `postgresql-*.csv*` et dont la modification remonte à plus de 90 jours. Cette rétention concerne
uniquement les CSV PostgreSQL ; elle ne supprime ni `audit_journal`/Envers ni les sauvegardes chiffrées.
Le nom `log_filename` ne doit pas inclure `.csv`, car PostgreSQL ajoute ce suffixe à la sortie `csvlog`.

Après déploiement, vérifier que `postgres-log-retention` est démarré et sain avec
`docker compose ps postgres-log-retention`, puis consulter `docker compose logs --tail 20 postgres-log-retention`
pour confirmer l'exécution quotidienne. Le conteneur ne peut supprimer que les CSV de plus de 90 jours ;
la vérification initiale des droits d'accès du volume et la configuration des alertes restent nécessaires.

La migration locale PG17→PG18 du 2026-10-10 était une répétition isolée. La bascule de production a
été effectuée le 2026-10-14 et le propriétaire confirme qu'il n'y a plus de suivi à faire sur l'ancien
volume PG17. Les prochains essais de migrations et de restauration se feront sur des instances isolées,
comme indiqué dans [`TODO.md`](../TODO.md).

### Tags des images en production

La CI publie chaque image avec le SHA du commit (`github.sha`) et publie aussi `latest` pour `main`.
Conformément à l'ADR 0004, la production suit `latest` pour les quatre variables
`POSTGRES_IMAGE_TAG`, `BACKUP_IMAGE_TAG`, `BACKEND_IMAGE_TAG` et `FRONTEND_IMAGE_TAG`, déjà renseignées
ainsi dans `.env.example`. Avant chaque pull, attendre la réussite de la CI sur `main` et vérifier
l'état de santé des cinq services actifs avec le profil `backup`. `latest` est mutable : il peut désigner un autre build
au prochain déploiement et ne permet pas de retrouver seul l'ancienne version. Pour faciliter un
diagnostic ou un retour arrière, conserver les identifiants/digests des images actuellement déployées
dans le registre d'exploitation, ou utiliser les tags SHA publiés en cas d'incident.

### Retour arrière d'une mise à jour applicative

Avant la mise à jour, vérifier qu'une sauvegarde récente est disponible. Après le pull, en cas d'échec
d'un healthcheck ou d'un parcours critique, ne pas relancer aveuglément `latest` : consulter le registre
d'exploitation pour retrouver l'image précédente (ou son tag SHA publié), rétablir ensemble les quatre
images correspondantes, puis vérifier la santé des services et les parcours concernés. Si cette
référence n'a pas été conservée, appliquer une correction en avant ou suivre la procédure de restauration
après décision de l'exploitant.

Ce retour aux images précédentes n'est sûr que si les migrations Flyway de la version déployée restent
compatibles avec cette version applicative. Si une migration rend le schéma ou les données incompatibles,
ne pas simplement redémarrer l'ancien backend ni restaurer par-dessus le volume actif : maintenir la
fenêtre d'incident, préserver le volume courant, puis appliquer une correction en avant ou restaurer
la sauvegarde vers un nouveau volume après décision de l'exploitant et analyse des écritures à réconcilier.
Les migrations majeures PostgreSQL suivent la procédure de retour arrière dédiée ci-dessous.

**Migration de données irréversible — V30 (reprise des employés depuis la paie, ADR 0010).** Elle supprime les employés
sans aucun bulletin de paie et réaligne toutes les fiches. Avant la mise à jour qui l'apporte, faire une sauvegarde
manuelle et vérifier qu'elle est restaurable ; le retour aux images précédentes ne fait pas revenir les employés supprimés.

**Migration de données — V31 (fonctions et chantiers sans paie).** Elle supprime les fonctions qu'aucun bulletin ni
aucune fiche employé ne cite, et clôture les chantiers qu'aucun bulletin ne cite (ils restent en base et se rouvrent depuis
l'écran Chantiers). Elle suit V30 dans la même mise à jour ; la même sauvegarde la couvre. Les chantiers se rouvrent à la
main, mais les fonctions supprimées ne reviennent qu'en restaurant la sauvegarde (l'import de la paie recrée une fonction
inconnue).

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
   différent, monté sur le volume cible `postgres_data_v18` et initialisé avec le rôle propriétaire de
   la base, qui sert aussi au compte de migration. Restaurer le dump de la base avec ce rôle. Examiner
   `globals.sql` avant toute exécution : le rôle initial créé par PostgreSQL existe déjà et les mots de
   passe ne figurent pas dans cette sauvegarde ; ne pas rejouer aveuglément des `CREATE ROLE` en conflit.
   Recréer ou restaurer uniquement les rôles supplémentaires nécessaires, puis inventorier la dernière
   version Flyway et appliquer les migrations manquantes jusqu'à V21 avec `PGAUDIT_ENABLED=true`.
   Contrôler que les tables attendues et leurs données sont présentes et que pgvector est disponible.
   Garder backend et trafic public arrêtés.
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

État de production vérifié le 2026-10-16 : PostgreSQL 18.6, pgvector 0.8.7 et pgAudit 18.0 sont
disponibles ; `pgaudit.log=all` est configuré et le propriétaire confirme que pgAudit fonctionne.
Après suppression auditée de la Fonction 144 (doublon avec espace initial, aucune référence active),
la Fonction 148 étant conservée, les migrations V22 à V27 ont été appliquées en production. Le
backend `latest` est sain, `ddl-auto=validate` a réussi et Flyway est en V27. Aucun suivi du volume
PG17 n'est requis, selon le propriétaire. Le service de rétention CSV est déployé et ses exécutions
planifiées sont vérifiées. Le contrôle hôte confirme les permissions des fichiers, les seuls services
montant le volume et la capacité disponible ; les alertes pgAudit restent à raccorder à la supervision
dans [`TODO.md`](../TODO.md).

Après correction de `BACKUP_AGE_RECIPIENT` dans le `.env` de l'hôte et redémarrage des services, le
contrôle du 2026-10-17 montre `backup` et `postgres-log-retention` démarrés et sains. Les ports hôte
publiés sont `127.0.0.1:5002` pour le frontend et `127.0.0.1:5001` pour le backend ; le listener Nginx
outer est sur `0.0.0.0:80`. Le `nginx -T` du 2026-10-17 confirme les limites actives : connexion
20/min + burst 10, réinitialisation 5/min + burst 5, session 120/min + burst 30 et écritures lourdes
30/min + burst 10. `X-Forwarded-For` est utilisé pour l'adresse réelle. Les requêtes navigateur
journalisées le 2026-10-17 montrent l'adresse client identique dans `$remote_addr` et
`$http_x_forwarded_for` ; un refresh répond 200. La transmission via l'outer fonctionne. Les journaux
Nginx consultés après le déploiement de l'instrumentation montrent `socket_peer=172.20.0.1` pour les
requêtes utilisateur, soit la passerelle de `erp-rh_web-net` (`172.20.0.0/16`), et `127.0.0.1` pour le
healthcheck local. La passerelle `erp-rh_db-net` est `172.21.0.1` ; elle n'est pas le pair de Nginx
outer. La configuration versionnée limite `set_real_ip_from` à `172.20.0.1/32`. Après publication et
déploiement de cette version, vérifier un en-tête `X-Forwarded-For` falsifié et les limites par
IP/utilisateur avant de clore le point. Les logs d'accès sont reliés au flux stdout ; ne pas lire directement
`/var/log/nginx/access.log` dans le conteneur.

Les sauvegardes planifiées `rh-erp-20261017T015957Z` et `rh-erp-20261017T020000Z` ont réussi avec
vérification de `globals.sql` et `database.dump`. Le journal pgAudit confirme les exécutions de
rétention du 2026-10-16 et du 2026-10-17 ; aucun CSV de plus de 90 jours n'était présent au dernier
inventaire. Le contrôle des montages en production du 2026-10-17 montre que le volume PostgreSQL est
monté en lecture/écriture seulement par `postgres` et `postgres-log-retention`. Le dossier CSV est en
mode `1777` avec les fichiers en `600`, détenus par `postgres` ; le service de rétention utilise l'UID
`postgres`, sans capacité Linux et sans réseau. Le relevé du 2026-10-16 montrait 4 % d'espace et 1 %
d'inodes utilisés. Le contrôle d'accès et la capacité actuels sont satisfaits ; la supervision/alerte
de capacité reste ouverte. Aucun listener hôte 443 n'a été observé ; HTTPS reste ouvert.

Le contrôle hôte des journaux applicatifs du 2026-10-17 montre que `C:\apps\erp-rh\logs` (y compris
`archive`) et `C:\apps\erp-rh\backups` héritent des ACL de `C:\apps\erp-rh` : Administrateurs et
Système ont le contrôle total, `Utilisateurs` ont la lecture, et `Utilisateurs authentifiés` ont la
modification. Le propriétaire confirme être le seul opérateur humain du serveur et accepte ce modèle
d'exploitation. Le lecteur C: dispose de 100 035 084 288 octets libres sur 255 072 399 360. Les
archives de journaux présentes sont quotidiennes ; la configuration Logback conserve 30 jours et
utilise des dates UTC. Aucun fichier de plus de 30 jours n'était présent dans l'inventaire fourni.

---

## CI/CD — état actuel

**CI en place** (`.github/workflows/ci.yml`) : chaque pull request exécute `backend`, `frontend`,
`performance-profile` et `full-stack` ; aucune image n'est publiée depuis une pull request. La branche
`main` est protégée : une pull request à jour et la réussite de ces quatre contrôles sont requises,
y compris pour les administrateurs. Sur les pushs autorisés vers `main` ou sur un tag de version
`v*`, le workflow attend ces contrôles, construit les quatre images (PostgreSQL 18 + pgvector + pgAudit,
backend, frontend et sauvegarde), puis les publie sous le SHA du commit ; `latest` est aussi publié
pour `main`, et le tag de version pour `v*`. La publication ne reçoit pas les secrets Docker Hub dans
le contexte d'une pull request.

**Chaîne d'approvisionnement** : la CI du backend génère un SBOM CycloneDX (`./mvnw cyclonedx:makeBom`, artefact `sbom-backend`), l'analyse avec OSV-Scanner (échec à la première vulnérabilité connue ; exceptions motivées dans `backend/osv-scanner.toml`) et conserve le rapport de couverture JaCoCo (artefact `backend-coverage`). Dependabot (`.github/dependabot.yml`) propose chaque trimestre les mises à jour Maven, npm, Docker (balise et empreinte) et GitHub Actions. Les images sont non-root et épinglées par empreinte (voir [../conventions/deployment.md](../conventions/deployment.md)) : le conteneur frontend écoute sur **8080** (le Compose publie `127.0.0.1:${FRONTEND_PORT}` vers ce port ; nginx outer n'est pas concerné).

**CD manuel** — la mise à jour de production est déclenchée par un opérateur autorisé avec
`docker compose pull && docker compose up -d`, après réussite de la CI sur `main`. La production suit
`latest` pour les quatre images selon l'ADR 0004. Le `.env` de production doit porter
`COMPOSE_PROFILES=backup` pour inclure les conteneurs de sauvegarde et de rétention planifiées. Vérifier
l'état de santé des cinq services et les parcours critiques avant de terminer la fenêtre. Aucun accès SSH ni déploiement
automatisé n'est souhaité. La migration PG17→PG18 et l'émission pgAudit sont confirmées ; les contrôles
restants sont dans `TODO.md`.

Secrets CI requis (variables secrètes GitHub Actions, jamais dans le dépôt) :
`DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (token d'accès Docker Hub, pas le mot de passe du compte).

---

## Sauvegarde PostgreSQL

Le volume Docker `postgres_data_v18` assure la persistance des données face à un redémarrage/une
recréation de conteneur — **ce n'est pas un backup** : il ne protège pas contre une suppression du
volume, une corruption, ou une erreur humaine (ex. `DELETE` sans `WHERE`). Un vrai backup, distinct
du volume, est exécuté par le service Compose `backup`.

Le service `backup` utilise le profil Compose `backup` : les démarrages locaux habituels ne lancent
pas le planificateur ni le conteneur à partir duquel Docker créait un volume PostgreSQL anonyme inutile.
En production, les commandes de démarrage et de mise à jour activent explicitement ce profil.

Les archives PostgreSQL complètes sont créées chaque jour à `02:00 UTC` et conservées 30 jours. Si
le service démarre sans archive datant de moins de 24 heures, il en crée une immédiatement ; un
échec est retenté chaque heure.
Le service place `rh-erp-<horodatage-UTC>.tar.gz.age` dans `./backups/`, à côté de
`docker-compose.yml`. Le dump PostgreSQL au format custom, les rôles sans leurs mots de passe et les
sommes SHA-256 sont regroupés dans une archive tar.gz, puis chiffrés avec `age` avant leur publication.
Le dump est validé avec `pg_restore --list` ; l'archive tar est relue et ses sommes vérifiées avant
chiffrement. Le plaintext temporaire est placé dans `/tmp`, monté en tmpfs par Compose, puis supprimé.
Les permissions sont restreintes au compte `postgres` du conteneur (UID/GID 70) ; sur un hôte Linux,
préparer le dossier avec la commande indiquée en tête de ce document avant le démarrage. Le conteneur
applique `umask 077` à chaque archive ; il ne change pas les permissions du bind mount, car les
partages Windows/NTFS ne garantissent pas `chmod` POSIX.

`BACKUP_TIME_UTC` et `BACKUP_RETENTION_DAYS` sont configurables dans `.env` ; les valeurs par défaut
sont `02:00` et `30`. `BACKUP_AGE_RECIPIENT` contient la clé publique `age` destinée au chiffrement ;
ce n'est pas un secret. La clé privée ne doit jamais être placée sur le serveur, dans le dépôt ou dans
les archives. Les archives contiennent des données personnelles et salariales : limiter également
l'accès au répertoire `./backups/`, qui est exclu de Git.

**Objectifs de reprise** : RPO cible de 24 heures (sauvegarde quotidienne à 02:00 UTC) et RTO cible
de 4 heures, retenu le 2026-10-12. Le 2026-10-16, l'archive de production `rh-erp-20261016T020000Z.tar.gz.age`
a été déchiffrée et restaurée avec succès en PostgreSQL 18.6 isolé ; `pgaudit` et `vector` sont présents
et Flyway est en V21. L'opération locale a pris 6 secondes pour une archive de 1,5 Mo. Ce temps mesure
la restauration de la base, pas le redémarrage complet de l'application en production.

### Préparer la clé age et accéder aux archives

Sur le poste d'administration, installer `age` (Windows : `winget install --id FiloSottile.age`),
puis générer une identité :

```powershell
age-keygen -o "$env:USERPROFILE\erp-rh-backup-identity.txt"
```

La commande affiche une clé publique `age1...` : reporter uniquement cette valeur dans
`BACKUP_AGE_RECIPIENT` du `.env` du serveur. Garder `erp-rh-backup-identity.txt` dans un gestionnaire
de secrets ou un support chiffré hors serveur, avec une seconde copie de secours protégée. Sans cette
clé privée, aucune archive ne peut être déchiffrée.

Pour lire une archive, copier le fichier `.tar.gz.age` vers un poste de restauration contrôlé, puis la
déchiffrer avec la clé privée :

```powershell
age --decrypt --identity "$env:USERPROFILE\erp-rh-backup-identity.txt" `
  --output .\restore-check.tar.gz .\rh-erp-<horodatage-UTC>.tar.gz.age
```

Extraire ensuite le `.tar.gz`, vérifier `SHA256SUMS` avec `sha256sum -c SHA256SUMS` dans WSL/Linux,
et contrôler le dump avec `pg_restore --list database.dump` avant de suivre la procédure de
restauration isolée ci-dessous. Ne jamais transmettre la clé privée avec l'archive.

### Vérifier et restaurer

Vérifier les exécutions récentes avec `docker compose logs backup` et l'existence d'une archive
chiffrée datée de moins de 24 heures dans `backups/`. Déchiffrer celle-ci avec la procédure ci-dessus,
puis vérifier les sommes et préparer une restauration isolée :

```sh
mkdir -m 0700 restore-check
tar -xzf restore-check.tar.gz -C restore-check
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

Par décision du propriétaire, réaffirmée le 2026-10-15, les archives de base restent uniquement sur
le serveur ; aucune copie hors hôte n'est demandée. Cette stratégie protège contre la perte du volume
PostgreSQL ou une erreur sur les données, mais pas contre la perte ou la compromission de l'hôte. Le
2026-10-16, une sauvegarde post-nettoyage `rh-erp-20261016T190309Z.tar.gz.age` (2 030 763 octets) a
été créée avec succès et ses fichiers `globals.sql` et `database.dump` ont été vérifiés. Une archive
de production antérieure a été restaurée avec succès dans une instance PostgreSQL 18.6 isolée ; les
migrations V22 à V27 y ont ensuite été validées et le backend a démarré sainement. La clé privée est
absente du dossier de sauvegarde du serveur et le propriétaire a confirmé en conserver une copie de
secours protégée hors serveur. Le contrôle hôte du 2026-10-17 montre les conteneurs `backup` et
`postgres-log-retention` sains. Deux sauvegardes planifiées le 2026-10-17 ont réussi et validé leurs
sommes ; le job de rétention a terminé sans erreur le 16 et le 17 octobre. La suppression d'un fichier
de plus de 90 jours n'a pas été observée car l'inventaire précédent n'en comptait aucun. L'accès au
volume et sa capacité ont été contrôlés le 2026-10-17 ; le routage des alertes reste ouvert dans
`TODO.md`.

Voir `TODO.md` pour le suivi.
