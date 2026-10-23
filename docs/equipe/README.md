# Module Équipe

> Référentiel des équipes de travail (CHAUFFEURS, OPERATEURS, ATELIER...), partagé par tous les
> chantiers. Remplace l'ancienne table de libellés codée en dur (`EquipeLibelleCatalogue`) et le
> texte libre qui était saisi sur chaque bulletin de paie. Consommé par le domaine Paie (équipe d'un
> bulletin, regroupement des exports Excel/PDF).

---

## Vue d'ensemble

| | |
|---|---|
| Backend | `backend/src/main/java/staport/rh/equipe/` |
| Frontend | `frontend/src/app/portail/equipe/` |
| Table | `equipe` |
| Endpoints | `/equipes`, `/equipes/search`, `/equipes/import` |

Le module suit l'architecture de référence du projet (`conventions/architecture.md`) :
`entities → repositories → specifications → dtos → mappers → services → controller`.

```text
equipe/
├── controller/EquipeController.java
├── dtos/
│   ├── request/ (Create, Update, SearchCriteria)
│   └── response/EquipeResponseDto.java
├── entities/Equipe.java
├── exceptions/ (NotFound, AlreadyExists, ExceptionHandler)
├── imports/ (import Excel atomique du référentiel)
├── mappers/EquipeMapper.java
├── repositories/EquipeRepository.java
├── services/ (EquipeService + IEquipeService)
└── specifications/EquipeSpecification.java
```

---

## Modèle de données

Table `equipe` (migration `V7__create_equipe.sql`) :

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `BIGINT` | PK, auto-incrément | Identifiant interne |
| `version` | `BIGINT` | `NOT NULL`, défaut `0`, `@Version` | Détecte les modifications concurrentes (ajoutée en V18) |
| `code` | `VARCHAR(50)` | `NOT NULL`, unique après `trim` et sans casse | Clé métier : `CH`, `OP`, `R CONT`... |
| `libelle` | `VARCHAR(100)` | `NOT NULL`, unique après `trim` et sans casse | Nom d'affichage : `CHAUFFEURS`, `OPERATEURS`... |

L'unicité normalisée est garantie en base par les index `uk_equipe_code_normalise` et
`uk_equipe_libelle_normalise` (V25). V27 ajoute des contraintes empêchant les espaces extérieurs
sur les nouvelles écritures. La version optimiste est ajoutée en V18. L'audit Envers utilise
`equipe_aud` (V11) et l'état initial est capturé en V14. Les scripts V7/V8/V9, V11, V14, V18, V25,
V27 et V29/V30 forment l'historique du schéma et des reprises liées au domaine.

La paie stocke une FK nullable `paie.equipe_id` avec l'index `idx_paie_equipe` (V8). La fiche
Employé stocke l'équipe de son dernier état importé dans `employe.equipe_id` (nullable, index
`idx_employe_equipe`, V29/V30). Les contrats consommateurs sont détaillés plus bas et dans les
README Paie/Employé.

### Données de départ (seed V7)

La migration crée 17 équipes. Les 13 premières viennent de la table fournie par la direction (`EQUIPES.xlsx`, 2026-09-29) :
`CH` CHAUFFEURS, `OP` OPERATEURS, `AT` ATELIER, `EE` ENROBE, `TER` TERASSEMENT, `GA` GARDIENS,
`TOPO` TOPOGRAPHES, `ADMIN` ADMINISTRATION, `ENROCHEMENT` ENROCHEMENT, `R CONT` REMBLAIS CONTIGUE,
`GABION` GABION, `PHS` PLAN HYGIENE ET SECURITE, `EB` BETON.

L'ancien catalogue contenait à la fois `ENR` et `ENROCHEMENT` pour la même équipe : fusionnées sous
le code **`ENROCHEMENT`** (valeur réellement présente sur les bulletins et dans les fichiers
d'import). `ENR` n'est plus un code valide.

Les 4 autres ont été créées d'après les valeurs trouvées sur les bulletins existants
(diagnostic du 2026-10-03), absentes de l'ancien catalogue : `A` (45 bulletins), `LABO` (6),
`ASPHALET` (5) et `8` (1). Leur **libellé est provisoirement égal au code** — à renseigner avec la RH
via l'écran Équipes (`PUT /equipes/{id}`); leur signification et leur libellé restent suivis dans la
tâche globale « Qualité des données » de [`TODO.md`](../../TODO.md). Les bulletins qui n'avaient pas
d'équipe restent sans équipe (`equipe_id` nul).

---

## Règles métier

- `code` est la **clé métier** : stocké **trimé et en majuscules** (`EquipeService.normaliserCode`),
  donc `"ch"` et `"CH "` désignent la même équipe. V25 impose l'unicité après `trim` et sans casse;
  V27 ajoute un contrôle de base qui refuse toute nouvelle valeur avec des espaces extérieurs.
- `libelle` est aussi unique après `trim` et sans casse en base (migration V25, doublon → 409).
  V27 ajoute le même contrôle contre les espaces extérieurs pour toute nouvelle valeur.
- Le **code** reste la clé de sélection/regroupement partout (import Excel, dialog d'export,
  agrégation BI) ; le **libellé** ne sert qu'à l'affichage (titres de section/feuille, graphique
  « Répartition par équipe »).
- La suppression (`DELETE /equipes/{id}`) est bloquée (409) si l'équipe est référencée par au moins
  un bulletin de paie ou par un employé (clés étrangères `paie.equipe_id` et `employe.equipe_id`).
  Ce comportement est confirmé par le propriétaire le 23 octobre 2026.
- Pas de notion actif/inactif : une équipe existe ou n'existe pas.
- L'équipe reste facultative sur un bulletin pour le moment. La rendre obligatoire est une évolution
  proposée dans le [PV de stabilisation](../handoff/pv-stabilisation-erp-rh-2026-10-22.md#évolution-proposée--équipe-obligatoire-sur-chaque-bulletin),
  sans effet sur le code actuel.
- Modifier le code d'une équipe change aussi le code affiché dans les bulletins historiques qui
  référencent cette même équipe; c'est la décision du propriétaire du 23 octobre 2026.

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/equipes` | Créer une équipe | 201, 400, 409 |
| `PUT` | `/equipes/{id}` | Modifier une équipe | 200, 400, 404, 409 |
| `GET` | `/equipes/{id}` | Consulter une équipe | 200, 404 |
| `POST` | `/equipes/search` | Rechercher (paginé, triable) — body `EquipeSearchCriteria` (`code`, `libelle`, `recherche`) | 200 |
| `DELETE` | `/equipes/{id}` | Supprimer (bloqué si utilisée par un bulletin ou un employé) | 204, 404, 409 |
| `POST` | `/equipes/import` | Import atomique du fichier XLSX (création seulement) | 200, 400 |
| `GET` | `/equipes/import/modele` | Télécharger le modèle XLSX vierge | 200 |

`EquipeResponseDto` : `id`, `version`, `code`, `libelle`. Les critères `code` et `libelle` filtrent
par sous-chaîne et se combinent en ET dans la liste d'administration ; `recherche` filtre par
sous-chaîne en OU entre code et libellé pour le sélecteur. La recherche échappe les caractères de
motif spéciaux.

La modification exige la `version` retournée par l'API : une version obsolète déclenche un conflit
de modification (`409`). La suppression renvoie `409` lorsqu'une contrainte FK empêche la suppression.

Authentification JWT + permissions requises sur chaque endpoint (`EQUIPE_READ`/`EQUIPE_WRITE`/
`EQUIPE_DELETE`/`EQUIPE_IMPORT`) — voir [Autorisations](#autorisations-et-dépendances-de-droits).

### Import Excel

Le modèle `GET /equipes/import/modele` fournit un classeur `.xlsx` vierge avec une seule feuille et
les deux colonnes `Code`, `Libellé`. `POST /equipes/import` reçoit le classeur dans le champ multipart
`file` (limite commune de 20 Mo). L'import crée uniquement de nouvelles équipes; il ne met jamais à
jour une équipe existante. Le code est trimé et enregistré en majuscules, le libellé est trimé. Les
deux champs sont obligatoires, de longueur maximale 50 et 100, et uniques sans tenir compte de la
casse et des espaces extérieurs.

Les lignes vides sont ignorées. Toutes les autres sont vérifiées avant toute écriture; une seule
ligne invalide rejette le fichier entier (HTTP 400, `crees: 0`) et le résultat détaille chaque ligne
rejetée. Le résultat a la même structure en succès et en rejet : `totalLignes`, `crees`, `ignores`,
`lignesIgnorees` (numéro de ligne, code, libellé, raison). Le modèle est disponible dans le menu du
bouton fractionné « Importer », visible sous `EQUIPE_IMPORT`.

---

## Frontend

Routes sous `/equipes` (lazy loading, `equipe.routes.ts`, protégées par `permissionGuard`) :

| Route | Composant | Description |
|---|---|---|
| `/equipes` | `EquipeVuesComponent` + `EquipeListComponent` | Coque commune, filtres code/libellé dans l'URL, liste paginée et tri |
| `/equipes/cartes` | `EquipeCartesComponent` | **Cartes par descente libre** : une carte par équipe, puis « Regrouper par » chantier, fonction ou employés ; fiches Employé et paie du mois sur chaque carte |
| `/equipes/analytique` | `EquipeAnalytiqueComponent` | **Analytique graphique** : chiffres de la paie, évolution mensuelle, répartition, tranches, mouvements, et fiches Employé |
| `/equipes/new` | `EquipeFormComponent` | Création |
| `/equipes/:id` | `EquipeDetailComponent` | Consultation |
| `/equipes/:id/edit` | `EquipeFormComponent` | Modification |

Entrée « Équipes » dans la barre latérale (`core/navigation/nav-items.ts`), visible avec `EQUIPE_READ`. Les trois
vues utilisent la coque configurable partagée (`app-collection-shell`) et le tableau commun (`app-collection-table`), avec filtres et configuration propres au domaine, selon le
[pattern frontend des trois vues](../../conventions/frontend.md). Les filtres code et libellé restent dans l'URL et
**agissent de la même façon dans les trois vues**. Les boutons de création, modification et suppression sont conditionnés
par `EQUIPE_WRITE` et `EQUIPE_DELETE` (voir [Autorisations et dépendances de droits](#autorisations-et-dépendances-de-droits)).

**Cartes et Analytique sont les vues partagées par tous les modules** ([Vues Cartes et Analytique partagées](../frontend/vues-perimetre.md), ADR 0011) : `EquipeCartesComponent` et
`EquipeAnalytiqueComponent` ne sont que des hôtes minces ; `equipe-module.ts` décrit le module (référentiel d'équipes, filtres code et
libellé, ordre de descente équipe → chantier → fonction). Les liens avec les autres domaines passent par les services
existants, sans endpoint propre :

- les effectifs viennent du regroupement des fiches Employé et représentent le dernier état importé (`EMPLOYEE_READ`) ;
- les sommes, effectifs payés, coûts moyens, STC, chantiers et historiques viennent des analyses Paie par période
  (`PAIE_READ`) ;
- la situation Employé récente et l'historique Paie sont deux informations distinctes, jamais présentées comme décrivant la
  même période ; sans le droit correspondant, le bloc est masqué et son service n'est pas appelé ;
- les équipes sans bulletin pour le mois choisi restent visibles, à zéro, et gardent l'historique de leurs autres mois ;
- le périmètre (étapes du fil, mois, regroupement) est dans l'URL et se partage par lien.

Le référentiel est consommé par Paie via `shared/reference-data/equipe-reference.service.ts`
(contrat du sélecteur générique `shared/components/lazy-select`, voir `conventions/frontend.md`) :
sélection simple dans le formulaire d'un bulletin, sélection multiple dans le filtre de la liste.

Le formulaire explique les règles avant la saisie, en langage utilisateur : code obligatoire (50 caractères maximum, espaces extérieurs retirés, enregistré en majuscules et unique) et libellé obligatoire (100 caractères maximum, espaces extérieurs retirés et unique).

---

## Autorisations et dépendances de droits

Le contrôle serveur est la référence; le masquage des routes et boutons côté frontend améliore le
parcours, mais ne remplace pas `@PreAuthorize`.

| Opération | Permission |
|---|---|
| `POST /equipes`, `PUT /equipes/{id}` | `EQUIPE_WRITE` |
| `GET /equipes/{id}`, `POST /equipes/search` | `EQUIPE_READ` |
| `DELETE /equipes/{id}` | `EQUIPE_DELETE` |
| `POST /equipes/import`, `GET /equipes/import/modele` | `EQUIPE_IMPORT` |
| Routes collection, Cartes, Analytique, détail | `EQUIPE_READ` |
| Routes création et modification | `EQUIPE_WRITE` |
| Bouton supprimer | `EQUIPE_DELETE` |
| Bouton Importer et modèle Excel | `EQUIPE_IMPORT` |

Le menu Équipes apparaît sous `EQUIPE_READ`. V9 a accordé les permissions Équipe aux rôles qui
avaient déjà les permissions Chantier correspondantes (initialement `SYSTEM_ADMIN` et
`PAIE_MANAGER`); les attributions actuelles sont administrables dans `/admin/roles`.

| Consommation | Accès demandé |
|---|---|
| Formulaire / filtre Paie utilisant le sélecteur d'équipe | `EQUIPE_READ` en plus du droit Paie nécessaire à l'écran |
| Import Excel Paie résolvant les codes côté serveur via `IEquipeService` | `PAIE_IMPORT`; aucun appel HTTP `/equipes` par l'utilisateur |
| Formulaire ou filtre Employé qui charge le référentiel Équipe | `EQUIPE_READ` en plus des droits Employé |
| Fiches Employé montrées dans Cartes / Analytique | `EMPLOYEE_READ`; aucun appel Employé sans ce droit |
| Indicateurs et montants Paie montrés dans Cartes / Analytique | `PAIE_READ`; aucun appel Paie sans ce droit |

Le détail des autorisations de lecture des fiches et bulletins reste la propriété de leurs domaines;
les dépendances au référentiel Équipe sont documentées ici comme contrat inter-domaines.

---

## Vérifications et tests

Les tests spécifiques du domaine couvrent les règles suivantes :

| Couche | Fichier / parcours | Vérifications présentes |
|---|---|---|
| Backend — règles du référentiel | `backend/src/test/java/staport/rh/equipe/services/EquipeServiceTest.java`, `backend/src/test/java/staport/rh/referentiel/ReferentielUniciteInsensibleCasseTest.java` | Normalisation et unicité du code et du libellé, y compris les espaces/casse sur PostgreSQL, modification sans auto-doublon, doublons et équipe absente |
| Backend — références et historique | `backend/src/test/java/staport/rh/audit/AuditOperationTest.java` | Suppression refusée si un bulletin Paie ou une fiche Employé référence l'équipe; le code modifié est relu sur un bulletin antérieur; l'échec de suppression est conservé et audité |
| Backend — bulletin sans équipe | `backend/src/test/java/staport/rh/paie/services/PaieServiceTest.java`, scénario `create_devraitAccepterUnBulletinSansEquipe` | Création acceptée avec `equipeId` nul |
| Backend — indicateurs et périodes | `backend/src/test/java/staport/rh/paie/services/PaieAnalytiqueServiceTest.java`, `backend/src/test/java/staport/rh/paie/effectifs/PaieEffectifsServiceTest.java`, tests des vues partagées dans `frontend/src/app/portail/perimetre/` | Répartition Paie par équipe, filtres, bulletins sans équipe, effectifs par période et comportement lorsqu'une équipe n'a aucun bulletin dans le mois retenu |
| Backend — import Excel du référentiel | `backend/src/test/java/staport/rh/equipe/imports/EquipeImportServiceTest.java` | Modèle, en-têtes, lignes vides, champs obligatoires, limites, normalisation, doublons existants et dans le fichier, rejet complet sans écriture partielle |
| Audit — import | `backend/src/test/java/staport/rh/audit/AuditImportTest.java` | Événement de succès, empreinte du fichier sans contenu, nombre créé et révision Envers |
| Frontend — formulaire | `form/equipe-form.component.spec.ts` | Aide de saisie, champs requis, bornes, création, erreur serveur et modification |
| Frontend — liste | `list/equipe-list.component.spec.ts` | Première page et tri, permissions, filtres URL, consultation/modification, suppression confirmée ou annulée |
| Frontend — coque et Tabulaire partagé | `vues/equipe-vues.component.spec.ts`, `list/equipe-list.component.spec.ts` | Trois vues, filtres conservés dans l'URL, assemblage de la coque et du tableau configurables, actions protégées |
| Frontend — intégration des vues partagées | `equipe-module.spec.ts` | Référentiel filtré, ordre de descente, retour à Tabulaire, critères Employé et Paie |
| Sécurité backend | `backend/src/test/java/staport/rh/auth/security/EndpointSecurityTest.java` | Chaque endpoint Équipe exige sa permission dédiée; le refus sans permission et l'accès autorisé sont vérifiés |
| E2E navigateur | `frontend/e2e/equipes.spec.ts` | Import et rechargement, parcours des trois vues, filtres et périmètre, données Employé/Paie séparées et absence d'appels sans les droits correspondants |

Les scénarios de ce tableau constituent la vérification exécutable des règles et parcours décrits
dans ce README. Les libellés métier des quatre codes provisoires demeurent la seule confirmation RH
à recueillir, suivie dans la tâche globale « Qualité des données »; les autres règles ci-dessus sont
des comportements constatés et couverts par les suites indiquées.

### Dernière vérification locale — 23 octobre 2026

- **Backend :** 61 tests réussis dans 7 classes ciblant Équipe, Paie, l'audit et l'unicité PostgreSQL. Le démarrage de la suite a créé une base PostgreSQL 18 jetable et validé les migrations V1 à V32.
- **Frontend :** 77 tests réussis dans 12 fichiers, pour Équipe et les vues partagées.
- **Parcours navigateur :** 3 scénarios Équipe réussis avec Playwright, dont la distinction entre l'équipe de la fiche Employé récente et celle du bulletin historique.
- **Build frontend de production :** réussi.

Les commandes générales et prérequis sont décrits dans [la documentation des tests](../testing.md). Les tests backend d'intégration nécessitent Docker; le parcours navigateur utilise un serveur de test local.

---

## Limites connues

Une présentation et une vidéo de démonstration sont prévues ultérieurement comme supports de
formation; elles ne sont pas planifiées pour le moment (voir le TODO global). L'import Excel respecte
le contrat commun des [Imports Excel](../imports.md). Il n'y a pas de
synchronisation du référentiel Équipe.
Les écritures sont auditées (voir [../audit/README.md](../audit/README.md)).

## Documents du domaine

- [Maquette historique des vues](maquette-vues.html) — référence visuelle, le code actuel reste la source du comportement.
