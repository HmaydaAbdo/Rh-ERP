# Module Chantier

> Référentiel des chantiers de Staport. Alimenté principalement par synchronisation quotidienne
> depuis l'ERP source (`webServiceBS/getChantiers`), consommé par le domaine Employee (affectation
> d'un employé à un chantier) et, à terme, par Pointage et Paie.

---

## Vue d'ensemble

| | |
|---|---|
| Backend | `backend/src/main/java/staport/rh/chantier/` |
| Frontend | `frontend/src/app/portail/chantier/` |
| Table | `chantier` |
| Endpoints | `/chantiers`, `/chantiers/search`, `/chantiers/sync` |
| Source externe | ERP Staport — `GET {CHANTIER_SYNC_BASE_URL}` |

Le module suit l'architecture de référence du projet (`conventions/architecture.md`) :
`entities → repositories → specifications → dtos → mappers → services → controller`, avec un
sous-module `sync/` dédié à l'intégration ERP.

```text
chantier/
├── controller/ChantierController.java
├── dtos/
│   ├── request/ (Create, Update, SearchCriteria)
│   └── response/ChantierResponseDto.java
├── entities/Chantier.java
├── exceptions/ (NotFound, AlreadyExists, ExceptionHandler)
├── mappers/ChantierMapper.java
├── repositories/ChantierRepository.java
├── services/ (ChantierService + IChantierService)
├── specifications/ChantierSpecification.java
└── sync/
    ├── ChantierErpDto.java                    ← forme brute de la réponse ERP
    ├── ChantierSyncClient.java                ← appel HTTP à l'ERP
    ├── ChantierSyncTransactionalOperations.java ← upsert, une transaction par ligne
    ├── ChantierSyncService.java                ← orchestration, logs, métriques
    ├── ChantierSyncScheduler.java               ← déclenchement quotidien (@Scheduled)
    ├── ChantierSyncController.java              ← déclenchement manuel (POST /chantiers/sync)
    ├── ChantierSyncMetrics.java                 ← compteurs/timer Micrometer
    └── ChantierSyncResultDto.java
```

---

## Modèle de données

Table `chantier` :

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `BIGINT` | PK, auto-incrément | Identifiant interne |
| `code` | `VARCHAR(100)` | `NOT NULL`, **unique** | Clé métier du chantier (ex. `C079`) |
| `designation` | `VARCHAR(500)` | nullable | Libellé descriptif — synchronisé depuis l'ERP, écrasé à chaque synchronisation |
| `nom` | `VARCHAR(255)` | nullable | Nom optionnel, distinct de `designation` — **jamais exposé ni modifié par la synchronisation ERP** (ajouté le 2026-09-29, migration `V5__add_chantier_nom.sql`), uniquement saisi/modifié manuellement via le formulaire. Affiché par le rapport PDF/l'export Excel de la paie sous la forme `"CHANTIER : <nom> (<code>)"` quand renseigné, `"CHANTIER : <code>"` sinon (voir `docs/report/README.md`, « Identifiant chantier ») |
| `source_erp` | `BIT` | `NOT NULL`, défaut `false` | Vrai si géré par la synchronisation ERP |
| `actif` | `BIT` | `NOT NULL`, défaut `true` | Faux = désactivé — jamais modifié par la synchronisation (voir « Règles métier ») |

Index : `idx_chantier_actif` (statut), `idx_chantier_source_erp`.

---

## Règles métier

- `code` est la clé métier, unique, insensible à la casse (`findByCodeIgnoreCase`).
- La synchronisation est un **simple upsert par `code`**, sans filtrage ni désactivation :
  - un chantier créé manuellement (`source_erp = false`) n'est jamais touché tant que son `code`
    n'apparaît pas dans un import ERP ;
  - un `code` synchronisé qui coïncide avec un chantier déjà existant (manuel ou non) est repris :
    `designation` est écrasée, `source_erp` passe à `true` — comportement "code-first" assumé par
    défaut, faute de règle métier explicite fournie (voir [TODO.md](../../TODO.md)) ;
  - un chantier absent d'un import ERP **conserve son état précédent**, il n'est jamais désactivé
    ni modifié par la synchronisation.
- `actif` n'est jamais modifié par `upsert` sur un chantier déjà existant — seule la **création**
  applique `actif = true` (valeur par défaut de l'entité). L'ERP n'expose aucun champ actif/statut
  (seulement `id_chantier`, `code`, `designation`, `CodeErreur`), donc un chantier désactivé
  manuellement ne peut jamais être réactivé silencieusement par la synchronisation. La seule façon de
  changer `actif` est la modification manuelle (`PUT /chantiers/{id}`, formulaire `ChantierFormComponent`).
- `nom` suit le même principe que `actif` : `upsert` ne le touche jamais, dans aucun cas (ni création
  ni mise à jour) — l'ERP ne l'expose pas du tout, donc rien à réconcilier. Uniquement modifiable via
  le formulaire (`PUT /chantiers/{id}`).
- La suppression (`DELETE /chantiers/{id}`) est bloquée (409) si le chantier est référencé par au
  moins un employé (contrainte de clé étrangère `employe.chantier_id`).

---

## API

Toutes les routes sont sous `/chantiers`. Authentification JWT + permissions requises sur chaque
endpoint (`CHANTIER_READ`/`CHANTIER_WRITE`/`CHANTIER_DELETE`/`CHANTIER_SYNC`) — voir
`docs/rbac/chantier.md` pour le détail endpoint ↔ permission et `conventions/security.md` pour la
conception du RBAC.

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/chantiers` | Créer un chantier manuellement | 201, 400, 409 |
| `PUT` | `/chantiers/{id}` | Modifier un chantier | 200, 400, 404, 409 |
| `GET` | `/chantiers/{id}` | Consulter un chantier | 200, 404 |
| `POST` | `/chantiers/search` | Rechercher (paginé, triable) — body `ChantierSearchCriteria` (`code`, `designation`, `actif`) | 200 |
| `DELETE` | `/chantiers/{id}` | Supprimer (bloqué si référencé par un employé) | 204, 404, 409 |
| `POST` | `/chantiers/sync` | Déclencher une synchronisation ERP immédiate | 200 |

`ChantierResponseDto` : `id`, `code`, `designation`, `nom`, `sourceErp`, `actif`.

---

## Synchronisation ERP

### Déclenchement

- **Automatique** : tous les jours à 23h00 (`chantier.sync.cron` dans `application.yml`, cron
  `"0 0 23 * * *"`, fuseau horaire du serveur), via `ChantierSyncScheduler` (`@Scheduled`,
  `@EnableScheduling` activé dans `staport.rh.common.config.SchedulingConfig`).
- **Manuel** : `POST /chantiers/sync` (bouton "Synchroniser maintenant" dans l'UI). Utile pour
  vérifier immédiatement sans attendre 23h.

### Algorithme (`ChantierSyncService`)

1. Récupérer la liste complète via `ChantierSyncClient` (`GET {base-url}`, réponse JSON brute
   désérialisée en `List<ChantierErpDto>`).
2. Pour chaque ligne :
   - `code` manquant/vide → ligne ignorée, `WARN` journalisé, compteur `ignores` incrémenté. C'est
     le **seul** filtre appliqué avant upsert — `CodeErreur` (champ d'erreur de ligne côté ERP)
     n'est **pas** utilisé : une ligne avec `CodeErreur != 0` est traitée exactement comme une ligne
     à `0`.
   - Sinon, `ChantierSyncTransactionalOperations.upsert` est appelé (**une transaction par ligne**,
     retourne un booléen `isNew` qui alimente `crees`/`misAJour`). Si l'upsert lève une
     `DataIntegrityViolationException` (ex. contrainte unique violée), la ligne est comptée dans
     `ignores`.
3. Journaliser un résumé (`INFO`, compteurs `totalRecus`/`crees`/`misAJour`/`ignores`) et enregistrer
   les métriques.

**Aucune désactivation automatique** : un chantier `source_erp = true` dont le `code` n'apparaît pas
dans un import ERP (qu'il ait disparu de l'ERP, ou que sa ligne ait un `code` manquant) conserve
simplement son état précédent — la synchronisation ne fait jamais que créer ou mettre à jour, jamais
désactiver.

### Pourquoi une transaction par ligne ?

Catcher une `DataIntegrityViolationException` au milieu d'une transaction JPA partagée peut laisser
la session Hibernate dans un état inutilisable pour la suite du lot. `ChantierSyncTransactionalOperations`
est donc un bean séparé dont la méthode `upsert` est `@Transactional` indépendamment pour chaque
appel, réalisé depuis `ChantierSyncService` (qui, lui, n'est pas transactionnel) — un échec sur une
ligne reste isolé et n'affecte pas les lignes suivantes.

### Métriques (Micrometer)

| Métrique | Type | Description |
|---|---|---|
| `rh.chantier.sync.success` | Counter | Synchronisations réussies |
| `rh.chantier.sync.failure` | Counter | Synchronisations échouées (ex. ERP injoignable) |
| `rh.chantier.sync.records.ignored` | Counter | Lignes ERP ignorées (code manquant ou conflit d'intégrité, cumulé) |
| `rh.chantier.sync.duration` | Timer | Durée d'une synchronisation |

### Configuration requise

Variable d'environnement **obligatoire** (l'application refuse de démarrer si elle est absente,
conformément à `conventions/security.md`) :

```bash
CHANTIER_SYNC_BASE_URL=http://staport.dyndns.org/webServiceBS/getChantiers
```

Voir `backend/.env.example`.

---

## Frontend

Routes sous `/chantiers` (lazy loading, `chantier.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/chantiers` | `ChantierListComponent` | Liste paginée, recherche (code, désignation, statut), tri, suppression, bouton de synchronisation manuelle |
| `/chantiers/new` | `ChantierFormComponent` | Création |
| `/chantiers/:id` | `ChantierDetailComponent` | Consultation (code, désignation, nom, statut, source) |
| `/chantiers/:id/edit` | `ChantierFormComponent` | Modification (y compris `nom`) — un bandeau avertit si le chantier provient de l'ERP (le code/la désignation seront écrasés à la prochaine synchronisation, `nom` jamais concerné) |

Accès via la barre latérale de l'application (`app.component.ts`, entrée "Chantiers").

Le référentiel chantier est également consommé par les formulaires/filtres Employee et Paie
(`shared/reference-data/chantier-reference.service.ts`, implémentation du contrat de pagination
attendu par le sélecteur générique `shared/components/lazy-select` — voir `conventions/frontend.md`,
section Sélecteurs) pour la sélection d'affectation (simple) et le filtrage de liste (multiple).

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- Aucune limite liée à l'authentification : tous les endpoints requièrent un JWT valide et la
  permission adéquate (voir `docs/rbac/chantier.md`).
- Aucun audit (Hibernate Envers) — les créations/modifications de chantiers ne sont pas tracées
  au-delà des logs applicatifs.
- Aucune limite liée à la persistance : le schéma est géré par Flyway et les données survivent aux
  redémarrages (`ddl-auto=validate`, voir `conventions/database.md`).
