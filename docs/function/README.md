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
Chantier, où un chantier peut être clôturé sans être supprimé). La migration `V31` (2026-10-19) a supprimé une fois pour
toutes les fonctions qu'aucun bulletin de paie ni aucune fiche employé ne citait. Ce champ a été retiré le
2026-09-22 — il n'avait pas de sens métier pour ce référentiel (voir [TODO.md](../../TODO.md)).

---

## Règles métier

- `libelle` est la clé métier : le service et l'import retirent les espaces extérieurs. V27 impose
  l'unicité après trim et sans tenir compte de la casse, au moyen d'un index sur
  `UPPER(BTRIM(libelle))`, et bloque les nouvelles valeurs entourées d'espaces en base. Les collisions
  existantes font échouer V27 pour être résolues explicitement, sans fusion implicite.
- La suppression (`DELETE /functions/{id}`) est bloquée (409) si la fonction est référencée par au
  moins un employé ou un bulletin de paie (clés étrangères `employe.fonction_id` et `paie.fonction_id`).
- L'import ne **crée** jamais de doublon : une ligne dont le libellé existe déjà (en base ou déjà
  rencontré plus tôt dans le même fichier) est **rejetée**, et comme l'import est atomique, tout le fichier
  avec elle (voir [../imports.md](../imports.md)).
- Les fonctions peuvent aussi être créées **automatiquement** par l'import Excel de la paie, quand un bulletin
  porte une fonction encore inconnue (voir [../paie/README.md](../paie/README.md)) : même règles de libellé,
  aucune permission `FUNCTION_*` requise pour ce cas.
- La fonction d'un bulletin ou d'un employé est copiée par référence : renommer une fonction (`PUT`) change son
  libellé partout, historique compris. **Décision du propriétaire (2026-10-23) : ce comportement est conservé** ; c'est le
  moyen de corriger une faute de frappe. Le refus de supprimer une fonction utilisée (409) est lui aussi conservé : ni fusion
  ni archivage n'existent ; le nettoyage des quasi-doublons est suivi dans la tâche « Qualité des données » du TODO.

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

`GET /functions/import/modele` (entrée « Télécharger le modèle Excel » du menu du bouton fractionné « Importer » dans l'UI)
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
| `/functions` | `FunctionVuesComponent` + `FunctionListComponent` | Coque commune (titre, onglets de vue, actions Importer / Nouvelle fonction, filtre libellé dans l'URL), tableau standard (tri, colonnes, pagination, voir [../frontend/README.md](../frontend/README.md)) et suppression |
| `/functions/cartes` | `FunctionCartesComponent` | **Cartes hiérarchiques** : fonction → chantier → équipe → employés ; fiches Employé et paie du mois sur chaque carte |
| `/functions/analytique` | `FunctionAnalytiqueComponent` | **Analytique graphique** : chiffres de la paie (STC compris), évolution mensuelle, répartition, tranches, mouvements, et fiches Employé |
| `/functions/new` | `FunctionFormComponent` | Création |
| `/functions/:id` | `FunctionDetailComponent` | Consultation |
| `/functions/:id/edit` | `FunctionFormComponent` | Modification |

Les trois vues (Tabulaire, Cartes, Analytique) utilisent `app-collection-shell` et `app-collection-table` pour leur structure commune, puis suivent le [pattern frontend des trois vues](../../conventions/frontend.md), comme
[Équipe](../equipe/README.md). Le filtre libellé reste dans l'URL et **agit de la même façon dans les trois vues** : même
recherche serveur (libellé contenant le texte, sans tenir compte de la casse). L'import Excel et la création vivent dans
l'en-tête commun (`FunctionActionsComponent`) : un import réussi recrée la vue affichée pour qu'elle recharge ses données.

**Cartes et Analytique sont les vues partagées par tous les modules** ([Vues Cartes et Analytique partagées](../frontend/vues-perimetre.md), ADR 0011 et 0014) : `FunctionCartesComponent` et
`FunctionAnalytiqueComponent` ne sont que des hôtes minces ; `function-module.ts` décrit le module (référentiel de fonctions, filtre
libellé, ordre de descente fonction → chantier → équipe). Les liens avec les autres domaines passent par les services existants,
sans endpoint propre :

- l'effectif vient du regroupement des fiches Employé et représente le **dernier état importé** de chaque fiche (`EMPLOYEE_READ`) ;
- la masse, l'effectif payé, le coût moyen, les STC et l'historique mensuel viennent de l'analyse Paie par période
  (`POST /paie/analytique`, dont `parFonction` porte `stc` et `stcMontant`) (`PAIE_READ`) ;
- la fonction d'une **fiche** (état le plus récent) et celle d'un **bulletin** (fonction du mois) sont deux informations
  distinctes : une fonction renommée change son libellé partout, mais un employé qui change de fonction n'altère pas ses anciens
  bulletins ; les vues ne les présentent jamais comme décrivant la même période ;
- un mois sans bulletin pour la fonction choisie affiche des indicateurs à zéro avec un message explicite et conserve
  l'historique des autres mois ;
- sans `EMPLOYEE_READ` ou sans `PAIE_READ`, le bloc concerné est masqué et son service n'est pas appelé.

L'entrée « Télécharger le modèle Excel » du bouton « Importer » télécharge le fichier vierge (`GET /functions/import/modele`) via un lien
`<a download>` généré dynamiquement à partir du `Blob` reçu. Le bouton "Importer" déclenche un
sélecteur de fichier natif (`<input type="file" accept=".xlsx">` masqué), envoie le fichier à
`POST /functions/import`, puis affiche un résumé (toast) et le détail des lignes ignorées dans une
boîte de dialogue.

Accès via la barre latérale (`core/navigation/nav-items.ts`, entrée « Fonctions », permission `FUNCTION_READ`).
Les boutons de création, modification, suppression et import sont conditionnés par `FUNCTION_WRITE`,
`FUNCTION_DELETE` et `FUNCTION_IMPORT` (voir [../rbac/function.md](../rbac/function.md)).

Le référentiel fonction est également consommé par les formulaires/filtres Employee et Paie
(`shared/reference-data/function-reference.service.ts`, implémentation du contrat de pagination
attendu par le sélecteur générique `shared/components/lazy-select` — voir `conventions/frontend.md`,
section Sélecteurs) pour la sélection d'affectation (simple) et le filtrage de liste (multiple).

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- **Quasi-doublons** : seule l'égalité exacte (hors casse) est bloquée. Le référentiel actuel contient 114
  fonctions dont 9 paires très proches (fautes de frappe), toutes utilisées ; leur fusion est une décision métier
  suivie dans la tâche « Qualité des données ». Le rapport global ne présente pas de répartition par fonction ;
  au niveau chantier, elle sert de solution de repli lorsqu'aucune équipe n'est sélectionnée.
- Audité (voir [../audit/README.md](../audit/README.md)) : créations, modifications, suppressions et imports. Le nettoyage
  des doublons (tâche « Qualité des données ») est une migration de données : elle doit suivre le gabarit de migration auditée
  de `conventions/database.md`.
