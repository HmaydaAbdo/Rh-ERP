# Module Employee

> Fiche d'identité des employés — domaine de référence de l'ERP RH. Référence les domaines Function
> (fonction occupée) et Chantier (affectation) par clé étrangère. Alimenté par saisie manuelle ou
> par import Excel en masse.

---

## Vue d'ensemble

| | |
|---|---|
| Backend | `backend/src/main/java/staport/rh/employee/` |
| Frontend | `frontend/src/app/portail/employee/` |
| Table | `employe` |
| Endpoints | `/employees`, `/employees/search`, `/employees/import` |

Le module suit l'architecture de référence du projet (`conventions/architecture.md`) :
`entities → repositories → specifications → dtos → mappers → services → controller`, avec un
sous-module `imports/` dédié à l'import Excel.

```text
employee/
├── controller/EmployeeController.java
├── dtos/
│   ├── request/ (Create, Update, SearchCriteria)
│   └── response/ (EmployeeResponseDto, FunctionSummaryDto, ChantierSummaryDto)
├── entities/ (Employee, EmployeeStatut)
├── exceptions/ (NotFound, CinAlreadyExists, InvalidReference, ExceptionHandler)
├── mappers/EmployeeMapper.java
├── repositories/EmployeeRepository.java
├── services/ (EmployeeService + IEmployeeService)
├── specifications/EmployeeSpecification.java
└── imports/
    ├── EmployeeImportService.java     ← lecture du fichier, résolution Fonction/Chantier, création/MAJ atomique par CIN, génération du modèle
    ├── EmployeeImportController.java  ← POST /employees/import, GET /employees/import/modele
    ├── EmployeeImportResultDto.java
    └── EmployeeImportException.java   ← fichier illisible ou format inattendu (pas une ligne invalide)
```

---

## Modèle de données

Table `employe` :

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `BIGINT` | PK, auto-incrément | Identifiant interne |
| `nom_prenom` | `VARCHAR(150)` | `NOT NULL` | Nom et prénom |
| `cin` | `VARCHAR(30)` | `NOT NULL`, **unique** | Carte d'identité nationale |
| `date_naissance` | `DATE` | `NOT NULL` | Date de naissance |
| `date_embauche` | `DATE` | `NOT NULL` | Date d'embauche |
| `fonction_id` | `BIGINT` | `NOT NULL`, FK → `fonction.id` | Fonction occupée |
| `chantier_id` | `BIGINT` | `NOT NULL`, FK → `chantier.id` | Chantier d'affectation |
| `statut` | `ENUM('ACTIF','INACTIF')` | `NOT NULL`, défaut `ACTIF` | Statut de l'employé |

Index : `idx_employe_fonction`, `idx_employe_chantier`, `idx_employe_statut`, `idx_employe_date_embauche`.

`dateNaissance`/`dateEmbauche` sont `NOT NULL` à la fois au niveau entité et via la validation des
DTO (`@NotNull` sur `EmployeeCreateRequestDto`/`EmployeeUpdateRequestDto`) — la contrainte base et la
validation applicative sont désormais alignées (2026-09-22 ; auparavant l'entité tolérait `NULL` par
souci de compatibilité avec d'anciens imports historiques, ce qui n'a plus lieu d'être puisque
l'import comme l'API exigent déjà ces deux dates).

---

## Règles métier

- `cin` est la clé métier, unique, insensible à la casse (`findByCinIgnoreCase`).
- `fonction` et `chantier` sont résolus via `IFunctionService`/`IChantierService` (jamais leur
  Repository directement — encapsulation des domaines, `conventions/architecture.md`), puis
  attachés par référence JPA (`EntityManager.getReference`). Une fonction ou un chantier inexistant
  lève `InvalidReferenceException` (400).
- La suppression (`DELETE /employees/{id}`) n'a pas de contrainte de blocage particulière au-delà de
  l'existence de l'employé (aucune entité ne référence `Employee` à ce jour).

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/employees` | Créer un employé | 201, 400, 409 |
| `PUT` | `/employees/{id}` | Modifier un employé | 200, 400, 404, 409 |
| `GET` | `/employees/{id}` | Consulter un employé | 200, 404 |
| `POST` | `/employees/search` | Rechercher (paginé, triable) — body `EmployeeSearchCriteria` (`nomPrenom`, `cin`, `fonctionIds`, `chantierIds`, `statut`) — `fonctionIds`/`chantierIds` : filtres multi-valeurs, `null`/vide = pas de filtre sur cette dimension | 200 |
| `DELETE` | `/employees/{id}` | Supprimer | 204, 404 |
| `POST` | `/employees/import` | Importer depuis un fichier Excel (`multipart/form-data`, champ `file`) | 200, 400 |
| `GET` | `/employees/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |

`EmployeeResponseDto` : `id`, `nomPrenom`, `cin`, `dateNaissance`, `dateEmbauche`,
`fonction` (`FunctionSummaryDto` : `id`, `libelle`), `chantier` (`ChantierSummaryDto` : `id`, `code`,
`designation`), `statut`.

Authentification JWT + permissions requises sur chaque endpoint (`EMPLOYEE_READ`/
`EMPLOYEE_WRITE`/`EMPLOYEE_DELETE`/`EMPLOYEE_IMPORT`) — voir `docs/rbac/employee.md` pour le
détail endpoint ↔ permission et `conventions/security.md` pour la conception du RBAC.

---

## Import Excel

L'import Excel sert uniquement à **ajouter de nouveaux employés** (décision du 2026-10-03 : toute
modification se fait depuis l'écran Employés, jamais par un fichier). L'employé est identifié par son
**CIN** (colonne C) : un CIN inédit crée un nouvel employé, un CIN déjà présent en base **rejette la
ligne** — donc tout le fichier — sans rien modifier.

### Modèle téléchargeable

`GET /employees/import/modele` (bouton "Modèle Excel" dans l'UI, à côté du bouton "Importer") renvoie
un fichier `.xlsx` vierge contenant uniquement les 6 en-têtes attendus, dans l'ordre, généré par
`EmployeeImportService.genererModele()`. Objectif : que l'utilisateur parte toujours d'un fichier au
bon format plutôt que de deviner ou de réutiliser un fichier dont la structure a pu changer.
Volontairement **sans ligne d'exemple**, pour les mêmes raisons que le modèle Function (éviter qu'une
valeur d'exemple soit importée par erreur si elle n'est pas retirée).

### Format attendu

Fichier `.xlsx`, une ligne d'en-tête (ignorée), **6 colonnes**, dans cet ordre exact :

| Colonne | Contenu | Exemple |
|---|---|---|
| A | Date d'embauche | `14/07/2018` |
| B | Nom & prénom | `BOULJIHEL SALH` |
| C | CIN — doit être inédit en base | `PB85747` |
| D | Fonction (libellé, doit exister) | `OPERATEUR` |
| E | Chantier (code, doit exister et être actif) | `C059` |
| F | Date de naissance | `26/05/1984` |

Ce format correspond exactement au fichier `employee.xlsx` à la racine du projet. Si le fichier a
moins de 6 colonnes en en-tête, l'import est rejeté immédiatement (`400`, message explicite) avant
même de tenter de lire les données.

**Le statut n'est pas une colonne de ce format** — il ne peut pas être modifié en masse par l'import,
uniquement via l'UI (formulaire), employé par employé : les employés créés sont toujours `ACTIF`.

**Prérequis** : Fonction est résolue par libellé (aucune notion d'actif/inactif sur ce référentiel),
Chantier par code parmi les chantiers déjà **actifs** en base — ils doivent exister au préalable
(import Function, synchronisation Chantier ou saisie manuelle). L'import Employee ne crée jamais de
Fonction ni de Chantier automatiquement.

### Comportement

Import **atomique** (tout ou rien) — une seule ligne invalide rejette tout le fichier, rien n'est
créé :

| Cas | Message affiché |
|---|---|
| Fichier avec moins de 6 colonnes en en-tête | `Format de fichier invalide : 6 colonnes attendues (...), N trouvée(s).` (rejet global, 400) |
| Fichier illisible/corrompu | `Fichier Excel illisible : ...` (rejet global, 400) |
| Champ obligatoire manquant (nom, CIN, dates, fonction, chantier) | `Champs obligatoires manquants ou invalides : ...` |
| Nom & prénom > 150 caractères ou CIN > 30 caractères | `Nom/prénom ou CIN trop long` (mêmes limites que les colonnes `nom_prenom`/`cin` en base) |
| CIN en double dans le même fichier | `CIN en doublon dans le fichier` |
| CIN déjà présent en base (insensible à la casse) | `Un employé existe déjà avec ce CIN (à modifier depuis l'écran Employés)` |
| Fonction absente du référentiel | `Fonction introuvable : <valeur>` |
| Chantier absent du référentiel actif | `Chantier introuvable ou inactif : <valeur>` |
| Au moins une ligne invalide parmi les autres | `400 Bad Request`, **rien** n'est persisté, `crees = 0`, détail complet dans `lignesIgnorees` |
| Toutes les lignes valides | `200 OK`, chaque ligne crée un employé |

`EmployeeImportResultDto` : `totalLignes`, `crees`, `ignores`, `lignesIgnorees[]`
(`numeroLigne`, `cin`, `nomPrenom`, `raison`). Le corps de réponse a la même forme en succès (`200`)
qu'en rejet (`400`) — seul le code HTTP change.

**Une seule raison par ligne, ordre de vérification fixe** : si une ligne cumule plusieurs problèmes,
seul le premier détecté est rapporté (les autres ne sont pas évalués). Ordre exact :
1. champs obligatoires manquants (nom, CIN, dates, fonction, chantier) ;
2. nom/prénom ou CIN trop long ;
3. CIN en doublon dans le fichier ;
4. fonction introuvable ;
5. chantier introuvable/inactif.

Concrètement : une ligne avec un CIN trop long *et* une fonction manquante ne remontera que
`Nom/prénom ou CIN trop long` — corriger cette ligne et réimporter peut donc révéler une deuxième
erreur qui n'était pas visible au premier rejet.

Toutes les lignes sont validées avant toute écriture en base. La résolution CIN → employé existant
(et sa mutation) n'a lieu qu'une fois la totalité du fichier confirmée valide : charger puis muter une
entité JPA gérée plus tôt exposerait l'import au dirty-checking automatique d'Hibernate (flush
déclenché par une requête ultérieure ou par le commit), qui persisterait la mutation même si l'import
est finalement rejeté à cause d'une autre ligne — voir la même précaution dans
[docs/paie/README.md](../paie/README.md).

### Performance

Le référentiel Function (entier) et les chantiers actifs sont chargés **une seule fois** avant la boucle
(`Pageable.unpaged()` sur les façades `IFunctionService`/`IChantierService`) et gardés en mémoire
(`Map<String, Long>`) pour la résolution de chaque ligne — pas de requête SQL par ligne dans la
boucle, conformément à `conventions/performance.md`. La résolution CIN → employé existant reste, elle,
une requête indexée par ligne (`findByCinIgnoreCase`, colonne `cin` unique) — même choix que la
résolution (employé, période) de l'import Paie, non préchargeable puisqu'elle dépend du contenu de
chaque ligne.

---

## Frontend

Routes sous `/employees` (lazy loading, `employee.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/employees` | `EmployeeListComponent` | Liste paginée, recherche (nom, CIN, fonction, chantier, statut), tri, suppression, téléchargement du modèle, import Excel |
| `/employees/new` | `EmployeeFormComponent` | Création |
| `/employees/:id` | `EmployeeDetailComponent` | Consultation |
| `/employees/:id/edit` | `EmployeeFormComponent` | Modification (y compris statut) |

Fonction et chantier utilisent le sélecteur générique (`shared/components/lazy-select`, recherche
serveur + chargement différé — voir `conventions/frontend.md`, section Sélecteurs) : sélection
multiple pour les filtres de liste (`fonctionIds`/`chantierIds`), sélection simple dans le formulaire
(relation unique de l'employé). Le filtre Statut reste en sélection simple (2 valeurs seulement, le
multiselect n'y apporterait rien).

Le bouton "Modèle Excel" télécharge le fichier vierge (`GET /employees/import/modele`) via un lien
`<a download>` généré dynamiquement à partir du `Blob` reçu. Le bouton "Importer" déclenche un
sélecteur de fichier natif (`<input type="file" accept=".xlsx">` masqué), envoie le fichier à
`POST /employees/import`, puis affiche un résumé (toast) et le détail de chaque ligne ignorée — avec
sa raison exacte — dans une boîte de dialogue défilante.

Accès via la barre latérale de l'application (`app.component.ts`, entrée "Employés").

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- Aucune limite liée à l'authentification : tous les endpoints requièrent un JWT valide et la
  permission adéquate (voir `docs/rbac/employee.md`).
- Aucun audit (Hibernate Envers) — les créations/modifications/imports ne sont pas tracés au-delà
  des logs applicatifs.
- Aucune limite liée à la persistance : le schéma est géré par Flyway et les données survivent aux
  redémarrages (`ddl-auto=validate`, voir `conventions/database.md`).
