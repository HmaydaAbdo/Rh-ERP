# Module Paie

> Bulletins de paie mensuels des employés. Un employé a au plus **un** bulletin par mois
> (contrainte unique `employé × période`). La paie **n'est pas calculée** : le total est saisi ou importé tel
> quel. Les bulletins se créent par saisie ou par import Excel, et se **modifient uniquement depuis l'écran**.

---

## Vue d'ensemble

| | |
|---|---|
| Backend | `backend/src/main/java/staport/rh/paie/` |
| Frontend | `frontend/src/app/portail/paie/` |
| Table | `paie` |
| Endpoints | `/paie`, `/paie/search`, `/paie/periodes`, `/paie/chantiers`, `/paie/materiel`, `/paie/import`, `/paie/export`, `/paie/report/pdf` |

```text
paie/
├── controller/PaieController.java
├── dtos/
│   ├── request/ (Create, Update, SearchCriteria)
│   └── response/ (PaieResponseDto, EmployeeSummaryDto, FunctionSummaryDto, ChantierSummaryDto)
├── entities/ (Paie, YearMonthAttributeConverter)
├── exceptions/ (NotFound, AlreadyExists, InvalidReference, InvalidPeriode, ExceptionHandler)
├── mappers/PaieMapper.java
├── repositories/PaieRepository.java
├── services/ (PaieService + IPaieService)
├── specifications/PaieSpecification.java
├── imports/
│   ├── PaieImportService.java       ← lecture du fichier, résolution CIN/fonction/chantier/équipe, création des bulletins, création des fonctions manquantes, génération du modèle
│   ├── PaieImportController.java    ← POST /paie/import?periode=aaaa-MM, GET /paie/import/modele
│   └── PaieImportResultDto.java, PaieImportException.java
├── export/
│   ├── PaieExportService.java       ← orchestration (regroupement, totaux, période précédente)
│   ├── PaieSheetWriter.java         ← mise en page d'une feuille (partagée GLB/chantier/équipe)
│   ├── PaieExcelStyles.java         ← styles de cellule créés une fois par classeur
│   ├── SqueletteMateriel.java       ← tableaux « parc matériel » du chantier C168
│   ├── PaieExportRequestDto.java    ← périmètre équipe de l'export (voir section Export Excel)
│   └── PaieExportController.java    ← POST /paie/export (corps : PaieExportRequestDto)
├── reporting/                       ← périmètre commun à l'export Excel et au rapport PDF (chantiers, équipes, exclusions)
└── report/                          ← rapport PDF BI (voir docs/report/README.md)
```

---

## Modèle de données

Table `paie` :

| Colonne | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `BIGINT` | PK, auto-incrément | Identifiant interne |
| `employee_id` | `BIGINT` | `NOT NULL`, FK → `employe.id` | Employé concerné |
| `periode` | `INT` | `NOT NULL` | Année-mois, stocké `aaaaMM` (ex. 202609) via `YearMonthAttributeConverter` |
| `fonction_id` | `BIGINT` | `NOT NULL`, FK → `fonction.id` | **Snapshot** — fonction occupée ce mois-là |
| `chantier_id` | `BIGINT` | `NOT NULL`, FK → `chantier.id` | **Snapshot** — chantier d'affectation ce mois-là |
| `equipe_id` | `BIGINT` | nullable, FK → `equipe.id` | **Snapshot** — équipe ce mois-là (voir `docs/equipe/README.md`) ; `NULL` = employé sans équipe |
| `nombre_jours_travailles` | `INT` | `NOT NULL` | Jours travaillés |
| `jours_recuperation_ouvrable` | `DECIMAL(5,2)` | nullable | Jours de récupération (jour ouvrable) |
| `jours_recuperation_dimanche` | `DECIMAL(5,2)` | nullable | Jours de récupération (dimanche) |
| `salaire_mensuel` | `DECIMAL(10,2)` | `NOT NULL` | Salaire de base |
| `prime_roulage_ordinaire` | `DECIMAL(10,2)` | nullable | Prime de roulage (ordinaire) |
| `prime_roulage_dimanche` | `DECIMAL(10,2)` | nullable | Prime de roulage (dimanche) |
| `salaire_total` | `DECIMAL(10,2)` | `NOT NULL` | **Saisi (ou importé) tel quel, jamais recalculé** par le serveur — voir « Règles métier » |
| `observation` | `VARCHAR(255)` | nullable | Note libre |

**Contrainte unique** : `uk_paie_employee_periode` (`employee_id`, `periode`) — un employé a au plus
un bulletin par mois.

Index : `idx_paie_employee`, `idx_paie_periode`, `idx_paie_chantier`, `idx_paie_equipe`.

### Pourquoi fonction/chantier/équipe sont dupliqués depuis Employee ?

**Ce n'est pas une duplication accidentelle — c'est un snapshot volontaire.** `Employee.fonction` et
`Employee.chantier` reflètent la situation *actuelle* de l'employé (ils changent quand l'employé est
réaffecté). `Paie.fonction`/`Paie.chantier`/`Paie.equipe` figent la situation *du mois du bulletin* (l'équipe est une référence vers le référentiel Équipe, comme fonction et chantier).
Sans ce choix, faire pointer `Paie` directement sur `Employee` pour lire fonction/chantier
déformerait l'historique dès qu'un employé change d'affectation : un bulletin d'août afficherait le
chantier de décembre.

**Conséquence concrète** : `Paie.fonction`/`Paie.chantier` ne se mettent **jamais à jour
automatiquement** quand l'affectation de l'employé change. Ils sont fixés au moment de la création ou
de l'import du bulletin (valeur alors saisie/importée, généralement — mais pas nécessairement — celle
de l'employé à cet instant), et ne bougent plus ensuite sauf modification manuelle explicite du
bulletin (`PUT /paie/{id}`, `fonction`/`chantier` restent éditables après création pour corriger une
erreur de saisie). Un employé réaffecté en cours de mois n'entraîne donc aucune mise à jour
rétroactive ou automatique des bulletins déjà existants.

---

## Règles métier

- `(employee_id, periode)` est unique — appliqué en base (contrainte) et en service
  (`existsByEmployee_IdAndPeriode` avant `create`, 409 sinon).
- `employeeId` et `periode` sont **immuables après création** : `PaieUpdateRequestDto` ne les
  expose pas. Un bulletin est un document historique — le corriger reviendrait à en créer un autre
  pour un employé/mois différent, jamais à réassigner un bulletin existant.
- `fonction`/`chantier` restent modifiables après création (correction d'une erreur de saisie),
  `equipe` aussi (`equipeId`, facultatif : `null` = sans équipe ; un id inconnu est rejeté).
- `salaireTotal` est **saisi (formulaire/API) ou repris du fichier (import Excel, colonne « Total »)
  tel quel**, jamais recalculé par le serveur : pour la main-d'œuvre journalière, `salaireMensuel`
  porte le tarif journalier et le total vaut tarif × jours (ex. 120 × 31 = 3 720), ce qu'une somme
  `salaireMensuel + primes` fausserait. Le formulaire propose un aperçu de saisie, mais le champ
  reste modifiable. Décision du 2026-10-03 : pour l'instant la paie n'est **pas calculée**, elle est prise telle que
  saisie (formulaire) ou importée (Excel) ; un calcul automatique à partir du Pointage reste une évolution
  envisagée (voir [TODO.md](../../TODO.md), « Domaines restants »).
- Les champs numériques ne peuvent pas être négatifs (`salaireMensuel`, `salaireTotal`, primes, jours) ;
  `nombreJoursTravailles` est un entier positif ou nul ; `observation` fait 255 caractères au plus.
- La suppression (`DELETE /paie/{id}`) n'a pas de contrainte de blocage : aucune autre entité ne référence un
  bulletin. Supprimer un bulletin permet de le **réimporter** (voir « Import Excel »).

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/paie` | Créer un bulletin | 201, 400, 409 |
| `PUT` | `/paie/{id}` | Modifier un bulletin (employé/période non modifiables) | 200, 400, 404 |
| `GET` | `/paie/{id}` | Consulter un bulletin | 200, 404 |
| `POST` | `/paie/search` | Rechercher (paginé, triable) — body `PaieSearchCriteria` (`cin`, `nomPrenom`, `periode`, `fonctionIds`, `chantierIds`, `equipeIds`) — `fonctionIds`/`chantierIds`/`equipeIds` : filtres multi-valeurs, `null`/vide = pas de filtre sur cette dimension | 200 |
| `DELETE` | `/paie/{id}` | Supprimer | 204, 404 |
| `POST` | `/paie/import?periode=aaaa-MM` | Importer un fichier Excel pour une période | 200, 400 |
| `GET` | `/paie/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |
| `GET` | `/paie/periodes` | Mois qui contiennent de la paie, avec leur contenu résumé (sélecteur de mois de l'export) | 200 |
| `GET` | `/paie/chantiers?periode=2026-08` | Chantiers du mois avec leurs équipes, effectifs et masses (étape « équipes » de l'export, niveaux 2 et 3 de la vue Cartes) | 200 |
| `GET` | `/paie/materiel` | Tableaux du parc matériel prévus et leurs lignes (étape « matériel » de l'export) | 200 |
| `POST` | `/paie/export` (corps `PaieExportRequestDto`) | Exporter en Excel (GLB + par chantier + par équipe selon la configuration) | 200 |
| `POST` | `/paie/report/pdf` (corps `PaieReportPdfRequestDto`) | Rapport PDF BI de synthèse — périmètre = mêmes filtres que `/paie/search`, voir `docs/report/README.md` | 200, 404 |

`PaieResponseDto` : `id`, `employee` (`id`, `nomPrenom`, `cin`), `periode` (`"aaaa-MM"`),
`fonction` (`id`, `libelle`), `chantier` (`id`, `code`, `designation`), `equipe` (`id`, `code`, `libelle`, ou `null`),
`nombreJoursTravailles`, `joursRecuperationOuvrable`, `joursRecuperationDimanche`,
`salaireMensuel`, `primeRoulageOrdinaire`, `primeRoulageDimanche`, `salaireTotal`, `observation`.

Authentification JWT + permissions requises sur chaque endpoint (`PAIE_READ`/`PAIE_WRITE`/
`PAIE_DELETE`/`PAIE_IMPORT`/`PAIE_EXPORT`) — voir `docs/rbac/paie.md` pour le détail endpoint ↔
permission et `conventions/security.md` pour la conception du RBAC.

---

## Import Excel

### Modèle téléchargeable

`GET /paie/import/modele` (bouton "Modèle Excel" dans l'UI) renvoie un fichier `.xlsx` vierge avec
les trois lignes d'en-tête et les 13 colonnes dans l'ordre attendu, généré par
`PaieImportService.genererModele()` — pour que l'utilisateur parte d'un fichier au bon format plutôt
que de deviner ou de réutiliser un fichier dont la structure a pu changer. La colonne « Total » est
lue telle quelle (voir « Règles métier »).

### Format attendu

Fichier `.xlsx`, **trois lignes d'en-tête** (ignorées quel que soit leur contenu), colonnes dans cet
ordre exact :

| Colonne | Contenu |
|---|---|
| A | Nom & prénom (informatif — l'employé est résolu par CIN, colonne C) |
| B | Fonction (libellé — **créée automatiquement si elle n'existe pas**, voir plus bas) |
| C | CIN (doit correspondre à un employé existant) |
| D | Nombre de jours travaillés |
| E | Jours récupération ouvrable |
| F | Jours récupération dimanche |
| G | Salaire mensuel |
| H | Prime roulage ordinaire |
| I | Prime roulage dimanche |
| J | Total — repris **tel quel** dans `salaireTotal` (obligatoire, jamais recalculé) |
| K | Observation |
| L | Chantier (code, doit exister et être actif) |
| M | Équipe (code d'une équipe **existante**, facultative — un code inconnu rejette la ligne, l'équipe n'est jamais créée par l'import) |

La **période s'applique à tout le fichier** — c'est un paramètre de la requête
(`?periode=aaaa-MM`), pas une colonne : un fichier = la paie d'un mois pour tous les employés
concernés.

**Contrairement à l'import Employee** (qui crée les employés), l'import Paie exige que l'**employé**
(CIN) et le **chantier** existent déjà — il ne fait que constater une paie, jamais créer ces deux
référentiels. La **fonction** fait exception : une fonction inconnue n'est **plus une erreur**, elle
est créée automatiquement, exactement comme le ferait un import Function (même règles : un libellé
par fonction, la casse de la première occurrence est conservée). Ce traitement asymétrique est
volontaire — un import de paie mensuel de plusieurs centaines de lignes ne doit pas échouer pour un
intitulé de fonction qui n'a simplement pas encore été saisi dans le référentiel, alors qu'un CIN ou
un chantier inconnu reste le signe d'une vraie erreur de saisie à corriger.

### Comportement

Import **atomique** (tout ou rien) — une seule ligne invalide rejette tout le fichier, rien n'est
créé, **aucune fonction n'est créée non plus** :

| Cas | Message affiché |
|---|---|
| Champ obligatoire manquant (fonction, jours, salaire, chantier) | `Champs obligatoires manquants ou invalides : ...` |
| CIN sans employé correspondant | `Employé introuvable avec ce CIN` |
| CIN présent plus d'une fois dans le fichier | `CIN en doublon dans le fichier` |
| Chantier absent du référentiel actif | `Chantier introuvable ou inactif : <valeur>` |
| Bulletin déjà existant pour cet employé et cette période | `Un bulletin existe déjà pour cet employé sur cette période (à modifier depuis l'écran Paie)` |
| Au moins une ligne invalide parmi les autres | `400 Bad Request`, **rien** n'est persisté, `crees = 0`, détail complet dans `lignesIgnorees` |
| Toutes les lignes valides | `200 OK`, tous les bulletins créés, fonctions manquantes créées |

**L'import ne modifie jamais un bulletin existant** (décision du 2026-10-03) : si un bulletin existe déjà
pour (employé, période), la ligne est rejetée — donc tout le fichier. La correction d'un bulletin se
fait uniquement depuis l'écran Paie (`PUT /paie/{id}`). Pour ré-importer un mois, supprimer d'abord les
bulletins concernés.

Toutes les lignes sont d'abord validées, en ne gardant en mémoire que les valeurs brutes de chaque
ligne (pas d'entité JPA, pas de libellé de fonction résolu) : voir [../imports.md](../imports.md) pour le
principe commun. La création des fonctions manquantes et celle des bulletins n'ont lieu qu'une fois la totalité
du fichier confirmée valide : créer une fonction plus tôt la laisserait en base même si l'import est finalement
rejeté à cause d'une autre ligne. Les fonctions manquantes sont dédupliquées avant création : si dix lignes du
même fichier référencent un même libellé inédit, il n'est créé qu'une fois.

`salaireTotal` est repris de la colonne J du fichier, sans recalcul ; une ligne sans total valide est
rejetée (champ obligatoire).

`PaieImportResultDto` : `periode`, `totalLignes`, `crees`, `ignores`, `lignesIgnorees[]`
(`numeroLigne`, `cin`, `nomPrenom`, `raison`), `fonctionsCreees[]` (libellés des fonctions créées par
cet import, pour transparence — l'UI les affiche explicitement dans le toast et le détail du
résultat). Le corps de réponse a la même forme en succès (`200`) qu'en rejet (`400`) — seul le code
HTTP change.

### Performance

Employés (par CIN), chantiers actifs, équipes (par code) et l'ensemble des employés qui ont déjà un bulletin
pour la période (`PaieRepository.findEmployeeIdsByPeriode`) sont chargés **une seule fois** avant la boucle de
lecture (aucune requête par ligne), conformément à `conventions/performance.md`. Le référentiel
Function est chargé une seconde fois, séparément, dans la phase de persistance (après confirmation
que le fichier est entièrement valide) — nécessaire pour disposer d'un état à jour incluant les
fonctions qui viennent d'être créées, avant de résoudre l'id de chaque ligne.

---

## Export Excel et Rapport PDF

La génération de documents à partir des bulletins de paie est documentée dans
**`docs/report/README.md`** : export Excel multi-feuilles (opérationnel, assistant d'export dédié
`PaieExportWizardComponent`) et rapport PDF (BI RH/Paie de synthèse pour la direction,
téléchargement direct sans dialog sur la période sélectionnée dans la liste) — architecture, modèle
analytique et catalogue de KPI du rapport PDF, structure des feuilles/sections, paramétrage
chantier/équipe, règle Include/Exclude, et points d'extension. Ne pas dupliquer cette documentation
ici — seules les règles ci-dessous, propres au champ `Paie.equipe` en tant que donnée métier
(indépendantes du format de sortie), restent dans ce document.

Trois routes de lecture alimentent l'assistant d'export (toutes `PAIE_READ`, chacune en **une seule requête
groupée**) :

- `GET /paie/periodes` : un résumé par mois qui contient de la paie, du plus récent au plus ancien
  (`periode` `aaaa-MM`, `nombreBulletins`, `nombreChantiers`, `masse`, `stc`). L'assistant l'utilise pour
  proposer uniquement ces mois et afficher aussitôt leur contenu. Le décompte STC reproduit
  `ObservationStc.estStcOuSortie` en JPQL.
- `GET /paie/chantiers?periode=aaaa-MM` : les chantiers du mois du plus gros (masse) au plus petit, chacun avec
  `code`, `libelle` (nom, à défaut désignation), `effectif`, `masse` et ses équipes (`id`, `code`, `libelle`,
  `effectif`, `masse`). Les bulletins sans équipe comptent dans l'effectif du chantier mais n'ont pas d'équipe listée.
  La sélection manipulée et envoyée au backend reste le **code** de l'équipe (voir section suivante).
- `GET /paie/materiel` : les tableaux du parc matériel prévus (`chantierCode`, `equipeCode`, `titre`, `libelles`),
  lus dans `MaterielChantierCatalogue` pour que l'assistant sache quels nombres demander sans dupliquer la règle
  (voir `docs/report/README.md`, « Parc matériel »).

### Regroupement par équipe : par code du référentiel Équipe

`Paie.equipe` référence le domaine **Équipe** (`docs/equipe/README.md`). Le regroupement pour les
sous-feuilles équipe (`PaieExportService.ecrireFeuillesEquipes`) et le rapprochement avec le mois
précédent se font par **code d'équipe** (`Equipe.code`, normalisé trim + majuscules et unique en
base) : `"ch"` et `"CH"` ne peuvent plus produire deux équipes distinctes, ce qui supprime l'ancienne
source d'erreur silencieuse du texte libre.

À l'import Excel (colonne M), le code est résolu **insensiblement à la casse et aux espaces**
contre le référentiel ; un code inconnu rejette la ligne (`« Équipe introuvable : X »`), donc tout le
fichier (import atomique). Une cellule vide laisse le bulletin sans équipe.

Le détail des règles de mise en page (total du mois précédent, colonne STC, squelette matériel
C168, cas des feuilles sans ligne) et du rapport PDF est dans `docs/report/README.md`.

---

## Frontend

Routes sous `/paie` (lazy loading, `paie.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/paie` | `PaieListComponent` | Tableau standard avec filtres en temps réel (nom, CIN, période, fonctions, chantiers, équipes), suppression, téléchargement du modèle, import (avec sélecteur de période). Un seul bouton « Exporter » ouvre `PaieExportWizardComponent`, l'**assistant d'export en étapes** (mois, format, équipes, matériel, génération) décrit dans `docs/report/README.md`, « Assistant d'export » |
| `/paie/cartes` | `PaieCartesComponent` | Vue **Cartes** en trois niveaux de descente, voir « Vue Cartes » ci-dessous |
| `/paie/new` | `PaieFormComponent` | Création — sélection de l'employé, de la fonction, du chantier et de l'équipe (facultative) via le sélecteur générique (`shared/components/lazy-select`, voir `conventions/frontend.md` — recherche serveur + chargement différé) |
| `/paie/:id` | `PaieDetailComponent` | Consultation |
| `/paie/:id/edit` | `PaieFormComponent` | Modification — employé et période affichés en lecture seule avec un message explicite |

Un sélecteur de vue (`PaieVueSwitcherComponent`, `vue-switcher/`) est affiché en tête de chaque vue du module :
Tabulaire (`/paie`) et Cartes (`/paie/cartes`). Chaque vue est une route lazy autonome ; le sélecteur ne fait que
les relier. Une troisième vue, Analytique, est prévue (voir [TODO.md](../../TODO.md)).

### Vue Cartes

`PaieCartesComponent` (`cartes/`), **lecture seule**, descend en trois niveaux. Le niveau courant est porté par
l'URL — `/paie/cartes` (mois), `/paie/cartes?periode=2026-08` (chantiers du mois),
`/paie/cartes?periode=2026-08&chantier=C168` (équipes du chantier) — donc le retour du navigateur et le lien direct
fonctionnent, et un mois ou un chantier inconnu affiche un message avec un lien de retour.

| Niveau | Contenu | Source |
|---|---|---|
| 1. Mois | Une carte par mois contenant de la paie : masse, bulletins, chantiers, STC / sorties, variation de la masse **par rapport au mois contigu** (absente si le mois précédent n'a aucune paie ou une masse nulle, jamais comparée à un mois plus ancien) | `GET /paie/periodes` |
| 2. Chantiers | Tuiles de synthèse du mois, recherche par code ou nom, une carte par chantier (masse, bulletins, équipes, jauge de sa part de la masse du mois) | `GET /paie/chantiers?periode=` (chargé une seule fois par mois, puis gardé en mémoire) |
| 3. Équipes | Tuiles du chantier, tableau des équipes (équipe, libellé, effectif, masse, part du chantier) avec ligne de total. Une ligne **« Sans équipe »** est déduite (effectif et masse du chantier moins ceux des équipes) pour que le total égale celui du chantier ; elle n'apparaît que s'il existe des bulletins sans équipe | même appel |

Le tableau du niveau 3 suit les conventions des tableaux (tri, redimensionnement, réordonnancement, choix des
colonnes, pagination avec total, recherche en temps réel) en mode client : la liste est courte et déjà en mémoire.

**Animations** : cartes et tuiles apparaissent en cascade, les montants et effectifs s'incrémentent
(`CountUpDirective`), la jauge se remplit, et chaque niveau glisse depuis la droite en descendant, depuis la gauche en
remontant. Tout est coupé quand l'utilisateur a demandé moins de mouvement dans son système.

Les filtres de la vue tabulaire (nom, CIN, fonctions…) ne s'appliquent pas aux cartes : elles portent sur le mois entier.
Les boutons d'import, d'export et de création restent propres à la vue tabulaire.

Les filtres fonction/chantier de la liste (`fonctionIds`/`chantierIds`) et les champs employé/
fonction/chantier du formulaire utilisent tous le même sélecteur générique — seule la cardinalité
change (sélection multiple pour les filtres de liste, simple pour les relations uniques du
formulaire, voir `conventions/frontend.md`, section Sélecteurs). `EmployeeReferenceService`,
`FunctionReferenceService` et `ChantierReferenceService` (`shared/reference-data/`) fournissent
chacun une implémentation du contrat de pagination/recherche attendu par ce composant — plus de
distinction entre une recherche paginée (employés) et un chargement complet (fonction/chantier),
les trois interrogent désormais leur endpoint `/search` page par page.

Le tableau de la liste (comme tous les tableaux de l'application, voir `conventions/frontend.md`,
section Tableaux) propose : tri sur chaque colonne, redimensionnement, réordonnancement par
glisser-déposer, sélecteur de colonnes visibles et pagination avec total de lignes. L'en-tête est sur
**une seule ligne** (Nom & prénom, Fonction, CIN, Jours trav., J.R.O, J.R.D, Salaire, Prime RO,
Prime RD, Total, Obs, Chantier, Équipe, Période) : l'ancien en-tête groupé à deux lignes (« Nbre Jrs »,
« SALAIRE ») a été abandonné car PrimeNG ne permet pas de réordonner ni de masquer des colonnes dans un
en-tête groupé (décision du 2026-10-03).

Accès via la barre latérale (`core/navigation/nav-items.ts`, entrée « Paie », permission `PAIE_READ`). Les boutons
de création, modification, suppression, import et export sont conditionnés par `PAIE_WRITE`, `PAIE_DELETE`,
`PAIE_IMPORT` et `PAIE_EXPORT` (voir [../rbac/paie.md](../rbac/paie.md)). Les sélecteurs du formulaire et des
filtres (employé, fonction, chantier, équipe) interrogent les autres domaines : un rôle qui saisit des bulletins
doit aussi pouvoir les lire.

---

## Évolutions prévues

Voir [TODO.md](../../TODO.md) pour le détail complet — deux sujets qui dépendent du domaine Pointage, qui
n'existe pas encore :

- **Calcul de la paie depuis le Pointage** : évolution envisagée (décision du 2026-09-22), **non retenue pour
  l'instant** : la paie est prise telle que saisie ou importée (décision du 2026-10-03). Si elle est un jour
  construite, l'import Excel de la paie disparaîtrait au profit d'un calcul à la validation du Pointage.
- **Statuts provisoire / validé (Pointage et Paie)** : une fois validé, un pointage ou un bulletin
  sera figé (non modifiable) ; seul l'état provisoire restera éditable. Un mois ne pourra être saisi
  que si le mois précédent est validé, imposant une progression strictement séquentielle.

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- **Aucun calcul** : `salaireMensuel`, les primes et `salaireTotal` sont saisis ou importés. Rien ne vérifie
  leur cohérence entre eux (pas de contrôle « total = tarif × jours »).
- **Qualité des données** : l'équipe, l'observation, les jours de récupération et les primes sont facultatifs
  (340 bulletins n'ont pas d'équipe au dernier relevé) ; décision « tous champs obligatoires » dans la tâche
  dédiée du TODO.
- **Pas de statut** provisoire / validé : un bulletin reste toujours modifiable et supprimable.
- Aucun audit (Hibernate Envers) — une modification de bulletin n'est tracée que dans les logs.
