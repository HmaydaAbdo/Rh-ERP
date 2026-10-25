# Module Employee

> Fiche d'identité des employés — domaine de référence de l'ERP RH. Référence les domaines Function
> (fonction occupée) et Chantier (affectation) par clé étrangère. Les nouveaux employés s'ajoutent par saisie
> ou par import Excel en masse ; toute **modification** d'un employé existant se fait depuis l'interface.

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
    ├── EmployeeImportService.java     ← lecture du fichier, résolution Fonction/Chantier, création atomique (CIN inédit), génération du modèle
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
| `chantier_id` | `BIGINT` | nullable, FK → `chantier.id` | Chantier courant; obligatoire pour `ACTIF`, vide pour `INACTIF` |
| `equipe_id` | `BIGINT` | nullable, FK → `equipe.id` | Équipe courante; facultative pour `ACTIF`, vide pour `INACTIF`; référentiel partagé décrit dans le [dossier Équipe](../equipe/README.md) |
| `salaire` | `NUMERIC(10,2)` | nullable, ≥ 0 | Salaire du dernier mois de paie : montant mensuel, ou tarif d'une journée |
| `type_salaire` | `VARCHAR(20)` | nullable, `MENSUEL` ou `JOURNALIER` | Comment lire `salaire` ; renseigné avec lui ou pas du tout |
| `statut` | `ENUM('ACTIF','INACTIF')` | `NOT NULL`, défaut `ACTIF` | Statut de l'employé |

La fiche porte **l'état courant de l'employé**, aligné sur le dernier mois de paie enregistré. Un employé `ACTIF` a un chantier
courant et peut avoir une équipe; un employé `INACTIF` n'a ni chantier ni équipe courants. Ses bulletins conservent les
affectations de chaque mois, y compris après un départ ou une mutation. Voir [ADR 0010](../adr/0010-employe-etat-du-dernier-mois-de-paie.md).
Salaire et type restent vides tant qu'aucune paie ne les a renseignés.

Table `employe_sortie` — les **départs** de l'entreprise (entité `EmployeeSortie`, auditée) :

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `BIGINT` | PK, auto-incrément | Identifiant interne |
| `employee_id` | `BIGINT` | `NOT NULL`, FK → `employe.id` | Employé parti |
| `periode` | `INT` | `NOT NULL` | Mois (`aaaaMM`) de la paie qui constate le départ |
| `motif` | `VARCHAR(255)` | `NOT NULL` | « STC », ou le motif saisi |

Unique `(employee_id, periode)` : un départ par mois au plus ; un employé qui revient puis repart en a plusieurs. La reprise
des données existantes (migration V30, décidée le 2026-10-18) est décrite dans l'ADR 0010.

Index : `idx_employe_fonction`, `idx_employe_chantier`, `idx_employe_equipe`, `idx_employe_statut`, `idx_employe_date_embauche`.

`dateNaissance`/`dateEmbauche` sont `NOT NULL` à la fois au niveau entité et via la validation des
DTO (`@NotNull` sur `EmployeeCreateRequestDto`/`EmployeeUpdateRequestDto`) — la contrainte base et la
validation applicative sont désormais alignées (2026-09-22 ; auparavant l'entité tolérait `NULL` par
souci de compatibilité avec d'anciens imports historiques, ce qui n'a plus lieu d'être puisque
l'import comme l'API exigent déjà ces deux dates).

---

## Règles métier

- `cin` est la clé métier : le service et l'import retirent les espaces extérieurs. V27 impose
  l'unicité après trim et sans tenir compte de la casse, au moyen d'un index sur
  `UPPER(BTRIM(cin))`, et bloque les nouvelles valeurs entourées d'espaces en base. Les collisions
  existantes font échouer V27 pour être résolues explicitement, sans fusion implicite.
- `fonction` et `chantier` sont résolus via `IFunctionService`/`IChantierService` (jamais leur
  Repository directement — encapsulation des domaines, `conventions/architecture.md`), puis
  attachés par référence JPA (`EntityManager.getReference`). Une fonction ou un chantier inexistant
  lève `InvalidReferenceException` (400). L'`équipe` est facultative et résolue de même par `IEquipeService`.
- Lorsqu'un bulletin est créé ou corrigé manuellement depuis Paie, l'équipe choisie met à jour l'affectation
  courante d'un employé actif dans la même transaction. Une fiche inactive reste sans affectation; les données du
  bulletin restent historiques et indépendantes.
- `salaire` et `typeSalaire` se renseignent **ensemble** ou pas du tout (`@AssertTrue` sur les DTO, 400 sinon) ; le salaire
  n'est jamais négatif. Ce sont des **données de paie** : sans `PAIE_READ`, l'API ne les renvoie pas (`null`), ignore ceux
  qu'on saisit (la fiche garde les siens) et retire un tri par salaire. La règle est `ProjectionPaieEmployee`, appliquée
  à la frontière HTTP (`EmployeeController`) et par les outils MCP de l'assistant IA ; les autres domaines lisent le
  vrai salaire par `IEmployeeService`.
- La suppression (`DELETE /employees/{id}`) supprime l'employé. **Un employé référencé par au moins un bulletin de paie**
  (`paie.employee_id`) **ou lié à un compte utilisateur** (`utilisateur.employee_id`) **n'est pas supprimable** : la base refuse
  et l'API répond `409` avec un message explicite (`EmployeeExceptionHandler`, comme pour fonction, chantier et équipe — un
  contrôle dans le service créerait une dépendance circulaire avec les domaines Paie et Auth). Le message invite à passer
  l'employé à `INACTIF`, qui conserve son historique ; l'écran le rappelle dans la confirmation. La tentative refusée reste
  tracée dans le journal d'audit (échec).
- **Libellés** (décision du propriétaire, 2026-10-19) : l'interface dit **« En poste »** (`ACTIF`) et **« Sorti »**
  (`INACTIF`) ; l'API et la base gardent `ACTIF` / `INACTIF`.
- Un employé `INACTIF` (« Sorti ») reste consultable et reste référencé par ses bulletins. Sa fiche ne conserve aucune
  affectation courante de chantier ou d'équipe; la contrainte de base protège cette règle. L'import crée toujours des employés `ACTIF`.
- **Le statut suit la paie** : l'assistant d'import de la paie (voir [../paie/README.md](../paie/README.md), « Import Excel
  (assistant) ») repasse ACTIF un inactif présent dans le fichier, et enregistre les **départs confirmés** par
  `IEmployeeService.enregistrerSortie(id, mois, motif)` : l'employé passe INACTIF, ses affectations courantes sont effacées et le départ (mois, motif « STC » ou saisi)
  rejoint `employe_sortie` — un seul par mois (sinon 400), motif obligatoire de 255 caractères au plus. Action d'audit
  `EMPLOYE_SORTIE`. Depuis l'assistant, l'utilisateur peut aussi aligner une fiche sur le fichier ou créer un CIN inconnu
  (ce sont les `update` et `create` habituels, appelés par le domaine Paie).

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/employees` | Créer un employé | 201, 400, 409 |
| `PUT` | `/employees/{id}` | Modifier un employé | 200, 400, 404, 409 |
| `GET` | `/employees/{id}` | Consulter un employé | 200, 404 |
| `POST` | `/employees/search` | Rechercher (paginé, triable) — body `EmployeeSearchCriteria` (`nomPrenom`, `cin`, `fonctionIds`, `chantierIds`, `equipeIds`, `statut`) — filtres multi-valeurs, `null`/vide = pas de filtre sur cette dimension ; `chantierIds=0` = sans chantier, `equipeIds=0` = sans équipe (« Orphelins » dans le filtre) | 200 |
| `POST` | `/employees/regroupements?dimension=CHANTIER\|EQUIPE\|FONCTION` | Employés du périmètre (mêmes critères) regroupés par la dimension : `id` (0 = sans chantier ou équipe), `code`, `libelle`, `effectif`, `actifs`, du groupe le plus grand au plus petit (vue Cartes, répartition de l'Analytique) | 200 |
| `POST` | `/employees/analytique` | Chiffres clés du périmètre : effectif, actifs, inactifs, âge et ancienneté moyens (années, une décimale), embauches des 12 derniers mois, tranches d'âge et d'ancienneté (vue Analytique) | 200 |
| `DELETE` | `/employees/{id}` | Supprimer | 204, 404, 409 (bulletins ou compte liés) |
| `POST` | `/employees/import` | Importer depuis un fichier Excel (`multipart/form-data`, champ `file`) | 200, 400 |
| `GET` | `/employees/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |

`EmployeeResponseDto` : `id`, `nomPrenom`, `cin`, `dateNaissance`, `dateEmbauche`,
`fonction` (`FunctionSummaryDto` : `id`, `libelle`), `chantier` (`ChantierSummaryDto` : `id`, `code`,
`designation`, ou `null` pour un employé inactif), `equipe` (`EquipeSummaryDto` : `id`, `code`, `libelle`, ou `null`), `salaire` et `typeSalaire` (`null` sans
`PAIE_READ` ou tant qu'aucune paie ne les a renseignés), `statut`. Les requêtes de création et de modification acceptent
`equipeId`, `salaire` et `typeSalaire`, facultatifs.
Le formulaire propose « Orphelins (sans équipe) » comme choix synthétique; il enregistre `equipeId: null`, jamais `0`.

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

`GET /employees/import/modele` (entrée « Télécharger le modèle Excel » du menu du bouton fractionné « Importer » dans l'UI) renvoie
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

Le plus sûr est de partir du modèle téléchargeable. Si le fichier a moins de 6 colonnes en en-tête, l'import est
rejeté immédiatement (`400`, message explicite) avant même de tenter de lire les données.

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

Toutes les lignes sont validées avant toute écriture en base, sur des valeurs brutes (aucune entité JPA gérée
pendant la validation) : voir [../imports.md](../imports.md) pour le principe commun à tous les imports.

### Performance

Le référentiel Function (entier), les chantiers actifs et l'ensemble des CIN déjà présents en base
(`EmployeeRepository.findAllCinsEnMajuscules`) sont chargés **une seule fois** avant la boucle
(`Pageable.unpaged()` sur les façades `IFunctionService`/`IChantierService`) et gardés en mémoire
(`Map`/`Set`) pour la résolution de chaque ligne — aucune requête SQL par ligne dans la boucle,
conformément à `conventions/performance.md`.

---

## Frontend

Routes sous `/employees` (lazy loading, `employee.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/employees` | `EmployeeListComponent` | **Vue Tabulaire** : tableau standard (tri, colonnes redimensionnables/réordonnables/masquables, pagination, voir [../frontend/README.md](../frontend/README.md)) filtré par la barre commune, avec les colonnes Équipe et, pour `PAIE_READ`, Salaire (« / mois » ou « / jour ») ; consultation, modification, suppression |
| `/employees/new` | `EmployeeFormComponent` | Création ; équipe facultative ; salaire et type (mensuel ou journalier) ensemble, proposés seulement avec `PAIE_READ` |
| `/employees/:id` | `EmployeeDetailComponent` | **Fiche de l'employé** : initiales, nom, CIN et statut ; situation actuelle (fonction, chantier, équipe, ancienneté depuis l'embauche, âge) ; avec `PAIE_READ`, le salaire (« par mois » ou « par jour ») et le **parcours** (`PaieParcoursComponent`, domaine Paie : chiffres, chronologie des changements, total perçu par mois, bulletins) |
| `/employees/:id/edit` | `EmployeeFormComponent` | Modification (y compris statut, équipe, et salaire avec `PAIE_READ`) |

Les vues des employés sont les routes filles de `EmployeeVuesComponent` (`vues/`), qui configure la coque partagée `app-collection-shell`; la liste utilise également `app-collection-table`. Le domaine fournit le titre, les
**actions** (`EmployeeActionsComponent`, `actions/` : « Importer », avec le modèle Excel dans son menu, et « Nouvel employé »,
chacune avec sa permission) et la **barre de filtres** (`EmployeeFiltresComponent`, `filtres/` : nom, CIN, fonctions, chantiers,
statut, « Réinitialiser »), une seule fois pour toutes les vues. Les écrans de saisie et de consultation n'en font pas partie.
Les **filtres vivent dans l'URL** (`?nom=ali&cin=AB1&fonctionIds=7&chantierIds=3,4&statut=ACTIF`, voir `filtres/employee-filtres.ts`) :
la barre les écrit (nom et CIN après un court délai), chaque vue les lit ; lien direct et retour navigateur les conservent, une
valeur invalide est ignorée. Un import réussi recrée la vue affichée, qui recharge ses données. Les onglets (`VueSwitcherComponent`, partagé avec la Paie)
mènent aux trois vues ; l'en-tête à onglets est le style global `.app-vues` (`styles/_page.scss`), commun avec la Paie.

### Vues Cartes et Analytique

Les deux vues sont les **vues partagées par tous les modules** ([Vues Cartes et Analytique partagées](../frontend/vues-perimetre.md), ADR 0014) : `EmployeeCartesComponent` et
`EmployeeAnalytiqueComponent` ne sont que des hôtes minces, `employee-module.ts` décrit le module (pas de référentiel propre ;
périmètre = barre de filtres : chantiers, équipes, fonctions, nom, CIN, statut).

**Cartes** (lecture seule). On descend dans l'effectif selon la hiérarchie **chantier → équipe → fonction → employés**.
L'ouverture d'une carte avance automatiquement à l'étape suivante et ajoute une **étape au fil** ; chaque étape se retire
seule. **« Voir la liste »** ouvre la vue Tabulaire sur le même périmètre. Tout est dans l'URL : les étapes sont
`chantierIds`, `equipeIds` (0 = sans équipe) et `fonctionIds`. Les anciens liens contenant `?par=` suivent maintenant la
hiérarchie définie par le domaine.
Chaque carte montre l'effectif, la part des employés en poste (jauge) et, avec `PAIE_READ`, la paie du mois (payés, masse, STC)
avec l'écart sur le mois contigu.

**Analytique** (graphiques). Les données Employé viennent en premier, suivies du bloc Paie. Avec `EMPLOYEE_READ` : six chiffres
clés (effectif, en poste, sortis, âge moyen, ancienneté moyenne, embauches sur 12 mois), la **pyramide des âges** et l'**ancienneté**
par tranche, la **répartition** en poste / sortis
par chantier, équipe ou fonction (les 12 plus grands groupes ; tous dans le tableau de données). Avec `PAIE_READ` : les chiffres
du mois, l'évolution mensuelle, la répartition de la paie, les tranches de total et les **mouvements mois par mois**
(`POST /paie/effectifs` : employés payés, entrées, sorties, mutations). Chaque graphique a son tableau de données (« Voir les
données »). Les mouvements suivent le chantier, l'équipe et la fonction **du bulletin du mois** ; le nom, le CIN et le statut de
la barre ne s'y appliquent pas (l'écran le dit).

Tranches retenues par le propriétaire (2026-10-19) : âge **moins de 25, 25-34, 35-44, 45-54, 55 ans et plus** (années pleines) ;
ancienneté **moins d'un an, 1-3, 3-5, 5-10, 10 ans et plus** (de borne à borne : 1-3 = d'un an à moins de trois).

Fonction et chantier utilisent le sélecteur générique (`shared/components/lazy-select`, recherche
serveur + chargement différé — voir `conventions/frontend.md`, section Sélecteurs) : sélection
multiple pour les filtres de liste (`fonctionIds`/`chantierIds`), sélection simple dans le formulaire
(relation unique de l'employé). Le filtre Statut reste en sélection simple (2 valeurs seulement, le
multiselect n'y apporterait rien).

L'entrée « Télécharger le modèle Excel » du bouton « Importer » télécharge le fichier vierge (`GET /employees/import/modele`) via un lien
`<a download>` généré dynamiquement à partir du `Blob` reçu. Le bouton "Importer" déclenche un
sélecteur de fichier natif (`<input type="file" accept=".xlsx">` masqué), envoie le fichier à
`POST /employees/import`, puis affiche un résumé (toast) et le détail de chaque ligne ignorée — avec
sa raison exacte — dans une boîte de dialogue défilante.

Colonnes du tableau : Nom & prénom, CIN, Fonction, Chantier, Date d'embauche, Statut. Accès via la barre latérale
(`core/navigation/nav-items.ts`, entrée « Employés », permission `EMPLOYEE_READ`). Les boutons de création,
modification, suppression et import sont conditionnés par `EMPLOYEE_WRITE`, `EMPLOYEE_DELETE` et
`EMPLOYEE_IMPORT` (voir [../rbac/employee.md](../rbac/employee.md)).

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- Audité (voir [../audit/README.md](../audit/README.md)) : créations, modifications, suppressions et imports (fichier : nom,
  taille, empreinte) ; l'historique d'un employé s'ouvre depuis son détail (bouton **Historique**, permission `AUDIT_READ`).
- Aucun lien avec le Pointage, qui reste à construire.
