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

---

## Démarrage

```bash
cp .env.example .env   # une seule fois, puis renseigner de vraies valeurs (voir .env.example)
docker compose --profile backup pull    # récupère les images publiées par la CI (voir .github/workflows/ci.yml)
docker compose --profile backup up -d   # le profil active le service de sauvegarde
```

### Deux comptes PostgreSQL

Le backend se connecte avec un **compte applicatif** (`POSTGRES_APP_USER`) qui n'a que `SELECT` et `INSERT` sur les tables
d'audit ; le **propriétaire** (`POSTGRES_USER`) ne sert qu'à Flyway. Au démarrage, Flyway crée le compte applicatif s'il
n'existe pas et recalcule ses droits (`afterMigrate.sql`) : **aucune étape manuelle**.

- **Bascule** : ajouter `POSTGRES_APP_USER` et `POSTGRES_APP_PASSWORD` dans `.env` (voir `.env.example`), puis
  `docker compose --profile backup pull && docker compose --profile backup up -d`. Vérifier dans les logs du backend : « Intégrité de l'audit : le compte
  applicatif ne peut pas modifier les tables d'audit ». À essayer d'abord sur une copie de la base.
- **Retour arrière** : retirer ces deux variables ; le compte propriétaire sert de nouveau à tout (l'application signale
  alors, au démarrage, que l'intégrité de l'audit n'est pas garantie).
- **Restauration d'une sauvegarde** : l'audit est dans la même base ; il revient au même instant que les données. À noter
  dans le registre d'exploitation (voir [audit/README.md](audit/README.md)).
- **Limite de débit** : nginx inner limite, par adresse de client réel, la connexion (20 par minute, rafale de 10), la demande et la consommation d'un lien de réinitialisation (5 par minute), le renouvellement de session (120 par minute) et les `POST` coûteux — export, rapport PDF, imports, synchronisation des chantiers, suppression en groupe (30 par minute). Au-delà : `429`. L'adresse vient de `X-Forwarded-For` (posé par nginx outer), accepté des seuls réseaux privés (`set_real_ip_from`) ; si nginx outer cessait de le poser, la limite deviendrait commune à tous les utilisateurs. Les valeurs sont dans `frontend/nginx.conf`.
- **Adresse IP** : l'audit enregistre l'adresse du client réel. Le bloc nginx outer ci-dessus pose `X-Forwarded-For`
  (`$proxy_add_x_forwarded_for`), nginx inner le relaie, et Tomcat l'honore des seuls proxys internes
  (`server.forward-headers-strategy: native`) : un client ne peut pas usurper l'adresse enregistrée.

`docker-compose.yml` ne contient aucun `build:` : il utilise uniquement des images publiées sur
Docker Hub. L'image `erp-rh-postgres` est construite depuis `database/Dockerfile` (PostgreSQL 18 +
pgvector + pgAudit). Pour re-déployer une nouvelle version, sélectionner le même SHA approuvé pour
les quatre images, puis exécuter `docker compose --profile backup pull && docker compose --profile
backup up -d`. Cette opération ne supprime pas le volume `postgres_data_v18`. Ne jamais lancer
`docker compose down -v`.

La migration locale PG17→PG18 du 2026-10-10 était une répétition isolée. La bascule de production a
été effectuée le 2026-10-14 ; voir la procédure et les vérifications consignées plus bas. Le volume
PG17 et le volume `postgres_data_v18` doivent rester préservés jusqu'au rapprochement des données et
à la validation d'une restauration PG18, suivis dans [`TODO.md`](../TODO.md).

### Tags immuables des images

La CI publie chaque image avec le SHA du commit (`github.sha`) et publie aussi `latest` pour les usages
qui ne déploient pas en production. Compose exige explicitement les quatre variables
`POSTGRES_IMAGE_TAG`, `BACKUP_IMAGE_TAG`, `BACKEND_IMAGE_TAG` et `FRONTEND_IMAGE_TAG` : définir le même
SHA publié pour chacune avant `docker compose --profile backup pull`. Aucun tag par défaut n'est accepté,
afin d'éviter qu'une mise à jour déplace silencieusement les images utilisées et de conserver une version
précise pour le retour arrière. La valeur `change-me-commit-sha` de `.env.example` est un placeholder à
remplacer avant tout `pull` ou démarrage.

### Retour arrière d'une mise à jour applicative

Avant la mise à jour, noter le SHA des quatre images actuellement déployées et vérifier qu'une
sauvegarde récente est disponible. Mettre les quatre variables de tag dans `.env` sur le SHA validé
à déployer, puis exécuter la procédure manuelle ci-dessus. En cas d'échec d'un healthcheck ou d'un
parcours critique, remettre ensemble les quatre tags précédents dans `.env`, exécuter
`docker compose --profile backup pull` puis `docker compose --profile backup up -d`, et vérifier la
santé des services ainsi que les parcours concernés.

Ce retour aux images précédentes n'est sûr que si les migrations Flyway de la version déployée restent
compatibles avec cette version applicative. Si une migration rend le schéma ou les données incompatibles,
ne pas simplement redémarrer l'ancien backend ni restaurer par-dessus le volume actif : maintenir la
fenêtre d'incident, préserver le volume courant, puis appliquer une correction en avant ou restaurer
la sauvegarde vers un nouveau volume après décision de l'exploitant et analyse des écritures à réconcilier.
Les migrations majeures PostgreSQL suivent la procédure de retour arrière dédiée ci-dessous.

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

État de production au 2026-10-14, d'après les commandes exécutées sur le serveur : la restauration
PG17→PG18 a été faite dans le nouveau volume ; PostgreSQL 18.6, pgvector 0.8.7 et pgAudit 18.0 sont
disponibles ; Flyway a atteint V21 ; `pgaudit.log=all` est configuré ; le rôle applicatif est
non-superuser et le backend est sain. La vérification comparative des volumes de données restaurés,
la présence conservée du volume PG17 et la lecture d'événements pgAudit dans les journaux restent
suivies dans [`TODO.md`](../TODO.md).

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

**Chaîne d'approvisionnement** : la CI du backend génère un SBOM CycloneDX (`./mvnw cyclonedx:makeBom`, artefact `sbom-backend`), l'analyse avec OSV-Scanner (échec à la première vulnérabilité connue ; exceptions motivées dans `backend/osv-scanner.toml`) et conserve le rapport de couverture JaCoCo (artefact `backend-coverage`). Dependabot (`.github/dependabot.yml`) propose chaque semaine les mises à jour Maven, npm, Docker (balise et empreinte) et GitHub Actions. Les images sont non-root et épinglées par empreinte (voir [../conventions/deployment.md](../conventions/deployment.md)) : le conteneur frontend écoute sur **8080** (le Compose publie `127.0.0.1:${FRONTEND_PORT}` vers ce port ; nginx outer n'est pas concerné).

**CD manuel** — la mise à jour de production est déclenchée par un opérateur autorisé avec
`docker compose --profile backup pull && docker compose --profile backup up -d`, après validation CI
du SHA ciblé. Vérifier l'état de santé des quatre services et les parcours critiques avant de terminer
la fenêtre. Aucun déploiement SSH automatisé n'est configuré ; son éventuelle introduction sera une
évolution séparée, avec secrets dans GitHub Actions et contrôle de santé. La migration PG17→PG18 est
terminée. La lecture des événements pgAudit et la surveillance de l'espace des journaux CSV restent
des vérifications de production dans `TODO.md`.

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
de 4 heures, retenu le 2026-10-12. L'exercice local synthétique réussit dans ce délai ; confirmer le
RTO avec le volume et les contraintes d'accès réels avant de le tenir pour validé en production.

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
PostgreSQL ou une erreur sur les données, mais pas contre la perte ou la compromission de l'hôte. La
clé publique age est configurée et une archive chiffrée récente a été créée ; la restauration isolée
d'une archive de production, la mesure du RTO et l'alerte de fraîcheur restent dans `TODO.md`.

Voir `TODO.md` pour le suivi.
