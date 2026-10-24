# Module Function

> Référentiel des fonctions occupées. Les fonctions sont créées dans ce domaine ou à l’import Paie;
> leurs libellés alimentent les fiches Employé et les bulletins. Le domaine Pointage pourra aussi les consommer.

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
| `id` | `BIGINT` | PK, auto-incrément | Identifiant interne de la fonction |
| `version` | `BIGINT` | `NOT NULL`, version optimiste | Protège les modifications concurrentes |
| `libelle` | `VARCHAR(100)` | `NOT NULL`, unique après retrait des espaces extérieurs et sans distinguer la casse | Nom sémantique de la fonction, par exemple `CHEF CHANTIER` |

Une fonction n’a pas de statut « En cours / Clôturé ». Elle existe dans le référentiel ou elle en est supprimée lorsque rien ne la référence.

### DTO exposés

| DTO | Champs | Type et règles | Usage |
|---|---|---|---|
| `FunctionCreateRequestDto` | `libelle` | chaîne, obligatoire, non vide, 100 caractères maximum; les espaces extérieurs sont retirés avant l’enregistrement | Créer une fonction |
| `FunctionUpdateRequestDto` | `version`, `libelle` | `version` : entier long obligatoire; `libelle` : mêmes règles que la création | Renommer une fonction sans écraser une modification concurrente |
| `FunctionSearchCriteria` | `libelle` | chaîne facultative, 100 caractères maximum; recherche partielle sans tenir compte de la casse | Filtrer le référentiel |
| `FunctionResponseDto` | `id`, `version`, `libelle` | `id` et `version` : entiers longs; `libelle` : chaîne | Réponse des consultations et écritures |
| `FunctionImportResultDto` | `totalLignes`, `crees`, `ignores`, `lignesIgnorees` | compteurs entiers; chaque détail expose `numeroLigne` (entier), `libelle` et `raison` (chaînes) | Résultat complet d’un import accepté ou rejeté |

---

## Règles métier

- `libelle` est la clé métier. Il est obligatoire, limité à 100 caractères, nettoyé des espaces extérieurs et unique sans distinguer majuscules et minuscules.
- La suppression (`DELETE /functions/{id}`) est bloquée (409) si la fonction est référencée par au
  moins un employé ou un bulletin de paie (clés étrangères `employe.fonction_id` et `paie.fonction_id`).
- L'import ne **crée** jamais de doublon : une ligne dont le libellé existe déjà (en base ou déjà
  rencontré plus tôt dans le même fichier) est **rejetée**, et comme l'import est atomique, tout le fichier
  avec elle (voir [../imports.md](../imports.md)).
- Les fonctions peuvent aussi être créées **automatiquement** par l'import Excel de la paie, quand un bulletin
  porte une fonction encore inconnue (voir [../paie/README.md](../paie/README.md)) : même règles de libellé,
  aucune permission `FUNCTION_*` requise pour ce cas.
- La fonction d'un bulletin ou d'un employé est référencée par son identifiant. Renommer une fonction change le libellé affiché partout, y compris dans les bulletins historiques; les affectations historiques restent inchangées.
- La suppression d'une fonction référencée par un employé ou un bulletin est refusée. Il n'existe pas de fusion ni d'archivage de fonction.

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/functions` | Créer une fonction | 201, 400, 409 |
| `PUT` | `/functions/{id}` | Modifier une fonction | 200, 400, 404, 409 |
| `GET` | `/functions/{id}` | Consulter une fonction | 200, 404 |
| `POST` | `/functions/search` | Rechercher (paginé, triable) — body `FunctionSearchCriteria` (`libelle`) | 200 |
| `DELETE` | `/functions/{id}` | Supprimer (refusé si référencée par un employé ou un bulletin de paie) | 204, 404, 409 |
| `POST` | `/functions/import` | Importer depuis un fichier Excel (`multipart/form-data`, champ `file`) | 200, 400 |
| `GET` | `/functions/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |

Les DTO exposés et leurs champs sont décrits dans la section [DTO exposés](#dto-exposés).

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
| `/functions` | `FunctionVuesComponent` + `FunctionListComponent` | Coque et tableau partagés; recherche par libellé dans l’URL, tri, pagination, consultation, modification, suppression et export PDF du résultat complet filtré |
| `/functions/cartes` | `FunctionCartesComponent` | **Cartes hiérarchiques** : fonction → chantier → équipe ; données du dernier mois de Paie, classées par masse salariale puis effectif payé. Le mois, le résumé des indicateurs et l'export PDF du périmètre sont regroupés dans l'en-tête du niveau |
| `/functions/analytique` | `FunctionAnalytiqueComponent` | **Analytique Paie** : données du dernier mois enregistré, répartition et évolution mensuelle, STC compris; une section qualité distincte présente les bulletins sans équipe avec filtres Chantier/Fonction uniquement si leur nombre est supérieur à zéro |
| `/functions/new` | `FunctionFormComponent` | Création |
| `/functions/:id` | `FunctionDetailComponent` | Consultation |
| `/functions/:id/edit` | `FunctionFormComponent` | Modification |

Les trois vues (Tabulaire, Cartes, Analytique) utilisent `app-collection-shell`, `app-collection-table`, `CartesPerimetreComponent` et `AnalytiquePerimetreComponent` pour leur structure commune, puis suivent le [pattern frontend des trois vues](../../conventions/frontend.md), comme
[Équipe](../equipe/README.md). Le filtre libellé reste dans l'URL et **agit de la même façon dans les trois vues** : même
recherche serveur (libellé contenant le texte, sans tenir compte de la casse). Le PDF du Tabulaire contient toutes les fonctions filtrées, pas seulement la page courante, et suit les colonnes visibles. Les composants Cartes et Analytique proposent chacun leur export PDF avec le périmètre et les filtres affichés. L'import Excel et la création vivent dans
l'en-tête commun (`FunctionActionsComponent`) : un import réussi recrée la vue affichée pour qu'elle recharge ses données. Cartes et Analytique suivent le même comportement qu'Équipe : elles restent sur la Paie la plus récente et n'affichent pas de filtre de période ni de raccourci « Voir la liste ». Dans Cartes, l'accès à la liste Employé est une icône avec infobulle à droite du titre du niveau; elle conserve le périmètre courant et nécessite `EMPLOYEE_READ`. Les onglets de la coque assurent le changement de vue.

**Tabulaire, Cartes, Analytique et leur coque sont des composants partagés configurés par module** ([Vues Cartes et Analytique partagées](../frontend/vues-perimetre.md), ADR 0011, 0012 et 0014) : `FunctionCartesComponent` et
`FunctionAnalytiqueComponent` sont des hôtes minces ; `function-module.ts` configure le référentiel, le filtre libellé, la hiérarchie Fonction → Chantier → Équipe, la source Paie seule et l'ordre des cartes. La logique commune et la présentation des cartes restent dans `CartesPerimetreComponent`. Les données passent par les services existants, sans endpoint propre :

- l'effectif payé, la masse salariale, les STC et les comparaisons mensuelles viennent de l'analyse Paie (`POST /paie/analytique`, dont `parFonction` porte `stc` et `stcMontant`) avec `PAIE_READ` ;
- le graphique de répartition masque les fonctions dont la valeur de l'indicateur sélectionné est nulle; le tableau de données voisin conserve toutes les fonctions du périmètre ;
- les cartes utilisent le dernier mois enregistré comme période de référence. Elles gardent l'effectif et la masse comme critères de tri décroissant, puis départagent les ex æquo par le libellé ;
- l'historique et l'évolution restent issus des bulletins de Paie. Les vues Fonction n'interrogent pas les fiches Employé pour composer les cartes ou l'Analytique ;
- un mois sans bulletin pour la fonction choisie affiche des indicateurs à zéro avec un message explicite et conserve
  l'historique des autres mois ;
- sans `PAIE_READ`, les données Paie sont masquées et le service n'est pas appelé.

La qualité des rattachements dispose d'une section et d'un graphique en anneau dédiés dans Analytique, distincts des graphiques de répartition, avec ses propres filtres Chantier et Fonction. Cette visualisation n'apparaît que si des bulletins sans équipe existent au dernier mois; elle n'est pas affichée dans le Tabulaire ni dans Cartes.

La fonction portée par une fiche Employé reste une donnée du domaine Employé; les vues Cartes et Analytique Fonction ne la chargent pas. Lorsque l'utilisateur possède `EMPLOYEE_READ`, l'icône Employés de Cartes ouvre la liste Employé avec le périmètre courant.

L'entrée « Télécharger le modèle Excel » du bouton « Importer » télécharge le fichier vierge (`GET /functions/import/modele`) via un lien
`<a download>` généré dynamiquement à partir du `Blob` reçu. Le bouton "Importer" déclenche un
sélecteur de fichier natif (`<input type="file" accept=".xlsx">` masqué), envoie le fichier à
`POST /functions/import`, puis affiche un résumé (toast) et le détail des lignes ignorées dans une
boîte de dialogue.

### Permissions

| Permission | Accès accordé |
|---|---|
| `FUNCTION_READ` | Ouvrir le domaine, consulter les fiches, rechercher et utiliser les trois vues |
| `FUNCTION_WRITE` | Créer et modifier une fonction |
| `FUNCTION_DELETE` | Supprimer une fonction non référencée |
| `FUNCTION_IMPORT` | Importer un fichier et télécharger le modèle Excel |
| `EMPLOYEE_READ` | Afficher l'icône d'accès à la liste Employé dans Cartes; aucune fiche Employé n'est chargée pour les synthèses |
| `PAIE_READ` | Afficher l'effectif payé, les montants, les STC et l'évolution Paie dans Cartes et Analytique |

Accès à la navigation via `FUNCTION_READ`; les contrôles d’autorisation complets figurent dans [../rbac/function.md](../rbac/function.md).

Le référentiel fonction est également consommé par les formulaires/filtres Employee et Paie
(`shared/reference-data/function-reference.service.ts`, implémentation du contrat de pagination
attendu par le sélecteur générique `shared/components/lazy-select` — voir `conventions/frontend.md`,
section Sélecteurs) pour la sélection d'affectation (simple) et le filtrage de liste (multiple).

---

## Scénarios couverts

Les tests du domaine vérifient les règles et parcours suivants :

- création et modification avec validation du libellé, doublon et version concurrente;
- liste paginée, recherche, tri, permissions de ligne et suppression avec confirmation;
- import Excel valide, doublon, ligne trop longue, fichier illisible, rejet atomique et modèle vierge;
- filtre conservé entre les trois vues, hiérarchie Fonction → Chantier → Équipe et données Paie selon les permissions;
- période récente dans Cartes et Analytique, cartes triées par masse salariale puis effectif payé, répartition Paie avec STC, suivi mensuel, mois sans bulletin et exports PDF.

Les quasi-doublons de libellés restent suivis dans « Qualité des données » du [TODO global](../../TODO.md); aucune fusion automatique n’est faite dans ce domaine.
