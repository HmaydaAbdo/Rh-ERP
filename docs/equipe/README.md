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
| Endpoints | `/equipes`, `/equipes/search` |

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
via l'écran Équipes (`PUT /equipes/{id}`). Les bulletins qui n'avaient pas d'équipe restent sans équipe (`equipe_id` nul).

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
- Pas de notion actif/inactif : une équipe existe ou n'existe pas.

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/equipes` | Créer une équipe | 201, 400, 409 |
| `PUT` | `/equipes/{id}` | Modifier une équipe | 200, 400, 404, 409 |
| `GET` | `/equipes/{id}` | Consulter une équipe | 200, 404 |
| `POST` | `/equipes/search` | Rechercher (paginé, triable) — body `EquipeSearchCriteria` (`code`, `libelle`, `recherche`) | 200 |
| `DELETE` | `/equipes/{id}` | Supprimer (bloqué si utilisée par un bulletin ou un employé) | 204, 404, 409 |

`EquipeResponseDto` : `id`, `version`, `code`, `libelle`. Les critères `code` et `libelle` filtrent
par sous-chaîne et se combinent en ET dans la liste d'administration ; `recherche` filtre par
sous-chaîne en OU entre code et libellé pour le sélecteur. La recherche échappe les caractères de
motif spéciaux.

La modification exige la `version` retournée par l'API : une version obsolète déclenche un conflit
de modification (`409`). La suppression renvoie `409` lorsqu'une contrainte FK empêche la suppression.

Authentification JWT + permissions requises sur chaque endpoint (`EQUIPE_READ`/`EQUIPE_WRITE`/
`EQUIPE_DELETE`) — voir [Autorisations](#autorisations-et-dépendances-de-droits).

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
| Routes collection, Cartes, Analytique, détail | `EQUIPE_READ` |
| Routes création et modification | `EQUIPE_WRITE` |
| Bouton supprimer | `EQUIPE_DELETE` |

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
| Backend | `backend/src/test/java/staport/rh/equipe/services/EquipeServiceTest.java` | Normalisation du code, doublon de code sans casse, doublon de libellé, mise à jour sans auto-doublon, rejet d'un code déjà utilisé, absence (404) et suppression d'une équipe non référencée |
| Frontend — formulaire | `form/equipe-form.component.spec.ts` | Aide de saisie, champs requis, bornes, création, erreur serveur et modification |
| Frontend — liste | `list/equipe-list.component.spec.ts` | Première page et tri, permissions, filtres URL, consultation/modification, suppression confirmée ou annulée |
| Frontend — coque | `vues/equipe-vues.component.spec.ts` | Trois vues, filtres conservés, fusion URL avec périmètre/mois/regroupement, bouton de création protégé |
| Frontend — intégration des vues partagées | `equipe-module.spec.ts` | Référentiel filtré, ordre de descente, retour à Tabulaire, critères Employé et Paie |
| E2E | `frontend/e2e/equipes.spec.ts` | Parcours des vues, filtres et périmètre, droits Employé/Paie séparés et absence d'appels sans droit |
| Sécurité backend | `EndpointSecurityTest` | Vérifie que les endpoints portent un contrôle d'accès explicite; l'état détaillé des permissions reste dans la matrice ci-dessus |

La CI #391 a réussi sur la tête de PR `3e2058b` (frontend, backend, full-stack, profil de performance;
publication d'images ignorée). La PR #80 a été fusionnée par squash dans `main` au commit
`c0ecbe5`. Au début de cette revue, les checks `backend` et `performance-profile` du commit de
fusion étaient verts; `frontend` et `full-stack` étaient encore en cours. Un résultat CI du commit
de fusion ne sera confirmé qu'après la fin de ces deux jobs.

Les résultats techniques ne valent pas accord métier. Le bloc n'est pas déclaré en production et
les validations métier suivantes restent à recueillir :

- confirmer que les trois vues et les indicateurs présentés répondent au besoin RH/Paie;
- confirmer la signification des codes/libellés provisoires `A`, `LABO`, `ASPHALET` et `8`;
- décider si l'équipe peut rester facultative sur un bulletin;
- confirmer l'effet du changement de code sur tous les bulletins historiques;
- confirmer le refus actuel de supprimer une équipe référencée par un employé ou un bulletin;
- comparer des indicateurs à des exemples métier et vérifier la distinction entre la situation
  récente Employé et les bulletins de périodes antérieures;
- recueillir les avis des responsables métier Équipe/RH, Paie et réalisation/livraison.

| Intervenant | Avis | Commentaire / signature / date |
|---|---|---|
| Propriétaire de l'application | À compléter après revue |  |
| Responsable métier Équipe / RH | À compléter |  |
| Responsable métier Paie | À compléter |  |
| Responsable de réalisation / livraison | À compléter |  |
| Autre intervenant concerné | À compléter |  |

---

## Limites connues

Consulter le [TODO du domaine Équipe](TODO.md) pour les validations métier restantes. Le référentiel se gère
uniquement par l'écran Équipes : il n'a pas d'import Excel ni de synchronisation. Les écritures sont auditées
(voir [../audit/README.md](../audit/README.md)).

## Documents du domaine

- [TODO et décisions restantes](TODO.md)
- [Validation métier et technique / partie Équipe du PV](validation.md)
- [Maquette historique des vues](maquette-vues.html) — référence visuelle, le code actuel reste la source du comportement.
