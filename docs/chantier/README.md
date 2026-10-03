# Module Chantier

> Référentiel des chantiers de Staport. Les chantiers manquants sont **ajoutés** par une synchronisation
> quotidienne depuis l'ERP source (`webServiceBS/getChantiers`) ; toute modification se fait ensuite depuis
> l'interface. Consommé par le domaine Employé (affectation), par Paie (snapshot du bulletin et regroupement des
> exports) et, à terme, par Pointage.

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
    ├── ChantierSyncTransactionalOperations.java ← création si absent, une transaction par ligne
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
| `designation` | `VARCHAR(500)` | nullable | Libellé descriptif — repris de l'ERP à la **création** du chantier, jamais réécrit ensuite |
| `nom` | `VARCHAR(255)` | nullable | Nom optionnel, distinct de `designation` — **jamais exposé ni modifié par la synchronisation ERP** (ajouté le 2026-09-29, migration `V5__add_chantier_nom.sql`), uniquement saisi/modifié manuellement via le formulaire. Affiché par le rapport PDF/l'export Excel de la paie sous la forme `"CHANTIER : <nom> (<code>)"` quand renseigné, `"CHANTIER : <code>"` sinon (voir `docs/report/README.md`, « Identifiant chantier ») |
| `source_erp` | `BOOLEAN` | `NOT NULL`, défaut `false` | Vrai si le chantier a été **créé** par la synchronisation ERP (information d'origine, sans effet sur la suite) |
| `actif` | `BOOLEAN` | `NOT NULL`, défaut `true` | Faux = désactivé — jamais modifié par la synchronisation (voir « Règles métier ») |

Index : `idx_chantier_actif` (statut), `idx_chantier_source_erp`.

---

## Règles métier

- `code` est la clé métier, unique, insensible à la casse (`existsByCodeIgnoreCase` pour le contrôle,
  `findByCodeIgnoreCase` pour la recherche).
- À la création manuelle, `code` et `designation` sont obligatoires (`designation` : 500 caractères au plus) ;
  `nom` est facultatif (255 caractères au plus). Voir « Qualité des données » dans [TODO.md](../../TODO.md).
- La synchronisation **ajoute uniquement les chantiers manquants** (décision du 2026-10-03 : toute
  modification d'un chantier se fait depuis l'UI) :
  - un `code` absent de la base (comparaison insensible à la casse) crée un chantier actif
    (`source_erp = true`, `designation` issue de l'ERP) ;
  - un `code` déjà présent (créé manuellement ou issu d'une synchronisation précédente) n'est **jamais
    modifié** : ni `designation`, ni `actif`, ni `source_erp`, ni `nom` — il est simplement compté dans
    `dejaPresents` ;
  - un chantier absent d'un import ERP **conserve son état**, il n'est jamais désactivé ni supprimé.
- `actif` et `nom` ne sont donc modifiables que par la saisie manuelle (`PUT /chantiers/{id}`,
  formulaire `ChantierFormComponent`) ; l'ERP n'expose de toute façon ni statut ni `nom`
  (seulement `id_chantier`, `code`, `designation`, `CodeErreur`).
- Seuls les chantiers **actifs** sont proposés à l'import Excel des employés et de la paie (un chantier
  inactif reste consultable et reste référencé par l'historique).
- La suppression (`DELETE /chantiers/{id}`) est bloquée (409) si le chantier est référencé par au
  moins un employé ou un bulletin de paie (clés étrangères `employe.chantier_id` et `paie.chantier_id`) :
  désactiver (`actif = false`) est l'alternative.

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
     le **seul** filtre appliqué avant création — `CodeErreur` (champ d'erreur de ligne côté ERP)
     n'est **pas** utilisé : une ligne avec `CodeErreur != 0` est traitée exactement comme une ligne
     à `0`.
   - Sinon, `ChantierSyncTransactionalOperations.creerSiAbsent` est appelé (**une transaction par ligne**,
     retourne `true` si le chantier a été créé : `crees`, sinon `dejaPresents`). Si la création lève une
     `DataIntegrityViolationException` (ex. contrainte unique violée), la ligne est comptée dans
     `ignores`.
3. Journaliser un résumé (`INFO`, compteurs `totalRecus`/`crees`/`dejaPresents`/`ignores`) et enregistrer
   les métriques.

**Aucune désactivation automatique** : un chantier `source_erp = true` dont le `code` n'apparaît pas
dans un import ERP (qu'il ait disparu de l'ERP, ou que sa ligne ait un `code` manquant) conserve
simplement son état précédent — la synchronisation ne fait jamais que créer, jamais modifier ni
désactiver.

### Pourquoi une transaction par ligne ?

Catcher une `DataIntegrityViolationException` au milieu d'une transaction JPA partagée peut laisser
la session Hibernate dans un état inutilisable pour la suite du lot. `ChantierSyncTransactionalOperations`
est donc un bean séparé dont la méthode `creerSiAbsent` est `@Transactional` indépendamment pour chaque
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
| `/chantiers` | `ChantierListComponent` | Tableau standard (tri, colonnes redimensionnables/réordonnables/masquables, pagination, voir [../frontend/README.md](../frontend/README.md)) avec filtres en temps réel (code, désignation, statut), suppression, bouton « Synchroniser maintenant » |
| `/chantiers/new` | `ChantierFormComponent` | Création |
| `/chantiers/:id` | `ChantierDetailComponent` | Consultation (code, désignation, nom, statut, source) |
| `/chantiers/:id/edit` | `ChantierFormComponent` | Modification (code, désignation, nom, statut) — un chantier issu de l'ERP se modifie exactement comme un autre : la synchronisation ne le touche plus |

Colonnes du tableau : Code, Nom, Désignation, Source (ERP ou manuel), Statut. Accès via la barre latérale
(`core/navigation/nav-items.ts`, entrée « Chantiers », permission `CHANTIER_READ`). Les boutons de création,
modification, suppression et synchronisation sont conditionnés par `CHANTIER_WRITE`, `CHANTIER_DELETE` et
`CHANTIER_SYNC` (voir [../rbac/chantier.md](../rbac/chantier.md)).

Le référentiel chantier est également consommé par les formulaires/filtres Employee et Paie
(`shared/reference-data/chantier-reference.service.ts`, implémentation du contrat de pagination
attendu par le sélecteur générique `shared/components/lazy-select` — voir `conventions/frontend.md`,
section Sélecteurs) pour la sélection d'affectation (simple) et le filtrage de liste (multiple).

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- **Pas de mise à jour depuis l'ERP** : si la désignation d'un chantier change dans l'ERP, elle ne change pas ici
  (décision du 2026-10-03). Un chantier supprimé ou désactivé dans l'ERP reste tel quel.
- **Qualité des données** : `nom` et `designation` ne sont pas obligatoires en base (la désignation l'est à la
  saisie) ; tâche dédiée dans le TODO.
- Aucun audit (Hibernate Envers) — les créations/modifications de chantiers ne sont pas tracées
  au-delà des logs applicatifs.
- Les métriques de synchronisation sont enregistrées mais pas encore exportées (aucun Prometheus configuré, voir
  [../architecture.md](../architecture.md)).
