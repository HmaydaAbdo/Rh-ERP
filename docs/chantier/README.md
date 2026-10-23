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

- `code` est la clé métier : le service et la synchronisation retirent les espaces extérieurs. V27
  impose l'unicité après trim et sans tenir compte de la casse, au moyen d'un index sur
  `UPPER(BTRIM(code))`, et bloque les nouvelles valeurs entourées d'espaces en base. Les collisions
  existantes font échouer V27 pour être résolues explicitement, sans fusion implicite.
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
- **Statut** (décision du propriétaire, 2026-10-19). L'interface dit **« En cours »** (`actif = true`) et **« Clôturé »**
  (`actif = false`) ; l'API et la base gardent le booléen `actif`. Depuis la liste et depuis la fiche, **« Clôturer »** et
  **« Rouvrir »** (avec confirmation, droit `CHANTIER_WRITE`) changent le statut ; le formulaire de modification garde aussi le
  champ. Un chantier clôturé reste consultable et reste référencé par l'historique.
- Seuls les chantiers **en cours** sont acceptés par l'import Excel des employés. L'assistant d'import de la paie signale à
  part un chantier **clôturé** que le fichier cite (« Chantiers clôturés ») et propose **« Rouvrir le chantier »**
  (`CHANTIER_READ` et `CHANTIER_WRITE`) : le chantier est rouvert puis le même fichier est réanalysé, sans le corriger.
- **Reprise V31 (2026-10-19)** : les chantiers qu'aucun bulletin de paie ne cite sont passés « Clôturés » une fois pour
  toutes (voir [../data-model.md](../data-model.md)). Ce n'est pas une règle permanente : un chantier créé ensuite reste en
  cours tant qu'on ne le clôture pas.
- Modifier le `code` d'un chantier (`PUT`) le change partout, historique de paie compris : **décision du propriétaire
  (2026-10-23), ce comportement est conservé** ; c'est le moyen de corriger une faute de saisie.
- La suppression (`DELETE /chantiers/{id}`) est bloquée (409) si le chantier est référencé par au
  moins un employé ou un bulletin de paie (clés étrangères `employe.chantier_id` et `paie.chantier_id`) :
  clôturer (`actif = false`) est l'alternative.

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

L'adaptateur impose un délai de connexion de 5 secondes et un délai de lecture de 30 secondes
(`chantier.sync.connect-timeout` et `chantier.sync.read-timeout`). Une erreur réseau est remontée
à la synchronisation, sans retry automatique : l'export complet sera repris par l'exécution planifiée
suivante ou par un déclenchement manuel, ce qui évite de rejouer partiellement une opération métier.

Voir `backend/.env.example`.

---

## Frontend

Routes sous `/chantiers` (lazy loading, `chantier.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/chantiers` | `ChantierVuesComponent` + `ChantierListComponent` | Coque commune (titre, onglets de vue, actions Synchroniser maintenant / Nouveau chantier, filtres code, désignation et statut dans l'URL), tableau standard (tri, colonnes redimensionnables/réordonnables/masquables, pagination, voir [../frontend/README.md](../frontend/README.md)), clôture / réouverture et suppression |
| `/chantiers/cartes` | `ChantierCartesComponent` | **Cartes par descente libre** : une carte par chantier (code, nom ou désignation, statut), puis « Regrouper par » équipe, fonction ou employés ; fiches Employé et paie du mois sur chaque carte |
| `/chantiers/analytique` | `ChantierAnalytiqueComponent` | **Analytique graphique** : chiffres de la paie, évolution mensuelle, répartition (STC compris), tranches, mouvements, et fiches Employé |
| `/chantiers/new` | `ChantierFormComponent` | Création |
| `/chantiers/:id` | `ChantierDetailComponent` | Consultation (code, désignation, nom, statut, source) |
| `/chantiers/:id/edit` | `ChantierFormComponent` | Modification (code, désignation, nom, statut) — un chantier issu de l'ERP se modifie exactement comme un autre : la synchronisation ne le touche plus |

Les trois vues (Tabulaire, Cartes, Analytique) utilisent `app-collection-shell` et `app-collection-table` pour leur structure commune, puis suivent le [pattern frontend des trois vues](../../conventions/frontend.md), comme
[Équipe](../equipe/README.md) et [Fonction](../function/README.md). Les filtres code, désignation et statut restent dans l'URL et
**agissent de la même façon dans les trois vues** (même recherche serveur). La synchronisation et la création vivent dans
l'en-tête commun (`ChantierActionsComponent`) : une synchronisation réussie recrée la vue affichée. La carte géographique
(`/carte`, droit `CARTE_READ`) reste un écran séparé, décrit dans [carte.md](carte.md).

**Cartes et Analytique sont les vues partagées par tous les modules** ([Vues Cartes et Analytique partagées](../frontend/vues-perimetre.md), ADR 0011) : `ChantierCartesComponent` et
`ChantierAnalytiqueComponent` ne sont que des hôtes minces ; `chantier-module.ts` décrit le module (référentiel de chantiers avec
leur statut, filtres code, désignation et statut, ordre de descente chantier → équipe → fonction). Les liens avec les autres
domaines passent par les services existants, sans endpoint propre :

- l'effectif vient du regroupement des fiches Employé et représente le **dernier état importé** de chaque fiche (`EMPLOYEE_READ`) ;
- la masse, l'effectif payé, le coût moyen, les STC et l'historique mensuel viennent de l'analyse Paie par période
  (`POST /paie/analytique`) (`PAIE_READ`) ;
- le chantier d'une **fiche** (état le plus récent) et celui d'un **bulletin** (chantier du mois) sont deux informations distinctes ;
- un mois sans bulletin pour le chantier choisi affiche des indicateurs à zéro avec un message explicite et conserve l'historique
  des autres mois ; un chantier clôturé reste une carte, avec sa pastille « Clôturé » ;
- sans `EMPLOYEE_READ` ou sans `PAIE_READ`, le bloc concerné est masqué et son service n'est pas appelé.

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
- Audité (voir [../audit/README.md](../audit/README.md)) : chaque création, modification et suppression de chantier, et chaque
  synchronisation (une entrée pour l'ensemble, une révision par chantier créé), sont tracées ; la synchronisation planifiée
  est attribuée à « Système », d'origine `TACHE_PLANIFIEE`.
- Les métriques de synchronisation (`rh.chantier.sync.*`) sont exposées par `/actuator/prometheus` (voir
  [../architecture.md](../architecture.md)).
