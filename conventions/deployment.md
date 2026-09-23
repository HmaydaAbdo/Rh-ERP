# Déploiement — Docker Compose, PostgreSQL, Nginx inner/outer, CI

> Pattern de référence pour développer et déployer un projet Spring Boot + Angular avec
> PostgreSQL, réutilisable d'un projet à l'autre. La liste réelle des services, ports, images et
> variables d'un projet donné vit dans son propre `docker-compose.yml`/`.env.example` et sa propre
> documentation (`docs/deployment.md`), pas ici.

---

## Deux Compose possibles, jamais mélangés

- **Compose de production** : un seul fichier, uniquement des `image:` déjà publiées sur un
  registre (Docker Hub ou équivalent) — **jamais de `build:`**, jamais de bind mount du code
  source, jamais de volume `node_modules`. Les images sont construites et publiées par la CI (voir
  plus bas), le Compose ne fait que les consommer.
- **Développement local** : pas de Compose dédié — lancer le backend et/ou le frontend directement
  sur la machine (`./mvnw spring-boot:run`, `ng serve`) pendant que `docker compose up -d postgres`
  fournit uniquement la base de données. Un cycle de développement actif (rechargement à chaud,
  débogueur attaché) est toujours plus rapide qu'un conteneur reconstruit à chaque changement — ne
  jamais concevoir le Compose de production pour servir aussi de confort de développement.

Ne jamais faire cohabiter les deux logiques (bind mount + image publiée, ou `build:` + `image:`)
dans un même fichier.

---

## Stack de référence

| Service | Rôle | Image |
|---|---|---|
| `postgres` | Base de données | `postgres:<version>` (ou `pgvector/pgvector:pg<version>` si des embeddings/recherche vectorielle sont nécessaires — n'activer l'extension que si un besoin réel existe, jamais par anticipation, `conventions/architecture.md`) |
| `backend` | API Spring Boot | `<registre>/<projet>-backend:<tag>` — buildée par la CI depuis `backend/Dockerfile` |
| `frontend` | Nginx inner servant le build Angular | `<registre>/<projet>-frontend:<tag>` — buildée par la CI depuis `frontend/Dockerfile` (multi-stage Node → Nginx) |

Fichier d'orchestration : `docker-compose.yml` à la racine du dépôt. Toutes les valeurs (identifiants,
ports, noms d'image, tags) viennent de `.env` à la racine — jamais en dur dans le Compose
(`conventions/configuration.md`).

---

## Pattern Nginx inner / Nginx outer

Pour un déploiement partagé (plusieurs applications sur le même serveur, chacune sous son propre
sous-chemin) :

```
Internet
   │
   ▼
NGINX OUTER (hors du dépôt applicatif — géré au niveau du serveur, partagé entre applications)
   │  proxy_pass vers 127.0.0.1:<port publié>, sub_filter pour réécrire <base href>
   ▼
NGINX INNER (conteneur "frontend" de CE projet)
   │
   ├── fichiers statiques du build frontend — servis directement, cache long terme
   └── proxy_pass interne (réseau Docker) vers le backend de CE projet
```

- **Nginx outer** vit sur le serveur, en dehors de tout dépôt applicatif — il route chaque
  application vers son propre sous-chemin (`/<projet>/`) et son propre port publié en loopback.
  L'ajouter à sa configuration reste une action manuelle sur le serveur (chaque projet documente,
  dans son propre `docs/deployment.md`, le bloc à y ajouter).
- **Nginx inner** appartient au dépôt applicatif (`frontend/nginx.conf`) — sert les fichiers
  statiques du build ET relaie en interne les appels API vers le backend du même projet, sur le
  réseau Docker (jamais via un port publié). C'est lui qui gère la distinction "route front-end vs
  appel API" décrite ci-dessous — nginx outer n'a besoin de connaître qu'un seul port par
  application.
- **Sous-chemin + `sub_filter`** : quand une application est servie sous `/<projet>/` plutôt qu'à la
  racine d'un domaine, le build frontend reste générique (`<base href="/">`) — c'est nginx outer qui
  réécrit dynamiquement `<base href="/">` → `<base href="/<projet>/">` dans la réponse HTML
  (`sub_filter`), pas un rebuild avec `--base-href`. Le routeur Angular lit le `<base href>` au
  runtime, et les assets compilés par Angular CLI sont déjà relatifs à ce `<base href>` (pas de
  chemin absolu en dur) — aucune configuration supplémentaire nécessaire côté frontend.

### Ports — toujours liés à `127.0.0.1`

Tout port publié par le Compose de production (`ports: - "127.0.0.1:${PORT}:<port interne>"`) est
lié à la boucle locale, jamais à `0.0.0.0` — accessible uniquement depuis le serveur lui-même (nginx
outer, ou un accès direct pour l'administration/le backup), jamais depuis l'extérieur. C'est ce
binding, pas un pare-feu externe, qui garantit qu'un service n'est pas exposé à Internet.

### Désambiguïser route Angular et appel API dans nginx inner

Quand un préfixe existe à la fois comme route Angular (une page) et comme préfixe d'API
(`GET /xxx`, `POST /xxx/search`...), la même requête HTTP doit soit servir la page (rechargement de
navigateur), soit être relayée au backend (appel `HttpClient`), selon son origine — distinguer les
deux via l'en-tête `Accept` (une navigation envoie `Accept: text/html`, `HttpClient` ne l'envoie
jamais) :

```nginx
location ~ ^/(xxx|yyy)(/|$) {
    if ($http_accept ~* "text/html") {
        rewrite ^ /__spa_fallback last;   # jamais "break" : "break" laisse le proxy_pass
                                            # du même bloc s'exécuter quand même sur l'URI réécrite.
    }
    proxy_pass http://backend;
}

location = /__spa_fallback {
    internal;
    try_files /index.html =404;
}
```

Utiliser une regex ancrée sur le segment de chemin (`^/xxx(/|$)`), jamais un préfixe simple
(`location /xxx`) — un préfixe nu capture aussi par erreur toute ressource sans rapport comme
`/xxxYYY`.

---

## Démarrage (production)

```bash
cp .env.example .env   # une seule fois, puis renseigner de vraies valeurs
docker compose pull    # récupère les images publiées par la CI
docker compose up -d
```

Re-déployer une nouvelle version : `docker compose pull && docker compose up -d` (ne recrée que les
conteneurs dont l'image a changé, ne touche jamais au volume de données).

### Démarrage (développement local)

```bash
docker compose up -d postgres
cd backend && ./mvnw spring-boot:run     # ou équivalent
cd frontend && ng serve                   # proxy vers le backend local, voir proxy.conf.js
```

### Tests

Les tests qui chargent le contexte applicatif complet ont besoin d'une base de données réelle et
accessible (les tests unitaires avec repositories mockés n'en ont pas besoin) — démarrer
`docker compose up -d postgres` avant de les lancer si ce n'est pas déjà fait. En CI, un service de
base de données dédié au job (ex. `services:` GitHub Actions) remplace ce besoin.

---

## Migrations — Flyway

Le schéma est géré exclusivement par Flyway (`backend/src/main/resources/db/migration/`), jamais
par Hibernate : `spring.jpa.hibernate.ddl-auto` est fixé à `validate` (voir
`conventions/database.md` pour le détail des conventions de migration). Flyway s'exécute
automatiquement au démarrage de l'application, avant l'initialisation de Hibernate.

---

## Healthchecks

Chaque service définit un healthcheck adapté :

| Service | Vérification |
|---|---|
| Base de données | `pg_isready` (ou équivalent du moteur utilisé) |
| Backend | Un endpoint de santé applicatif (ex. Spring Boot Actuator `/actuator/health`) — attention aux indicateurs de santé automatiques qui dépendent d'un service externe non critique (ex. un indicateur de santé mail qui dépend de la disponibilité du serveur SMTP) : désactiver ceux dont l'indisponibilité ne doit pas sortir le service de la rotation, sans quoi une panne d'un composant secondaire fait échouer le healthcheck de toute l'application. |
| Frontend (nginx inner) | Un endpoint dédié (ex. `/health` retournant `200`) qui ne dépend d'aucune ressource externe — jamais un endpoint qui transite par le backend. |

`depends_on: condition: service_healthy` séquence le démarrage (base → backend → frontend) —
sans ça, un service peut démarrer avant que sa dépendance soit réellement prête à répondre.

---

## Réseaux Docker — segmentation explicite

Séparer les services par réseau selon qui a besoin de parler à qui, plutôt qu'un unique réseau par
défaut partagé par tout le monde :

- Base de données : joignable uniquement par le backend.
- Backend : joignable par le frontend (proxy interne) et la base de données — jamais publié
  directement (voir « Ports » ci-dessus).
- Frontend : seul service dont le port est destiné à être atteint depuis l'extérieur du réseau
  Docker (par nginx outer).

Cette segmentation garantit qu'un frontend compromis ne peut pas atteindre directement la base de
données, même sans dépendre du filtrage réseau externe au serveur.

---

## CI — build et publication des images

À chaque push sur la branche principale : tests, puis build + publication des images sur le
registre, taguées avec le SHA du commit (traçabilité exacte) et `latest` (dernière version de la
branche principale) — un tag de version supplémentaire sur un tag Git (`v*`) si une release est
publiée. Sur une pull request, seuls les tests tournent — jamais de publication d'image depuis une
PR (évite d'exposer les identifiants du registre à du code non encore revu).

Le déploiement (CD — appliquer la nouvelle image sur le serveur) reste une étape séparée, à ne
mettre en place qu'une fois le besoin confirmé (`docker compose pull && up -d` manuel au minimum,
automatisation ensuite si nécessaire).

---

## Variables d'environnement

| Variable | Portée | Description |
|---|---|---|
| Identifiants base de données | `.env` racine, service base de données | Repris tels quels par le service backend |
| Nom d'utilisateur/organisation du registre d'images, tags | `.env` racine | Détermine quelle image chaque service tire (`<registre>/<projet>-backend:<tag>`) |
| Ports publiés sur l'hôte | `.env` racine | Un par service publié, toujours lié à `127.0.0.1` (voir plus haut) |
| Endpoints externes obligatoires du projet | `.env` racine (Docker) ou `backend/.env` (local) | Toute intégration externe requise par le projet — voir sa propre documentation |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `backend/.env` (développement local hors Docker uniquement) | Connexion à la base — en Docker, ces valeurs sont injectées directement par `docker-compose.yml` |

Aucune de ces variables n'a de valeur par défaut dans la configuration applicative
(`conventions/configuration.md`) — l'application refuse de démarrer si l'une d'elles manque.

---

## Backup — à prévoir, jamais improvisé dans le Compose de production

Un volume de données persistant protège contre le redémarrage/la recréation d'un conteneur — ce
n'est **pas** un backup, et ne protège ni d'une suppression du volume, ni d'une corruption, ni d'une
erreur humaine. Un vrai backup (indépendant du volume, stockable hors du serveur, fréquence et
rétention configurables) doit être prévu, mais seulement une fois le besoin réel confirmé (fréquence,
rétention, destination) — ne pas ajouter un service de backup au Compose de production par
anticipation (`conventions/architecture.md`) ; documenter le plan (voir le `docs/deployment.md` du
projet concerné) en attendant.

---

## Ce qui n'existe pas forcément

- Un secrets manager dédié — `.env` convient à de nombreux projets ; à revoir si l'infrastructure de
  déploiement en offre un plus robuste (`conventions/security.md`).
- CD automatisé — voir « CI » ci-dessus.
- Backup implémenté — voir ci-dessus.
