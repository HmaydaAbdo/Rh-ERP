# Module Function

> Référentiel des fonctions occupées par les employés. Alimenté par saisie manuelle ou par import
> Excel en masse (fichier à une seule colonne). Consommé par le domaine Employee (fonction occupée
> par un employé) et, à terme, par Pointage et Paie.

---

## Vue d'ensemble

| | |
|---|---|
| Backend | `backend/src/main/java/staport/rh/function/` |
| Frontend | `frontend/src/app/portail/function/` |
| Table | `fonction` |
| Endpoints | `/functions`, `/functions/search`, `/functions/import` |

Le module suit l'architecture de référence du projet (`conventions/architecture.md`) :
`entities → repositories → specifications → dtos → mappers → services → controller`, avec un
sous-module `imports/` dédié à l'import Excel.

```text
function/
├── controller/FunctionController.java
├── dtos/
│   ├── request/ (Create, Update, SearchCriteria)
│   └── response/FunctionResponseDto.java
├── entities/Function.java
├── exceptions/ (NotFound, AlreadyExists, ExceptionHandler)
├── mappers/FunctionMapper.java
├── repositories/FunctionRepository.java
├── services/ (FunctionService + IFunctionService)
├── specifications/FunctionSpecification.java
└── imports/
    ├── FunctionImportService.java     ← lecture du fichier, création atomique, génération du modèle
    ├── FunctionImportController.java  ← POST /functions/import, GET /functions/import/modele
    ├── FunctionImportResultDto.java
    └── FunctionImportException.java   ← fichier illisible (pas une ligne invalide)
```

Le package est nommé `imports` (et non `import`, mot réservé Java) — seule entorse à la convention
de nommage habituelle.

---

## Modèle de données

Table `fonction` :

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `BIGINT` | PK, auto-incrément | Identifiant interne |
| `libelle` | `VARCHAR(100)` | `NOT NULL`, **unique** | Nom de la fonction (ex. `CHEF CHANTIER`) |

Pas de notion de statut actif/inactif : une fonction existe ou n'existe pas (contrairement à
Chantier, où un chantier peut être désactivé sans être supprimé). Ce champ a été retiré le
2026-09-22 — il n'avait pas de sens métier pour ce référentiel (voir [TODO.md](../../TODO.md)).

---

## Règles métier

- `libelle` est la clé métier, unique, insensible à la casse (`findByLibelleIgnoreCase`).
- La suppression (`DELETE /functions/{id}`) est bloquée (409) si la fonction est référencée par au
  moins un employé (contrainte de clé étrangère `employe.fonction_id`).
- L'import ne **crée** jamais de doublon : une ligne dont le libellé existe déjà (en base ou déjà
  rencontré plus tôt dans le même fichier) est ignorée.

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/functions` | Créer une fonction | 201, 400, 409 |
| `PUT` | `/functions/{id}` | Modifier une fonction | 200, 400, 404, 409 |
| `GET` | `/functions/{id}` | Consulter une fonction | 200, 404 |
| `POST` | `/functions/search` | Rechercher (paginé, triable) — body `FunctionSearchCriteria` (`libelle`) | 200 |
| `DELETE` | `/functions/{id}` | Supprimer (bloqué si référencée par un employé) | 204, 404, 409 |
| `POST` | `/functions/import` | Importer depuis un fichier Excel (`multipart/form-data`, champ `file`) | 200, 400 |
| `GET` | `/functions/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |

`FunctionResponseDto` : `id`, `libelle`.

Authentification JWT + permissions requises sur chaque endpoint (`FUNCTION_READ`/
`FUNCTION_WRITE`/`FUNCTION_DELETE`/`FUNCTION_IMPORT`) — voir `docs/rbac/function.md` pour le
détail endpoint ↔ permission et `conventions/security.md` pour la conception du RBAC.

---

## Import Excel

### Modèle téléchargeable

`GET /functions/import/modele` (bouton "Modèle Excel" dans l'UI, à côté du bouton "Importer")
renvoie un fichier `.xlsx` vierge contenant uniquement l'en-tête attendu ("Fonction" en cellule A1),
généré par `FunctionImportService.genererModele()`. Objectif : que l'utilisateur parte toujours d'un
fichier au bon format plutôt que de deviner ou de réutiliser un ancien export dont la structure a pu
changer. Volontairement **sans ligne d'exemple** : une valeur d'exemple ressemblant à une vraie
fonction (ex. `OPERATEUR`) risquerait d'être importée par erreur si l'utilisateur oublie de la
retirer avant de remplir son fichier.

### Format attendu

- Fichier `.xlsx`.
- **Une seule colonne** (colonne A) : le libellé de la fonction.
- **Une ligne d'en-tête** (ligne 1, ignorée quel que soit son contenu).
- Une fonction par ligne à partir de la ligne 2.

### Comportement

Import **atomique** (tout ou rien) — une seule ligne invalide rejette tout le fichier, rien n'est
créé :

| Cas | Comportement |
|---|---|
| Ligne vide | Ignorée silencieusement, ne compte pas dans `totalLignes` |
| Libellé > 100 caractères | Ligne listée dans `lignesIgnorees`, `raison = "Libellé trop long (max 100 caractères)"` |
| Libellé déjà existant (en base ou en doublon dans le fichier) | Ligne listée dans `lignesIgnorees`, `raison = "Fonction déjà existante"` |
| Fichier illisible (mauvais format, corrompu) | Rejet complet, `400 Bad Request` (`FunctionImportException`) |
| Au moins une ligne invalide parmi les autres | `400 Bad Request`, **aucune** fonction créée, `crees = 0`, détail complet dans `lignesIgnorees` |
| Toutes les lignes valides | `200 OK`, toutes les fonctions créées |

`FunctionImportResultDto` : `totalLignes`, `crees`, `ignores`, `lignesIgnorees[]` (`numeroLigne`,
`libelle`, `raison`). Le corps de réponse a la même forme en succès (`200`) qu'en rejet (`400`) —
seul le code HTTP change, ce qui permet au frontend d'afficher le même détail des lignes en cause
dans les deux cas.

Toutes les lignes sont validées avant toute écriture en base ; la persistance (`saveAll`) n'a lieu
qu'une fois la totalité du fichier confirmée valide.

---

## Frontend

Routes sous `/functions` (lazy loading, `function.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/functions` | `FunctionListComponent` | Liste paginée, recherche (libellé), tri, suppression, téléchargement du modèle, import Excel |
| `/functions/new` | `FunctionFormComponent` | Création |
| `/functions/:id` | `FunctionDetailComponent` | Consultation |
| `/functions/:id/edit` | `FunctionFormComponent` | Modification |

Le bouton "Modèle Excel" télécharge le fichier vierge (`GET /functions/import/modele`) via un lien
`<a download>` généré dynamiquement à partir du `Blob` reçu. Le bouton "Importer" déclenche un
sélecteur de fichier natif (`<input type="file" accept=".xlsx">` masqué), envoie le fichier à
`POST /functions/import`, puis affiche un résumé (toast) et le détail des lignes ignorées dans une
boîte de dialogue.

Accès via la barre latérale de l'application (`app.component.ts`, entrée "Fonctions").

Le référentiel fonction est également consommé par le formulaire Employee
(`shared/reference-data/function-reference.service.ts`) pour la liste déroulante d'affectation.

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- Aucune limite liée à l'authentification : tous les endpoints requièrent un JWT valide et la
  permission adéquate (voir `docs/rbac/function.md`).
- Aucun audit (Hibernate Envers) — les créations/modifications/imports ne sont pas tracés au-delà
  des logs applicatifs.
- Aucune limite liée à la persistance : le schéma est géré par Flyway et les données survivent aux
  redémarrages (`ddl-auto=validate`, voir `conventions/database.md`).
