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

## Les couches du domaine

Chantier est à la fois un référentiel géré à la main, un référentiel **alimenté par l'ERP source** et le futur support
de la carte géographique. Il traverse trois couches, décrites ici de bout en bout pour pouvoir être relues et
commentées séparément.

| Couche | Rôle pour Chantier | Où lire |
|---|---|---|
| **Application** | Créer, modifier, clôturer, rouvrir, rechercher et supprimer les chantiers ; les synchroniser depuis l'ERP ; fournir le référentiel aux fiches Employé et aux bulletins | [Couche application](#couche-application) |
| **Analytique** | Lire la paie du dernier mois **par chantier** (Cartes, Analytique) ; la carte géographique prépare le placement des chantiers | [Couche analytique](#couche-analytique) |
| **IA** | Laisser l'assistant retrouver un chantier et interroger la paie ou les effectifs par chantier, en lecture seule | [Couche IA](#couche-ia) |

### Couche application

**Backend** (`backend/src/main/java/staport/rh/chantier/`)

- **Contrôleurs.** `ChantierController` (`/chantiers`) et `ChantierSyncController` (`POST /chantiers/sync`). Chaque route
  porte `@PreAuthorize` sur sa permission : `CHANTIER_READ` (lecture, recherche), `CHANTIER_WRITE` (création,
  modification, clôture, réouverture), `CHANTIER_DELETE`, `CHANTIER_SYNC`.
- **Service.** `ChantierService`, exposé aux autres domaines par la façade `IChantierService` (`findById`, `search`,
  `existsById`). À la création et à la modification il retire les espaces extérieurs du code, refuse un code déjà
  pris sans tenir compte de la casse (`ChantierAlreadyExistsException`, en excluant le chantier courant) et compare la
  version reçue à la version stockée à la modification.
- **Statut.** L'interface dit « En cours » / « Clôturé » ; l'API et la base portent le booléen `actif`. Clôturer et
  rouvrir sont des modifications de `actif` (droit `CHANTIER_WRITE`) ; un chantier clôturé reste consultable et
  référencé par l'historique.
- **Recherche.** `ChantierSpecification` : `code` et `designation` en « contient » sans casse (échappement des
  caractères spéciaux), `actif` en égalité, `recherche` dans le code, le nom **ou** la désignation ; les filtres se
  combinent par ET.
- **Suppression.** Refusée (`409`) tant qu'un employé (`employe.chantier_id`) ou un bulletin (`paie.chantier_id`)
  référence le chantier ; l'alternative est la clôture.
- **Audit.** L'entité est `@Audited` (Envers) ; les écritures portent `@AuditableAction` (`CHANTIER_CREATION`,
  `CHANTIER_MODIFICATION`, `CHANTIER_SUPPRESSION`) ; chaque synchronisation est auditée par
  `PerimetreSynchronisationChantier` (une entrée pour l'ensemble, une révision par chantier créé), la planifiée étant
  attribuée à « Système » (origine `TACHE_PLANIFIEE`). Les lectures de l'assistant ont leurs propres entrées
  (`MCP_CHANTIER_*`).
- **Synchronisation ERP** (`sync/`). `ChantierSyncClient` (délais 5 s de connexion, 30 s de lecture, sans nouvel essai),
  `ChantierSyncService` (orchestration, journaux, métriques), `ChantierSyncTransactionalOperations` (une transaction par
  ligne, pour qu'une violation d'intégrité reste isolée), `ChantierSyncScheduler` (tous les jours à 23 h),
  `ChantierSyncMetrics` (`rh.chantier.sync.*`). Elle **ajoute seulement** les chantiers manquants ; elle ne modifie, ne
  désactive et ne supprime jamais rien (détail dans [Synchronisation ERP](#synchronisation-erp)).
- **Base de données.** `V2` crée la table ; `V5` ajoute `nom` et `V6` le sème ; `V24` puis `V27` imposent l'unicité du
  code sans casse et sans espaces extérieurs ; `V28` crée la permission `CARTE_READ` ; `V31` (2026-10-19) puis `V35`
  (2026-10-24) ont clôturé, une seule fois, les chantiers absents des bulletins puis ceux absents de la **dernière paie**
  (sans paie en base, `V35` ne change rien).

**Frontend** (`frontend/src/app/portail/chantier/`)

- **Routes** (chargement à la demande, `permissionGuard`) : `/chantiers`, `/chantiers/cartes`, `/chantiers/analytique` et
  `/chantiers/:id` (`CHANTIER_READ`) ; `/chantiers/new` et `/chantiers/:id/edit` (`CHANTIER_WRITE`) ; la carte
  géographique `/carte` est une route de premier niveau protégée par `CARTE_READ`.
- **Composants.** `chantier-vues` (coque partagée), `chantier-list` (tableau, clôture/réouverture, suppression),
  `chantier-form`, `chantier-detail`, `chantier-actions` (Synchroniser maintenant, Nouveau chantier),
  `chantier-filtres` (code, désignation, statut conservés dans l'URL), `chantier-cartes` et `chantier-analytique`
  (hôtes minces des vues partagées), `carte/` (écran cartographique, voir [carte.md](carte.md)).
- **Service.** `chantier.service.ts` appelle l'API ; `shared/reference-data/chantier-reference.service.ts` alimente les
  sélecteurs génériques (affichage « code · nom », désignation en repli si le nom manque).
- **Assistant d'import Paie.** Il signale un chantier **clôturé** cité par un fichier et propose « Rouvrir le
  chantier » (`CHANTIER_READ` et `CHANTIER_WRITE`) avant de réanalyser ; l'import Excel des employés n'accepte que des
  chantiers en cours.

### Couche analytique

Les vues Cartes et Analytique ne sont pas propres à Chantier : ce sont des composants partagés (`portail/perimetre/`,
[référence technique](../frontend/vues-perimetre.md)) que le module configure dans `chantier-module.ts`. La carte
géographique est un écran distinct.

| Réglage du module | Valeur pour Chantier | Effet |
|---|---|---|
| Dimension | `CHANTIER` | L'unité de regroupement est le chantier |
| Parcours des Cartes | Chantier → Équipe → Fonction | Descente fixe |
| Sources | `PAIE` seule | Aucun chiffre ne vient des fiches Employé |
| Période | Dernier mois de paie enregistré, non modifiable | Pas de sélecteur de période |
| Tri des cartes | Masse salariale décroissante, puis effectif | Les chantiers les plus coûteux d'abord |
| Statut | Pastille « En cours » / « Clôturé » sur chaque carte | Un chantier clôturé garde sa carte |
| Qualité | Section dédiée de l'Analytique | Anneau des bulletins sans équipe ; filtres Fonction et Équipe (dont « Orphelins ») |

**Source unique des chiffres.** `POST /paie/analytique` (`PAIE_READ`) renvoie `PaieAnalytiqueDto`, dont `parChantier`
(`id`, `code`, `libelle`, `masse`, `effectif`, `stc`, `stcMontant`) liste **tous** les chantiers du mois, sans plafond ; `evolution`
couvre tout l'historique du périmètre ; `moisPrecedent` sert à la comparaison ; `kpis.nombreChantiers` compte les
chantiers présents dans la paie du mois.

**Définitions des indicateurs**

| Indicateur | Définition |
|---|---|
| Effectif | Personnes payées dans le mois (un bulletin par employé et par mois) |
| Masse salariale | Somme des salaires totaux des bulletins du mois, en DH |
| STC (personnes / DH) | Bulletins en solde de tout compte ou sortie ce mois-là (règle du rapport de paie) et leur montant |
| Variation | Écart en personnes et en pourcentage par rapport au mois calendaire précédent ; indisponible sans paie ce mois-là |

**Règles de lecture à connaître**

- Le chantier analysé est celui **du bulletin du mois**, pas celui de la fiche Employé : l'affectation actuelle d'un
  employé ne réécrit pas les mois passés.
- Un chantier sans bulletin dans le mois récent garde sa carte, avec des indicateurs à zéro et son historique.
- L'état « Clôturé » vient de la fiche Chantier ; il n'est **pas** déduit de la paie (sauf par la reprise unique `V35`).
- Le libellé affiché est le nom s'il existe, sinon la désignation, avec le code en repère.
- Les graphiques et les cartes s'exportent séparément en PDF ; sans `PAIE_READ`, aucune donnée de paie n'est demandée.

**Carte géographique** (`/carte`, `CARTE_READ`, [carte.md](carte.md)) : écran à part. Aujourd'hui elle affiche le fond de
carte seul (monde entier, relief, satellite, vue 3D) et **aucune donnée de chantier** ; le contrat de données, les marqueurs
et les indicateurs sont les étapes 3 à 5, à faire.

### Couche IA

L'assistant RH n'accède à Chantier que par des **outils MCP de lecture** exposés par le backend (Spring AI) ; il n'écrit
rien (ni création, ni clôture, ni synchronisation), n'exécute aucun SQL et ne voit que ce que l'utilisateur connecté
peut voir.

| Outil | Ce qu'il fait | Permission | Audit |
|---|---|---|---|
| `chantier_rechercher` | Trouve des chantiers par texte partiel du code, du nom ou de la désignation, filtrés par statut `EN_COURS` ou `CLOTURE` (1 à 20 résultats, 10 par défaut, total rendu) | `CHANTIER_READ` | `MCP_CHANTIER_RECHERCHER` |
| `chantier_fiche` | Lit code, désignation, nom, origine ERP et statut d'un chantier par identifiant | `CHANTIER_READ` | `MCP_CHANTIER_FICHE` |
| `paie_repartition` (`dimension = CHANTIER`) | Masse, effectif et STC par chantier pour un mois (50 groupes au plus) | `PAIE_READ` | `MCP_PAIE_REPARTITION` |
| `paie_indicateurs` | Indicateurs du mois et `principauxChantiers` | `PAIE_READ` | `MCP_PAIE_INDICATEURS` |
| `employes_rechercher`, `employes_compter`, `employes_regrouper`, `paie_periodes`, `paie_evolution`, `paie_mouvements`, `paie_qualite`, `paie_bulletins_rechercher` | Filtre `chantierIds` | permission de l'outil (`EMPLOYEE_READ` ou `PAIE_READ`) | `MCP_*` |

- **Résolution par nom.** Quand la question cite un chantier par son nom ou son code, l'agent appelle d'abord
  `chantier_rechercher`, puis réutilise l'identifiant comme filtre ; il ne devine jamais un identifiant.
- **Exactitude.** Chaque nombre de la réponse (et de la surface A2UI éventuelle) doit venir d'un résultat d'outil du même
  tour ; sinon la réponse est réécrite une fois, puis remplacée par une abstention.
- **Sur l'écran.** Sur `/chantiers`, l'assistant reçoit le domaine et les filtres de l'écran et propose « Chantiers en
  cours » et « Chantiers les plus gros ».
- **Limites actuelles.** Les données exposées sont celles que la permission autorise, sans périmètre par fiche de
  poste (prévu au jalon J2 de [ia.md](../ia.md)) ; l'ouverture automatique de l'écran correspondant est retirée. La
  synchronisation ERP ne peut être déclenchée que par un utilisateur (`CHANTIER_SYNC`), jamais par l'assistant.


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
- **Reprises V31 et V35** : V31 a clôturé les chantiers qu'aucun bulletin ne citait. V35 applique la règle métier confirmée
  le 2026-10-24 : la dernière période de paie enregistrée est la référence; les chantiers encore en cours mais absents de
  cette période sont clôturés, même s'ils ont des bulletins historiques. Si aucune paie n'existe, V35 ne modifie rien.
  Cette migration est une reprise unique; l'absence d'un chantier dans une paie ultérieure ne le clôture pas automatiquement.
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

### DTO exposés

| Contrat | Champs (type) | Contraintes et sens |
|---|---|---|
| `ChantierCreateRequestDto` | `code: String`, `designation: String`, `nom: String?` | Code requis (100 caractères maximum), désignation requise (500 maximum), nom facultatif (255 maximum) |
| `ChantierUpdateRequestDto` | `version: Long`, `code: String`, `designation: String`, `nom: String?`, `actif: Boolean` | Version et statut requis; mêmes contraintes de texte que la création. La version empêche d'écraser une modification concurrente |
| `ChantierSearchCriteria` | `code: String?`, `designation: String?`, `recherche: String?`, `actif: Boolean?` | Filtres facultatifs; 100 caractères maximum pour le code, 500 pour les deux textes. `code` et `designation` se combinent; `recherche` cherche dans code, nom ou désignation |
| `ChantierResponseDto` | `id: Long`, `version: Long`, `code: String`, `designation: String?`, `nom: String?`, `sourceErp: boolean`, `actif: boolean` | Identité, version, libellés, origine et statut renvoyés à la consultation et à la recherche |
| `PaieChantierOptionDto` | `id: Long`, `code: String`, `nom: String?`, `designation: String?`, `actif: boolean` | Option des filtres Paie du mois choisi : code et nom visibles, désignation en repli quand le nom manque |

### Permissions

| Permission | Accès accordé |
|---|---|
| `CHANTIER_READ` | Ouvrir le domaine, lire les fiches et les trois vues, rechercher les chantiers |
| `CHANTIER_WRITE` | Créer, modifier, clôturer et rouvrir un chantier |
| `CHANTIER_DELETE` | Supprimer un chantier non référencé |
| `CHANTIER_SYNC` | Déclencher la synchronisation ERP manuelle |
| `PAIE_READ` | Lire les indicateurs des bulletins dans Cartes et Analytique |
| `EMPLOYEE_READ` | Ouvrir la liste Employé depuis l'icône des Cartes, sans alimenter leurs indicateurs |

Le détail par route et action est dans [../rbac/chantier.md](../rbac/chantier.md).

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
| `/chantiers/cartes` | `ChantierCartesComponent` | **Cartes hiérarchiques** : chantier → équipe → fonction, avec les indicateurs de la dernière paie disponible |
| `/chantiers/analytique` | `ChantierAnalytiqueComponent` | **Analytique graphique** : répartition par chantier et évolution mensuelle de l'effectif payé, de la masse salariale et des STC ; qualité des rattachements |
| `/chantiers/new` | `ChantierFormComponent` | Création |
| `/chantiers/:id` | `ChantierDetailComponent` | Consultation (code, désignation, nom, statut, source) |
| `/chantiers/:id/edit` | `ChantierFormComponent` | Modification (code, désignation, nom, statut) — un chantier issu de l'ERP se modifie exactement comme un autre : la synchronisation ne le touche plus |

Les trois vues (Tabulaire, Cartes, Analytique) utilisent `app-collection-shell` et `app-collection-table` pour leur structure commune, puis suivent le [pattern frontend des trois vues](../../conventions/frontend.md), comme
[Équipe](../equipe/README.md) et [Fonction](../function/README.md). Les filtres code, désignation et statut restent dans l'URL et
**agissent de la même façon dans les trois vues** (même recherche serveur). La synchronisation et la création vivent dans
l'en-tête commun (`ChantierActionsComponent`) : une synchronisation réussie recrée la vue affichée. La carte géographique
(`/carte`, droit `CARTE_READ`) reste un écran séparé, décrit dans [carte.md](carte.md).

**La coque, le Tabulaire, Cartes et Analytique reposent sur des composants partagés configurés par domaine** ([Vues de collection partagées](../frontend/vues-perimetre.md), ADR 0011, 0012 et 0014) : `ChantierCartesComponent` et
`ChantierAnalytiqueComponent` ne sont que des hôtes minces ; `chantier-module.ts` décrit le module (référentiel de chantiers avec
leur statut, filtres code, désignation et statut, ordre de descente chantier → équipe → fonction). Les liens avec les autres
domaines passent par les services existants, sans endpoint propre. Cartes et Analytique utilisent la **paie du dernier mois enregistré** comme source commune :

- l'effectif correspond aux **personnes payées** dans ce mois ; la masse salariale et les STC proviennent du même ensemble de bulletins (`POST /paie/analytique`, droit `PAIE_READ`) ;
- chaque carte montre ces quatre indicateurs et leur variation par rapport au mois précédent ; les cartes sont triées par masse salariale puis effectif payé ; un chantier clôturé reste consultable avec sa pastille « Clôturé » ;
- le sélecteur de période et les raccourcis entre vues sont absents : les onglets changent de vue et conservent le périmètre ; la synthèse et son export PDF figurent au niveau consulté ;
- l'Analytique répartit les quatre indicateurs par chantier, puis suit mensuellement un chantier choisi. Les graphiques de répartition et d'évolution acceptent les filtres Fonction et Équipe, dont « Orphelins » pour l'équipe ; les données chiffrées restent repliées jusqu'à « Voir les données ». La section distincte de qualité des rattachements apparaît lorsqu'il existe des bulletins sans équipe dans le périmètre ;
- un chantier sans bulletin dans la période récente garde sa carte avec des indicateurs à zéro et son historique mensuel ; sans `PAIE_READ`, les indicateurs protégés ne sont pas chargés. L'accès à la liste des employés est conditionné par `EMPLOYEE_READ`, sans contribution des fiches aux chiffres de ces deux vues.

Colonnes du tableau : Code, Nom, Désignation, Source (ERP ou manuel), Statut. Accès via la barre latérale
(`core/navigation/nav-items.ts`, entrée « Chantiers », permission `CHANTIER_READ`). Les boutons de création,
modification, suppression et synchronisation sont conditionnés par `CHANTIER_WRITE`, `CHANTIER_DELETE` et
`CHANTIER_SYNC` (voir [../rbac/chantier.md](../rbac/chantier.md)).

Le référentiel chantier est également consommé par les formulaires/filtres Employee et Paie
(`shared/reference-data/chantier-reference.service.ts`, implémentation du contrat de pagination
attendu par le sélecteur générique `shared/components/lazy-select` — voir `conventions/frontend.md`,
section Sélecteurs) pour la sélection d'affectation (simple) et le filtrage de liste (multiple). Le sélecteur
affiche le code et le nom; quand `nom` est vide, il affiche la désignation. La recherche accepte ces trois
textes. Dans un filtre multiple, « Tout sélectionner » retire la restriction même pour les pages non
chargées; « Ne rien sélectionner » vide le filtre.

---

## Points à valider avec le propriétaire

Constats issus de la relecture du code pour clôturer le domaine. Chacun est un comportement **actuel**, pas une anomalie
à corriger d'office : à confirmer, à ajuster ou à classer.

| # | Constat | Question |
|---|---|---|
| 1 | La synchronisation **n'ajoute que les chantiers manquants** : un changement de désignation dans l'ERP n'arrive jamais ici (décision du 2026-10-03) | Faut-il une mise à jour contrôlée des désignations ? |
| 2 | `V35` a clôturé une fois les chantiers absents de la dernière paie ; **aucune règle continue** ne clôture ensuite | Faut-il une clôture périodique (ou une alerte) pour les chantiers sans paie récente ? |
| 3 | La ligne ERP `CodeErreur` est ignorée : seule l'absence de code écarte une ligne | Une ligne en erreur côté ERP doit-elle être écartée ? |
| 4 | La synchronisation n'a pas de nouvel essai : une panne ERP attend la prochaine exécution (23 h) ou un clic manuel | Faut-il alerter quand la synchronisation échoue ? |
| 5 | `designation` et `nom` sont facultatifs en base (la désignation est obligatoire à la saisie) | Rendre la désignation obligatoire en base ? |
| 6 | Modifier le `code` le change partout, historique compris (décision du 2026-10-23) | Confirmer, ou figer le code d'époque dans le bulletin ? |
| 7 | La carte géographique n'affiche encore **aucun chantier** (étapes 3 à 5 à faire) | Priorité du placement des chantiers (coordonnées, source) ? |
| 8 | L'assistant lit les chantiers et la paie par chantier, sans périmètre par fiche de poste | Qui doit voir quels chantiers (jalon J2) ? |

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
