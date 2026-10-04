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
| `code` | `VARCHAR(50)` | `NOT NULL`, **unique** (aussi sur `UPPER(code)`) | Clé métier : `CH`, `OP`, `R CONT`... |
| `libelle` | `VARCHAR(100)` | `NOT NULL`, **unique** | Nom d'affichage : `CHAUFFEURS`, `OPERATEURS`... |

Le lien avec la paie est `paie.equipe_id` (nullable, FK → `equipe.id`, index `idx_paie_equipe`,
migration `V8__paie_equipe_fk.sql`) — voir `docs/paie/README.md`.

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
  donc `"ch"` et `"CH "` désignent la même équipe. Unique, insensible à la casse
  (`findByCodeIgnoreCase`, doublon → 409).
- `libelle` est aussi unique, insensible à la casse (doublon → 409) : aucun doublon d'équipe ne doit
  pouvoir exister.
- Le **code** reste la clé de sélection/regroupement partout (import Excel, dialog d'export,
  agrégation BI) ; le **libellé** ne sert qu'à l'affichage (titres de section/feuille, graphique
  « Répartition par équipe »).
- La suppression (`DELETE /equipes/{id}`) est bloquée (409) si l'équipe est référencée par au moins
  un bulletin de paie (contrainte de clé étrangère `paie.equipe_id`).
- Pas de notion actif/inactif : une équipe existe ou n'existe pas.

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/equipes` | Créer une équipe | 201, 400, 409 |
| `PUT` | `/equipes/{id}` | Modifier une équipe | 200, 400, 404, 409 |
| `GET` | `/equipes/{id}` | Consulter une équipe | 200, 404 |
| `POST` | `/equipes/search` | Rechercher (paginé, triable) — body `EquipeSearchCriteria` (`code`, `libelle`, `recherche`) | 200 |
| `DELETE` | `/equipes/{id}` | Supprimer (bloqué si utilisée par un bulletin) | 204, 404, 409 |

`EquipeResponseDto` : `id`, `code`, `libelle`. `code`/`libelle` sont des filtres précis combinés en
ET (liste d'administration) ; `recherche` est la recherche libre du sélecteur, en OU entre code et
libellé.

Authentification JWT + permissions requises sur chaque endpoint (`EQUIPE_READ`/`EQUIPE_WRITE`/
`EQUIPE_DELETE`) — voir `docs/rbac/equipe.md`.

---

## Frontend

Routes sous `/equipes` (lazy loading, `equipe.routes.ts`, protégées par `permissionGuard`) :

| Route | Composant | Description |
|---|---|---|
| `/equipes` | `EquipeListComponent` | Liste paginée, filtres code/libellé, tri, suppression |
| `/equipes/new` | `EquipeFormComponent` | Création |
| `/equipes/:id` | `EquipeDetailComponent` | Consultation |
| `/equipes/:id/edit` | `EquipeFormComponent` | Modification |

Entrée « Équipes » dans la barre latérale (`core/navigation/nav-items.ts`), visible avec `EQUIPE_READ`. La liste est un
tableau standard (tri, colonnes, pagination, filtres code/libellé en temps réel, voir
[../frontend/README.md](../frontend/README.md)) ; les boutons de création, modification et suppression sont
conditionnés par `EQUIPE_WRITE` et `EQUIPE_DELETE` (voir [../rbac/equipe.md](../rbac/equipe.md)).

Le référentiel est consommé par Paie via `shared/reference-data/equipe-reference.service.ts`
(contrat du sélecteur générique `shared/components/lazy-select`, voir `conventions/frontend.md`) :
sélection simple dans le formulaire d'un bulletin, sélection multiple dans le filtre de la liste.

---

## Limites connues

Voir [TODO.md](../../TODO.md) :

- **Libellés provisoires** : `A`, `LABO`, `ASPHALET` et `8` ont pour libellé leur propre code. À compléter avec la
  RH depuis l'écran Équipes.
- **Équipe facultative sur un bulletin** : un bulletin peut ne pas avoir d'équipe (`equipe_id` nul). Savoir si
  elle doit devenir obligatoire fait partie de la tâche « Qualité des données ».
- **Modifier le code d'une équipe** (`PUT`) le change pour tous les bulletins qui la référencent, historique
  compris ; le regroupement des exports se fait par code.
- Pas d'import Excel ni de synchronisation : le référentiel se gère uniquement par l'écran Équipes.
- Audité : voir [../audit/README.md](../audit/README.md).
