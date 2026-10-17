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
| `nombre_jours_travailles` | `NUMERIC(5,2)` | `NOT NULL` | Jours travaillés, jusqu'à deux décimales |
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
  (`existsByEmployee_IdAndPeriode` avant `create`, 409 sinon, y compris lorsqu'une création concurrente
  gagne la course et déclenche la contrainte PostgreSQL).
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
  `nombreJoursTravailles` accepte de 0 à 999,99 avec au plus deux décimales ; `observation` fait 255 caractères au plus.
- La suppression (`DELETE /paie/{id}`) n'a pas de contrainte de blocage : aucune autre entité ne référence un
  bulletin. Supprimer un bulletin permet de le **réimporter** (voir « Import Excel »). La suppression **en groupe**
  (`POST /paie/suppression`) suit la même règle, avec les garde-fous décrits dans « Suppression en groupe ».

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/paie` | Créer un bulletin | 201, 400, 409 |
| `PUT` | `/paie/{id}` | Modifier un bulletin (employé/période non modifiables) | 200, 400, 404 |
| `GET` | `/paie/{id}` | Consulter un bulletin | 200, 404 |
| `POST` | `/paie/search` | Rechercher (paginé, triable) — body `PaieSearchCriteria` (`cin`, `nomPrenom`, `periode`, `fonctionIds`, `chantierIds`, `equipeIds`) — `fonctionIds`/`chantierIds`/`equipeIds` : filtres multi-valeurs, `null`/vide = pas de filtre sur cette dimension | 200 |
| `POST` | `/paie/options/chantiers?page=0&size=30` (corps `PaieOptionsChantierRequest`: `periode`, `recherche`) | Page triée par code des chantiers avec paie sur le mois ; recherche serveur sur code et désignation | 200, 400 |
| `POST` | `/paie/options/equipes?page=0&size=30` (corps `PaieOptionsEquipeRequest`: `periode`, `chantierIds`, `recherche`) | Page triée par code des équipes présentes sur le mois et les chantiers choisis ; recherche serveur sur code et libellé | 200, 400 |
| `DELETE` | `/paie/{id}` | Supprimer | 204, 404 |
| `POST` | `/paie/suppression` (corps `PaieSuppressionGroupeRequestDto` : `criteres` avec `periode` obligatoire, `nombreAttendu`) | Supprimer d'un coup un groupe de bulletins (carte de la vue Cartes) — voir « Suppression en groupe » | 200, 400, 409 |
| `POST` | `/paie/import?periode=aaaa-MM` | Importer un fichier Excel pour une période | 200, 400 |
| `GET` | `/paie/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |
| `GET` | `/paie/periodes` | Mois qui contiennent de la paie, avec leur contenu résumé (sélecteur de mois de l'export) | 200 |
| `GET` | `/paie/chantiers?periode=2026-08` | Chantiers du mois avec leurs équipes, effectifs et masses (étape « équipes » de l'export) | 200 |
| `POST` | `/paie/analytique` (corps `PaieSearchCriteria`, `periode` obligatoire) | Indicateurs du tableau de bord d'un mois sur le périmètre filtré (vue Analytique et graphiques Cartes) | 200, 400 |
| `POST` | `/paie/periodes/search` (corps `PaieSearchCriteria`, `periode` ignorée) | Les mois qui contiennent de la paie sur le périmètre filtré, avec masse et STC (Cartes) | 200 |
| `POST` | `/paie/chantiers/search` (corps `PaieSearchCriteria`, `periode` obligatoire) | Chantiers et équipes du mois, avec masse, effectif et STC du mois ainsi que leurs valeurs du mois civil précédent (Cartes) | 200, 400 |
| `GET` | `/paie/materiel` | Tableaux du parc matériel prévus et leurs lignes (étape « matériel » de l'export) | 200 |
| `POST` | `/paie/export` (corps `PaieExportRequestDto`) | Exporter en Excel (GLB + par chantier + par équipe selon la configuration) | 200 |
| `POST` | `/paie/report/pdf` (corps `PaieReportPdfRequestDto`) | Rapport PDF BI de synthèse — périmètre = mêmes filtres que `/paie/search` + `sansVueEnsemble` (retire le chapitre « Vue d'ensemble »), voir `docs/report/README.md` | 200, 404 |

`PaieResponseDto` : `id`, `employee` (`id`, `nomPrenom`, `cin`), `periode` (`"aaaa-MM"`),
`fonction` (`id`, `libelle`), `chantier` (`id`, `code`, `designation`), `equipe` (`id`, `code`, `libelle`, ou `null`),
`nombreJoursTravailles`, `joursRecuperationOuvrable`, `joursRecuperationDimanche`,
`salaireMensuel`, `primeRoulageOrdinaire`, `primeRoulageDimanche`, `salaireTotal`, `observation`.

Authentification JWT + permissions requises sur chaque endpoint (`PAIE_READ`/`PAIE_WRITE`/
`PAIE_DELETE`/`PAIE_PURGE`/`PAIE_IMPORT`/`PAIE_EXPORT`) — voir `docs/rbac/paie.md` pour le détail endpoint ↔
permission et `conventions/security.md` pour la conception du RBAC.

---

## Import Excel

### Modèle téléchargeable

`GET /paie/import/modele` (entrée « Télécharger le modèle Excel » du menu du bouton fractionné « Importer » dans l'UI) renvoie un fichier `.xlsx` vierge avec
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
| Champ obligatoire manquant (CIN, fonction, jours, salaire, total, chantier) | `Champs obligatoires manquants ou invalides : ...` |
| Jour fractionnaire, valeur négative pour jours/salaires/primes, ou observation de plus de 255 caractères | `400 Bad Request`, ligne détaillée dans `lignesIgnorees` |
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
  `id`, `code`, `libelle` (nom, à défaut désignation), `effectif`, `masse` et ses équipes (`id`, `code`, `libelle`,
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
| `/paie` | `PaieListComponent` | **Vue tabulaire** : tableau standard (tri, colonnes, pagination) filtré par la barre commune, suppression, téléchargement du modèle, import (avec sélecteur de période). Un seul bouton « Exporter » ouvre `PaieExportWizardComponent`, l'**assistant d'export en étapes** (mois, format, équipes, matériel, génération) décrit dans `docs/report/README.md`, « Assistant d'export » |
| `/paie/cartes` | `PaieCartesComponent` | Vue **Cartes** en quatre niveaux de descente, voir « Vue Cartes » ci-dessous |
| `/paie/analytique` | `PaieAnalytiqueComponent` | Vue **Analytique** : tableau de bord interactif, voir « Vue Analytique » ci-dessous |
| `/paie/new` | `PaieFormComponent` | Création — sélection de l'employé, de la fonction, du chantier et de l'équipe (facultative) via le sélecteur générique (`shared/components/lazy-select`, voir `conventions/frontend.md` — recherche serveur + chargement différé) |
| `/paie/:id` | `PaieDetailComponent` | Consultation |
| `/paie/:id/edit` | `PaieFormComponent` | Modification — employé et période affichés en lecture seule avec un message explicite |

Les trois vues (tabulaire, cartes, analytique) sont les routes filles d'une **coque commune**, `PaieVuesComponent`
(`vues/`) : le titre, le sélecteur de vue (`PaieVueSwitcherComponent`, qui **réinitialise les filtres** en changeant de vue), les
**actions** (`PaieActionsComponent`, `actions/`) et la **barre de filtres commune**, une seule fois pour les trois. Les écrans de saisie et de consultation d'un bulletin
(`/paie/new`, `/paie/:id`…) n'en font pas partie.

### Barre de filtres commune

**Mise en page de l'écran (identique dans les trois vues).** L'en-tête porte le titre **Paie** et, sur la même ligne, les trois
**onglets de vue** soulignés (Tabulaire, Cartes, Analytique) posés sur un filet, puis, **à droite, au même niveau**, les trois
**actions** du moins au plus important : **Exporter**, **Importer** (bouton fractionné dont le menu propose le **modèle Excel**,
le fichier que l'import attend) et **Nouveau bulletin** (bouton plein) — les mêmes dans les trois vues, chacun avec sa permission
(`PAIE_EXPORT`, `PAIE_IMPORT`, `PAIE_WRITE`). Dessous, la **barre de filtres** ; dessous, le contenu de la vue. Dans le tabulaire,
une **barre du tableau** porte le total (« 972 bulletins ») à gauche et l'outil **Colonnes** à droite. Un import réussi (ou
partiel) **recrée la vue affichée** (`PaieVuesComponent.rafraichirVue`) : elle recharge ses données et les mois de la barre.

`PaieFiltresComponent` (`filtres/`) est **la même barre dans les trois vues, sur une seule ligne et entièrement visible dès
l'arrivée** — aucun bouton « Filtres » à ouvrir. Contrôles de même hauteur (`--control-height`), posés à plat sur la page : le
mois (groupe `‹ Août 2026 › ✕` : flèches vers le mois précédent / suivant qui contient de la paie, grille de mois dans un
panneau, croix pour revenir à « tous les mois »), la recherche **nom et prénom** et **CIN** (« contient », sans casse), les
sélecteurs **chantiers, équipes et fonctions** (sélecteur générique multiple, recherche serveur, mode compact : la valeur seule
quand il y en a une, « 3 chantiers » à partir de deux) et « Effacer ». Quand la largeur manque, la ligne passe à la suivante. **Sur téléphone**, la barre tient sur deux lignes — le mois (pleine largeur), puis la recherche, « Filtres (n) » et « Effacer » (icône seule) — et le CIN et les trois sélecteurs se déplient sous le bouton « Filtres » (n = nombre de ces filtres actifs) ; les onglets de vue se partagent la largeur et les actions se rangent en grille sous eux (Exporter et Importer côte à côte, Nouveau bulletin pleine largeur).
En Analytique le mois est indispensable : il n'a pas de croix, et « Effacer » le conserve. **Dans les Cartes**, un **fil de
navigation** s'ajoute sous la barre : `Tous les mois › Août 2026 › n° 3`, chaque segment cliquable pour remonter, plus
« Remonter ».

**Permissions** : sans mois, les sélecteurs chantiers, équipes et fonctions interrogent leurs référentiels ; ils ne sont
proposés qu'avec `CHANTIER_READ`, `EQUIPE_READ` ou `FUNCTION_READ`. Avec un mois, les menus chantiers et équipes interrogent
les options Paie paginées, protégées par `PAIE_READ`, tout en restant masqués sans la permission du référentiel correspondant.
Cela évite un appel qui serait refusé et journalisé comme un faux refus (voir [../rbac/paie.md](../rbac/paie.md)).

**Cascade** (indiquée au survol des sélecteurs) : avec un mois, les chantiers proposés sont ceux qui ont de la paie ce mois-là ; avec
des chantiers choisis, les équipes proposées sont celles de ces chantiers ce mois-là. Ces menus utilisent `POST
/paie/options/chantiers` et `POST /paie/options/equipes` : recherche et pages de 30 éléments côté serveur, déclenchées à la frappe
et au défilement par `LazySelectComponent`. **Sans mois**, ou sans chantier choisi pour les équipes, ce sont les listes
complètes du référentiel — le référentiel Équipe n'est pas rattaché aux chantiers, seule la paie d'un mois les relie. Un choix
qui sort de la cascade (un chantier absent du nouveau mois) n'est pas retiré d'office : il reste visible dans son sélecteur.

**Les filtres vivent dans l'URL** (`?periode=2026-08&nom=ali&cin=AB1&chantierIds=3,4&fonctionIds=7&equipeIds=2`, voir
`filtres/paie-filtres.ts`) : la barre les écrit — en remplaçant l'entrée d'historique, pour ne pas en empiler une par saisie —
et chaque vue les lit ; il n'y a aucun état partagé de plus. Lien direct et retour navigateur les conservent donc. Une valeur
invalide est ignorée. Les mois grisés viennent de `GET /paie/periodes`, rechargé à chaque changement de vue.

**Changer de vue conserve les filtres.** Le sélecteur reporte les paramètres d'URL : le tabulaire et l'Analytique gardent le
mois, le chantier, l'équipe, la fonction et les filtres employés actifs dans les Cartes. Le retour aux Cartes conserve à son
tour le niveau correspondant à ces filtres.

| Vue | Effet du mois vide | Effet du mois choisi |
|---|---|---|
| Tabulaire | tous les mois | seulement ce mois |
| Cartes | niveau « mois » | vue d'ensemble, puis chantier et équipe selon les filtres choisis (voir ci-dessous) |
| Analytique | le mois le plus récent est ouvert uniquement si aucun mois n'est déjà sélectionné | ce mois |

Le même périmètre est appliqué **de la même façon partout** : la liste le filtre par `PaieSpecification`, les agrégats des
Cartes et de l'Analytique par `FiltresPaie` (mêmes règles : nom et CIN « contient » sans casse (les jokers `%` et `_` tapés sont des caractères ordinaires, `MotifRecherche`), identifiants multiples, un
filtre vide est ignoré).

### Vue Cartes

`PaieCartesComponent` (`cartes/`), **lecture seule**, raconte la paie du mois en quatre niveaux : **Mois → Vue d’ensemble → Vue chantier → Vue équipe**. Le niveau est déduit des filtres de l'URL : sans mois, la liste des mois ; un mois, la vue d’ensemble ; un mois et un chantier, le chantier ; un mois, un chantier et une équipe, l'équipe. Cliquer une carte pose le filtre correspondant. Le fil de navigation permet de remonter sans perdre les filtres transversaux (nom, CIN et fonction).

Les quatre indicateurs sont présentés avec leur unité : **masse (DH)**, **bulletins / personnes**, **STC / sorties (DH)** et **STC / sorties (personnes)**. Chaque niveau montre la comparaison avec le mois civil immédiatement précédent, pour le même périmètre. Si aucun bulletin n'existe dans ce mois précédent, l'interface indique qu'il n'y a pas de comparaison disponible ; elle ne compare jamais avec un mois plus ancien.

| Niveau | Contenu | Source |
|---|---|---|
| 1. Mois | Une carte par mois contenant de la paie, avec les quatre indicateurs et leur comparaison au mois précédent. | `POST /paie/periodes/search` |
| 2. Vue d'ensemble | Les quatre indicateurs agrégés du mois et leur comparaison, puis une carte par chantier avec sa part de masse. | `POST /paie/analytique`, `POST /paie/chantiers/search` |
| 3. Vue chantier | Les quatre indicateurs du chantier et leurs comparaisons, puis les cartes d'équipe. Les bulletins sans équipe sont affichés dans une carte dédiée ; leur indicateur et comparaison sont calculés par différence entre le chantier et ses équipes. | mêmes appels |
| 4. Vue équipe | Les quatre indicateurs et comparaisons de l'équipe, puis les cartes d'employés paginées. | `POST /paie/analytique`, `POST /paie/search` |

Les graphiques d'évolution et de répartition sont regroupés dans la vue **Analytique** pour laisser aux Cartes leur rôle de navigation et de lecture des indicateurs. Depuis chaque niveau, le bouton de changement de vue ouvre le tabulaire en conservant le mois, le chantier, l'équipe et les filtres actifs.

#### Suppression en groupe

Chaque carte de mois, chaque carte de chantier, chaque carte d'équipe et le chantier ouvert (niveau 3, bouton « Supprimer ce
chantier ») propose un bouton de suppression (permission **`PAIE_PURGE`**, distincte de `PAIE_DELETE` qui ne couvre qu'un bulletin) : plus besoin de supprimer un à un, depuis la vue
tabulaire, les bulletins d'un mois importé par erreur.

- **Portée : ce que la carte compte.** Les bulletins qu'elle affiche, **filtres de la barre compris** : une carte qui dit
  « 74 bulletins » sous un filtre fonction supprime ces 74-là. Le dialogue rappelle la cible et les filtres en cours.
- **Confirmation** : un dialogue décrit ce qui sera supprimé et demande de **retaper le nombre de bulletins** pour activer le
  bouton « Supprimer ». L'action est annoncée irréversible (pas de corbeille : seul le mois entier peut être réimporté
  depuis son fichier) — mais elle est **tracée** : chaque bulletin supprimé est conservé, avec tout son contenu, dans
  l'historique d'audit (voir [../audit/README.md](../audit/README.md)).
- **Garde-fous serveur** (`PaieService.deleteGroupe`) : le mois est obligatoire (jamais « toute la paie » par erreur) ; le
  serveur revérifie le nombre de bulletins du groupe et **ne supprime rien (`409`) s'il diffère du nombre confirmé** (import
  ou suppression entre-temps) ; le tout dans une transaction. Le groupe est calculé avec le même filtre que la liste
  (`PaieSpecification`).
- Les bulletins **sans équipe** ne se suppriment pas depuis la ligne « Sans équipe » : l'API ne sait pas filtrer sur l'absence
  d'équipe. Après une suppression, les réponses gardées sont vidées et le niveau est rechargé ; si le chantier ouvert est
  supprimé, on remonte aux chantiers.

Les réponses déjà reçues sont gardées par filtres : revenir sur une même vue ne rappelle pas le backend. **Cliquer une carte équipe** ouvre le niveau équipe ; la carte « Sans équipe » ne descend pas (l'API ne sait pas filtrer sur l'absence d'équipe). Les graphiques exposent aussi un tableau de données accessible. Les employés sont chargés par pages serveur et peuvent être filtrés par fonction depuis le graphique de répartition.

**Animations** : cartes et tuiles apparaissent en cascade, les montants et effectifs s'incrémentent (`CountUpDirective`), la
jauge se remplit, et chaque niveau glisse depuis la droite en descendant, depuis la gauche en remontant. Tout est coupé quand
l'utilisateur a demandé moins de mouvement dans son système. Les boutons d'import, d'export et de création restent propres à
la vue tabulaire.

### Vue Analytique

`PaieAnalytiqueComponent` (`analytique/`), **lecture seule** : tableau de bord d'un mois sur le périmètre de la barre commune. Les répartitions restent complètes pour la mesure choisie, mais excluent les catégories dont cette mesure vaut zéro afin de préserver la lisibilité ; aucune catégorie positive n'est regroupée sous « Autres ».
Chaque changement de filtre relance l'analyse (une demande encore en cours est abandonnée) ; pendant le chargement l'écran
précédent reste affiché, atténué, sous une barre de progression. Sans mois, le plus récent est ouvert (et inscrit dans la
barre).

| Bloc | Contenu |
|---|---|
| Tuiles | Masse salariale, bulletins, coût moyen par employé, STC / sorties, chantiers — chiffres animés et variation par rapport au mois précédent (pourcentage pour la masse et le coût moyen, écart pour les autres). Sans bulletin le mois précédent sur ce périmètre : « Pas de mois précédent comparable », jamais un zéro ni une division par zéro |
| Évolution | **Une seule mesure à la fois, sur un seul axe** (bouton Masse / Bulletins : les deux n'ont pas la même échelle, ils ne partagent jamais un graphique) pour **tous** les mois qui ont de la paie dans le périmètre (tout l'historique, sans fenêtre) ; le mois analysé est cerclé. Avec un seul mois, un seul point |
| Répartition par chantier | Les chantiers dont la mesure choisie est strictement positive, une barre chacun (le graphique grandit avec leur nombre et défile dans sa carte), au choix selon la masse ou le nombre de bulletins ; l'infobulle donne masse, bulletins et STC. **Un clic sur une barre filtre l'analyse sur ce chantier** (il rejoint le filtre chantier de la barre) |
| Répartition par fonction | Les fonctions dont la mesure choisie est strictement positive, même principe (masse ou bulletins) ; un clic sur une barre filtre sur cette fonction. Aucune fonction positive n'est regroupée sous « Autres » |
| Répartition des totaux | Histogramme du `salaireTotal` de tous les bulletins du mois, en 6 tranches de même largeur, la dernière ouverte (voir ci-dessous) |
| Qualité des données | Bulletins sans équipe et sans observation (nombre et part), pour suivre la tâche « Qualité des données » du TODO |

**Backend** : `PaieAnalytiqueService` (façade `IPaieAnalytiqueService`), appelé par `POST /paie/analytique` (`PAIE_READ`).
Tout est agrégé en base par des requêtes JPQL de `PaieRepository` qui partagent le même fragment de filtres (`FiltresPaie`) ; le
STC reprend la définition de `ObservationStc` (comme `/paie/periodes`) et la masse est `SUM(salaireTotal)` comme partout. Le
mois précédent est celui du calendrier (`periode - 1`), même s'il n'y a pas de paie. **Les tranches** n'ont pas de seuil
métier : la largeur est celle qui couvre le plus gros total du périmètre en 6 tranches, arrondie à 500 DH au-dessus, donc des
bornes lisibles qui suivent les données.

**Graphiques** : Chart.js via `stp-chart` du kit Staport (dépendance `chart.js`, chargée à la demande à la création du premier graphique). Chart.js dessine
dans un canvas et ne lit pas le CSS : les couleurs, la police et les infobulles viennent des jetons, lus à l'exécution
(`paie-chart-theme.ts`), et **chaque graphique dépend du thème courant** : à la bascule clair / sombre il est redessiné aux
couleurs du nouveau thème, sans recharger la page. **La couleur suit la mesure, pas le rang** : la masse est toujours bleue
(`--chart-1`), les bulletins toujours orange (`--chart-2`) ; la paie reste dans une palette limitée aux cinq premiers jetons `--chart-1` à `--chart-5`, dans tous les graphiques. Marques fines (barres de 18 px au bout
arrondi), grille discrète, infobulle au survol de toute la ligne, aucune légende pour une série unique. **Alternative
accessible** : chaque graphique a un bouton « Afficher les données » qui déplie son tableau (mois, chantiers, fonctions,
tranches) et un libellé `aria-label` ; le tracé est supprimé quand l'utilisateur a demandé moins de mouvement. Premier
chargement : des silhouettes (squelettes) à la place du texte « Chargement… ». Règles : `conventions/design-system.md`,
section « Graphiques ».

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
« SALAIRE ») a été abandonné car un en-tête groupé ne se réordonne ni ne se masque par colonne
(décision du 2026-10-03).

Accès via la barre latérale (`core/navigation/nav-items.ts`, entrée « Paie », permission `PAIE_READ`). Les boutons
de création, modification, suppression, import et export sont conditionnés par `PAIE_WRITE`, `PAIE_DELETE` (un bulletin), `PAIE_PURGE` (suppression en groupe),
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
- Audité (voir [../audit/README.md](../audit/README.md)) : création, modification, suppression (unitaire ou en groupe, **bulletin par
  bulletin**), restauration, import et exports Excel / PDF. Dans le détail d'une suppression de groupe réussie, `SYSTEM_ADMIN`
  peut restaurer le groupe avec `PAIE_RESTORE`. Les bulletins sont recréés avec de nouveaux identifiants ; si un employé a déjà
  un bulletin pour le même mois, toute la restauration est refusée en `409` et rien n'est écrit. L'historique d'un bulletin
  s'ouvre depuis son détail (bouton **Historique**, permission `AUDIT_READ`).
