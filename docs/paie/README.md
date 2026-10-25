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
├── entities/ (Paie)
├── exceptions/ (NotFound, AlreadyExists, InvalidReference, InvalidPeriode, ExceptionHandler)
├── mappers/PaieMapper.java
├── repositories/PaieRepository.java
├── services/ (PaieService + IPaieService)
├── specifications/PaieSpecification.java
├── imports/
│   ├── PaieImportService.java       ← assistant d'import : analyse, corrections des fiches, import (voir « Import Excel »)
│   ├── LecteurFichierPaie.java      ← lecture du fichier (LigneFichierPaie) et génération du modèle
│   ├── PaieImportController.java    ← POST /paie/import/analyse, /paie/import/corrections, /paie/import ; GET /paie/import/modele
│   └── PaieImportAnalyseDto, PaieImportCorrectionsDto, PaieImportDepartsDto, PaieImportResultDto, PaieImportException
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
| `periode` | `INT` | `NOT NULL` | Année-mois, stocké `aaaaMM` (ex. 202609) via `YearMonthAttributeConverter` (`common/`) |
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

### Pourquoi chaque bulletin garde l'affectation de son mois ?

La fiche Employé porte l'affectation courante, dont l'équipe; chaque bulletin conserve séparément
l'affectation de son mois. Le champ Équipe du formulaire Paie est la valeur utilisée pour le bulletin
et met également à jour l'équipe courante sur la fiche Employé, dans la même transaction. Ainsi, les
deux données restent cohérentes après une création ou une correction manuelle, tandis que les autres
bulletins mensuels gardent leur affectation enregistrée.

`Paie.equipe` référence toutefois le référentiel partagé `Equipe` par son identifiant; le code et le
libellé affichés dans un bulletin suivent les modifications faites à cette équipe. Cette règle est
distincte d'un changement d'affectation de l'employé et correspond au comportement confirmé pour les
bulletins historiques.

**Conséquence concrète** : les affectations mensuelles du bulletin ne sont pas remplacées
automatiquement lorsqu'un autre bulletin met à jour la fiche Employé. À la création ou à la correction
manuelle d'un bulletin, l'équipe choisie est enregistrée sur le bulletin et recopiée sur la fiche
Employé dans la même transaction. L'import mensuel aligne d'abord la fiche sur les données du mois;
le bulletin reprend alors l'équipe présente sur cette fiche. Les changements ultérieurs de la fiche
n'altèrent pas les affectations déjà conservées dans les bulletins.

---

## Règles métier

- `(employee_id, periode)` est unique — appliqué en base (contrainte) et en service
  (`existsByEmployee_IdAndPeriode` avant `create`, 409 sinon, y compris lorsqu'une création concurrente
  gagne la course et déclenche la contrainte PostgreSQL).
- `employeeId` et `periode` sont **immuables après création** : `PaieUpdateRequestDto` ne les
  expose pas. Un bulletin est un document historique — le corriger reviendrait à en créer un autre
  pour un employé/mois différent, jamais à réassigner un bulletin existant.
- `fonction`/`chantier` restent modifiables après création (correction d'une erreur de saisie),
  `equipe` aussi (`equipeId`, facultatif : `null` = sans équipe ; un id inconnu est rejeté). Le sélecteur propose
  « Orphelins (sans équipe) » et traduit ce choix en `null`, sans envoyer l'identifiant de filtre `0`.
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
| `POST` | `/paie/search` | Rechercher (paginé, triable) — body `PaieSearchCriteria` (`cin`, `nomPrenom`, `periode`, `fonctionIds`, `chantierIds`, `equipeIds`) — `fonctionIds`/`chantierIds`/`equipeIds` : filtres multi-valeurs, `null`/vide = pas de filtre sur cette dimension ; `equipeIds=0` sélectionne les bulletins sans équipe (« Orphelins » dans le filtre) | 200 |
| `POST` | `/paie/options/chantiers?page=0&size=30` (corps `PaieOptionsChantierRequest`: `periode`, `recherche`) | Page triée par code des chantiers avec paie sur le mois ; option `id`, `code`, `nom`, `designation`, `actif`; recherche serveur sur code, nom et désignation | 200, 400 |
| `POST` | `/paie/options/equipes?page=0&size=30` (corps `PaieOptionsEquipeRequest`: `periode`, `chantierIds`, `recherche`) | Page triée par libellé des équipes présentes sur le mois et les chantiers choisis ; recherche serveur sur code et libellé | 200, 400 |
| `DELETE` | `/paie/{id}` | Supprimer | 204, 404 |
| `POST` | `/paie/suppression` (corps `PaieSuppressionGroupeRequestDto` : `criteres` avec `periode` obligatoire, `nombreAttendu`) | Supprimer d'un coup un groupe de bulletins (carte de la vue Cartes) — voir « Suppression en groupe » | 200, 400, 409 |
| `POST` | `/paie/effectifs` (corps `EffectifsCriteria` : `chantierIds`, `fonctionIds`, `equipeIds`, 0 = sans équipe) | Mouvements mois par mois sur le périmètre — chantier, fonction et équipe **du bulletin du mois** : employés payés, entrées (payés ce mois-ci mais pas le précédent), sorties (départs enregistrés du mois, pour qui était payé dans le périmètre ce mois-ci ou le précédent), mutations (payés les deux mois, autre chantier) ; entrées et mutations `null` le premier mois. Calculés en mémoire sur une projection de cinq colonnes (`listerEffectifs`) : les comparaisons d'un mois au précédent ne s'écrivent pas en JPQL | 200 |
| `GET` | `/paie/employes/{id}/parcours` | Parcours d'un employé (voir « Parcours d'un employé ») | 200, 404 |
| `POST` | `/paie/import/analyse?periode=aaaa-MM` | Analyser un fichier sans rien enregistrer (assistant, étape Contrôle) | 200, 400 |
| `POST` | `/paie/import/corrections?periode=aaaa-MM` | Corriger les fiches à partir du fichier, renvoie la nouvelle analyse | 200, 400 |
| `POST` | `/paie/import?periode=aaaa-MM` | Importer un fichier prêt, avec les départs confirmés | 200, 400 |
| `GET` | `/paie/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |
| `GET` | `/paie/periodes` | Mois qui contiennent de la paie, avec leur contenu résumé (sélecteur de mois de l'export) | 200 |
| `GET` | `/paie/chantiers?periode=2026-08` | Chantiers du mois avec leurs équipes, effectifs et masses (étape « équipes » de l'export) | 200 |
| `POST` | `/paie/analytique` (corps `PaieSearchCriteria`, `periode` obligatoire) | Indicateurs d'un mois sur le périmètre filtré : synthèse, évolution, répartitions par chantier, équipe et fonction (STC compris), tranches (vues Analytique et Cartes de tous les modules) | 200, 400 |
| `POST` | `/paie/periodes/search` (corps `PaieSearchCriteria`, `periode` ignorée) | Les mois qui contiennent de la paie sur le périmètre filtré, avec masse et STC (Cartes) | 200 |
| `POST` | `/paie/chantiers/search` (corps `PaieSearchCriteria`, `periode` obligatoire) | Chantiers et équipes du mois, avec masse, effectif et STC du mois ainsi que leurs valeurs du mois civil précédent (assistant d'export) | 200, 400 |
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

## Import Excel (assistant)

L'import se fait dans un **assistant** qui ne laisse passer qu'un fichier **en accord avec les fiches des employés** :
la fiche porte l'état du dernier mois de paie, et un import la tient à jour (décision du 2026-10-18, voir
[ADR 0010](../adr/0010-employe-etat-du-dernier-mois-de-paie.md)). Le serveur ne garde rien entre les étapes : chacune
reçoit le fichier et refait l'analyse (`PaieImportService`, lecture par `LecteurFichierPaie`).

| Étape | Route | Ce qui se passe |
|---|---|---|
| 1. Fichier | — | Le mois est **imposé** : celui qui suit exactement le dernier mois importé (au tout premier import, l'utilisateur le choisit). |
| 2. Contrôle | `POST /paie/import/analyse` | Analyse **sans rien enregistrer**. Quatre sortes de problèmes, chacune avec sa solution (ci-dessous). On corrige, on réimporte le fichier corrigé, et on recommence jusqu'à **zéro problème**. |
| — | `POST /paie/import/corrections` | Depuis le contrôle : met à jour des fiches avec les valeurs du fichier, ou crée les employés des CIN inconnus. Renvoie la nouvelle analyse. (Rouvrir un chantier clôturé passe par `PUT /chantiers/{id}`, puis le fichier est réanalysé.) |
| 3. Départs | — | Les employés qui quittent Staport, **tous cochés** : ceux marqués STC ou « sortie » dans le fichier (motif « STC » / « Sortie » prérempli) et les actifs **absents** du fichier (motif à saisir). Décoché = l'employé reste en poste. Les employés sortis présents dans le fichier sont annoncés comme **retours** (ils repassent en poste). |
| 4. Import | `POST /paie/import` | Refait l'analyse : refus (`400`) si le fichier n'est pas prêt ou si un départ envoyé n'a pas été proposé. Sinon, en une transaction : les bulletins, les retours (ACTIF), les départs confirmés (INACTIF + départ du mois dans `employe_sortie`). |

### Les problèmes du contrôle

| Sorte | Exemples | Se règle |
|---|---|---|
| **Erreur du fichier** | Champ obligatoire manquant ; valeur négative ; **salaire à 0** (une ligne porte toujours le salaire de l'employé ; un employé sans paie ce mois-ci n'est pas dans le fichier) ; jours hors 0–999,99 ou plus de deux décimales ; observation de plus de 255 caractères ; nom de plus de 150 ; CIN en double ; chantier inconnu ; équipe inconnue ; bulletin déjà présent pour l'employé ce mois-ci | Dans le fichier, puis réimport |
| **Chantier clôturé** | Une ou plusieurs lignes citent un chantier clôturé (le message liste les lignes) | Ici : « Rouvrir le chantier » (droits `CHANTIER_READ` et `CHANTIER_WRITE`), le fichier est réanalysé tel quel — ou corriger le chantier dans le fichier |
| **CIN inconnu** | Le CIN n'a pas de fiche | Ici : créer l'employé avec les valeurs du fichier et ce qu'il n'a pas (date de naissance, date d'embauche, type de salaire) — ou corriger le CIN dans le fichier |
| **Écart avec la fiche** | Nom (comparé sans casse et avec un seul espace entre les mots), fonction, chantier, équipe ou salaire différents | Ici : « Mettre à jour la fiche » (une à une ou toutes), la ligne disparaît — ou corriger le fichier |

Le **type de salaire** (mensuel ou journalier) n'est pas dans le fichier : quand le salaire change, l'assistant propose
celui de la fiche ; il est obligatoire si la fiche n'en a pas encore. Une **fonction** inconnue du référentiel n'est
pas une erreur : elle est créée quand une fiche est mise à jour ou créée avec elle (mêmes règles qu'un import Function).
Les corrections demandent `PAIE_IMPORT`, `EMPLOYEE_WRITE` et `PAIE_READ` ; sans `EMPLOYEE_WRITE`, l'assistant n'offre que de
corriger le fichier.

Le bulletin reprend les valeurs du fichier après alignement avec la fiche Employé; son équipe est l'équipe enregistrée
sur la fiche au moment de l'import. `salaireTotal` est repris de la colonne J **tel quel**, jamais recalculé. L'import ne
modifie jamais un bulletin existant : pour réimporter un mois, supprimer
d'abord ses bulletins (le dernier mois redevient alors celui d'avant, et c'est lui qui est attendu).

### Modèle téléchargeable

`GET /paie/import/modele` (entrée « Télécharger le modèle Excel » du menu du bouton fractionné « Importer ») renvoie un
fichier `.xlsx` vierge avec les trois lignes d'en-tête et les 13 colonnes dans l'ordre attendu
(`LecteurFichierPaie.genererModele()`).

### Format attendu

Fichier `.xlsx`, **trois lignes d'en-tête** (ignorées quel que soit leur contenu), colonnes dans cet ordre exact :

| Colonne | Contenu | Statut dans l'import |
|---|---|---|
| A | Nom & prénom (comparé à la fiche) | Facultatif pour un employé connu ; requis pour créer un CIN inconnu |
| B | Fonction (libellé) | Requis |
| C | CIN (clé de l'employé) | Requis |
| D | Nombre de jours travaillés | Requis |
| E | Jours récupération ouvrable | Facultatif |
| F | Jours récupération dimanche | Facultatif |
| G | Salaire (montant mensuel, ou tarif d'une journée) — jamais 0 | Requis |
| H | Prime roulage ordinaire | Facultatif |
| I | Prime roulage dimanche | Facultatif |
| J | Total — repris **tel quel** dans `salaireTotal` (jamais recalculé) | Requis |
| K | Observation (« STC » ou « sortie » : départ proposé) | Facultatif |
| L | Chantier (code, doit exister et être actif) | Requis |
| M | Équipe (code d'une équipe **existante**, jamais créée par l'import) | Facultatif |

Le formulaire Paie propose les données du bulletin et les mêmes règles de saisie : employé, période, fonction,
chantier, jours travaillés, salaire et total sont requis ; récupération, primes, observation et équipe sont
facultatifs et leur libellé l'indique. Le formulaire sélectionne les références Employé/Fonction/Chantier/Équipe,
tandis que le fichier utilise les valeurs métier permettant de les retrouver (CIN et codes/libellés). Lorsqu'un
bulletin manuel change l'équipe, cette même valeur est enregistrée sur la fiche Employé dans la transaction.

Le **mois s'applique à tout le fichier** — c'est un paramètre de la requête (`?periode=aaaa-MM`), pas une colonne.

### Réponses

- `PaieImportAnalyseDto` (analyse et corrections) : `periode`, `totalLignes`, `erreurs[]` (`numeroLigne`, `cin`,
  `nomPrenom`, `raison`), `cinInconnus[]` (ligne, CIN, nom, fonction, chantier, équipe, salaire), `ecarts[]` (`employeId`,
  ligne, CIN, nom de la fiche, `champs[]` = `champ`/`base`/`fichier`, `typeSalaire` de la fiche), `departs[]` (`employeId`,
  CIN, nom, `motif` « STC »/« Sortie » ou `null`), `retours[]`, `pret`.
- `PaieImportCorrectionsDto` (partie JSON `corrections`) : `aligner[]` (`employeId`, `typeSalaire` ou `null` pour garder
  celui de la fiche), `creer[]` (`numeroLigne`, `dateNaissance`, `dateEmbauche`, `typeSalaire`).
- `PaieImportDepartsDto` (partie JSON `departs`, facultative) : `departs[]` (`employeId`, `motif`).
- `PaieImportResultDto` : `periode`, `crees`, `departs`, `retours`.

Un mois refusé, un fichier illisible ou pas prêt, une correction impossible : `400` avec `ErrorResponseDto`, rien n'est
enregistré.

### Performance

Employés, chantiers actifs, équipes, fonctions et employés déjà payés ce mois-là sont chargés **une seule fois** par
analyse, avant la lecture des lignes (aucune requête par ligne), conformément à `conventions/performance.md`. Les
corrections rechargent ces référentiels une fois, après avoir écrit, pour rendre la nouvelle analyse.

---

## Parcours d'un employé

`GET /paie/employes/{id}/parcours` (`PAIE_READ`, `parcours/PaieParcoursService`) raconte le parcours d'un employé à partir de
ses bulletins — instantanés du mois — et de ses départs (`IEmployeeService.listerSorties`) : rien n'est recopié dans une table
d'historique ([ADR 0010](../adr/0010-employe-etat-du-dernier-mois-de-paie.md)).

| Partie | Contenu |
|---|---|
| `indicateurs` | Mois payés, total perçu (somme des `salaireTotal`), jours travaillés, premier et dernier mois de paie |
| `mois` | Un élément par bulletin, du plus récent au plus ancien : fonction, chantier et équipe du mois, jours, salaire, total, observation |
| `evenements` | Du plus récent au plus ancien : `ENTREE` (première paie), `CHANGEMENT_CHANTIER`, `CHANGEMENT_FONCTION`, `CHANGEMENT_EQUIPE`, `CHANGEMENT_SALAIRE` (différence entre deux bulletins qui se suivent, avec `avant` et `apres`), `DEPART` (avec son motif), `RETOUR` (une paie après un départ) |

Un employé inconnu : `404`. Un employé sans paie : indicateurs à zéro, listes vides. Le frontend l'affiche sur la fiche de
l'employé (`parcours/paie-parcours.component.*`) : quatre chiffres, la chronologie groupée par mois, le total perçu par mois
(courbe monotone : elle ne passe jamais par un montant non perçu) et le tableau des bulletins, chacun ouvrant sa fiche.

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
  La sélection utilisateur et les contrats PDF/Excel utilisent le **libellé** de l'équipe. Le code
  reste disponible pour les imports et les traitements techniques.
- `GET /paie/materiel` : les tableaux du parc matériel prévus (`chantierCode`, `equipeCode`, `titre`, `libelles`),
  lus dans `MaterielChantierCatalogue` pour que l'assistant sache quels nombres demander sans dupliquer la règle
  (voir `docs/report/README.md`, « Parc matériel »).

### Sélection métier par libellé d'équipe

`Paie.equipe` référence le domaine **Équipe** ([dossier du domaine](../equipe/README.md)). Les
choix affichés, les regroupements métier et les sélections envoyées dans les contrats PDF/Excel
utilisent son libellé. Le code identifie l'équipe pour les imports et les échanges techniques.

Un bulletin garde l'identifiant de l'équipe associée à son mois, même si la fiche Employé change
d'équipe ensuite. Le code et le libellé ne sont pas copiés dans le bulletin : renommer l'équipe
référencée change donc aussi son affichage sur les bulletins historiques.

La migration de correction V34 est une exception ponctuelle à cette stabilité : elle reclasse les bulletins
qui portaient l'ancienne équipe `CH+OP` d'après la fonction de chaque bulletin (`CH.`/`COURSIER` → `CH`,
`OP.` → `OP`, `CHEF DE POSTE` → `EE`). Les bulletins restent en base; leurs valeurs métier autres que l'équipe
ne changent pas, et le reclassement est inscrit dans l'audit. Les fiches inactives restent sans équipe courante.

À l'import Excel (colonne M), le code est résolu **insensiblement à la casse et aux espaces**
contre le référentiel ; un code inconnu est une erreur du fichier (`« Équipe introuvable : X »`) : le fichier ne
s'importe pas tant qu'elle n'est pas corrigée. Une cellule vide laisse le bulletin sans équipe.

Le détail des règles de mise en page (total du mois précédent, colonne STC, squelette matériel
C168, cas des feuilles sans ligne) et du rapport PDF est dans `docs/report/README.md`.

---

## Frontend

Routes sous `/paie` (lazy loading, `paie.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/paie` | `PaieListComponent` | **Vue tabulaire** : tableau standard (tri, colonnes, pagination) filtré par la barre commune, suppression. « Importer » ouvre `PaieImportWizardComponent`, l'**assistant d'import** (fichier, contrôle, départs, import — voir « Import Excel »), et son menu le modèle Excel. Un seul bouton « Exporter » ouvre `PaieExportWizardComponent`, l'**assistant d'export en étapes** (mois, format, équipes, matériel, génération) décrit dans `docs/report/README.md`, « Assistant d'export » |
| `/paie/cartes` | `PaieCartesComponent` | Vue **Cartes** hiérarchique (mois → chantier → équipe → fonction → employés), voir « Vue Cartes » ci-dessous |
| `/paie/analytique` | `PaieAnalytiqueComponent` | Vue **Analytique** : tableau de bord graphique, voir « Vue Analytique » ci-dessous |
| `/paie/new` | `PaieFormComponent` | Création — sélection de l'employé, de la fonction, du chantier et de l'équipe (facultative) via le sélecteur générique (`shared/components/lazy-select`, voir `conventions/frontend.md` — recherche serveur + chargement différé) |
| `/paie/:id` | `PaieDetailComponent` | Consultation |
| `/paie/:id/edit` | `PaieFormComponent` | Modification — employé et période affichés en lecture seule avec un message explicite |

Les trois vues (tabulaire, cartes, analytique) sont les routes filles de `PaieVuesComponent`
(`vues/`), qui configure la coque partagée `app-collection-shell`; la liste utilise aussi `app-collection-table`. Le domaine fournit le titre, le sélecteur de vue (qui **conserve les filtres** en changeant de vue), les
**actions** (`PaieActionsComponent`, `actions/`) et la **barre de filtres commune**, une seule fois pour les trois. Les écrans de saisie et de consultation d'un bulletin
(`/paie/new`, `/paie/:id`…) n'en font pas partie.

### Barre de filtres commune

**Mise en page de l'écran (identique dans les trois vues).** L'en-tête porte le titre **Paie** et, sur la même ligne, les trois
**onglets de vue** soulignés (Tabulaire, Cartes, Analytique) posés sur un filet, puis, **à droite, au même niveau**, les trois
**actions** du moins au plus important : **Exporter**, **Importer** (bouton fractionné dont le menu propose le **modèle Excel**,
le fichier que l'import attend) et **Nouveau bulletin** (bouton plein) — les mêmes dans les trois vues, chacun avec sa permission
(`PAIE_EXPORT`, `PAIE_IMPORT`, `PAIE_WRITE` et `EMPLOYEE_WRITE` pour la création/modification). Dessous, la **barre de filtres** ; dessous, le contenu de la vue. Dans le tabulaire,
une **barre du tableau** porte le total (« 972 bulletins ») à gauche et l'outil **Colonnes** à droite. Un import réussi
**recrée la vue affichée** (`PaieVuesComponent.rafraichirVue`) : elle recharge ses données et les mois de la barre.

`PaieFiltresComponent` (`filtres/`) est **la même barre dans les trois vues, sur une seule ligne et entièrement visible dès
l'arrivée** — aucun bouton « Filtres » à ouvrir. Contrôles de même hauteur (`--control-height`), posés à plat sur la page : le
mois (groupe `‹ Août 2026 › ✕` : flèches vers le mois précédent / suivant qui contient de la paie, grille de mois dans un
panneau, croix pour revenir à « tous les mois »), la recherche **nom et prénom** et **CIN** (« contient », sans casse), les
sélecteurs **chantiers, équipes et fonctions** (sélecteur générique multiple, recherche serveur, mode compact : la valeur seule
quand il y en a une, « 3 chantiers » à partir de deux) et « Effacer ». Quand la largeur manque, la ligne passe à la suivante. **Sur téléphone**, la barre tient sur deux lignes — le mois (pleine largeur), puis la recherche, « Filtres (n) » et « Effacer » (icône seule) — et le CIN et les trois sélecteurs se déplient sous le bouton « Filtres » (n = nombre de ces filtres actifs) ; les onglets de vue se partagent la largeur et les actions se rangent en grille sous eux (Exporter et Importer côte à côte, Nouveau bulletin pleine largeur).
En Analytique le mois est indispensable : il n'a pas de croix, et « Effacer » le conserve. **Dans les Cartes**, le **fil de
navigation** (`Toute la paie › Mois août 2026 › Chantier C168`, chaque étape se retire seule) est celui des vues partagées, posé
sous la barre par la vue elle-même (voir « Vue Cartes »). La barre écrit ses valeurs en fusion avec l'URL : les étapes de la
hiérarchie ne sont pas perdues quand on change un filtre.

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
et chaque vue les lit ; il n'y a aucun état partagé de plus. `equipeIds=0` représente les bulletins **sans équipe**. Lien direct,
retour navigateur et bascule entre vues les conservent donc. Une valeur invalide est ignorée. Les mois grisés viennent de
`GET /paie/periodes`, rechargé à chaque changement de vue.

**Changer de vue conserve les filtres.** Le sélecteur reporte les paramètres d'URL : le tabulaire et l'Analytique gardent le
mois, le chantier, l'équipe, la fonction et les filtres employés actifs dans les Cartes. Le retour aux Cartes restitue le
fil et l'étape courante de la hiérarchie.

| Vue | Effet du mois vide | Effet du mois choisi |
|---|---|---|
| Tabulaire | tous les mois | seulement ce mois |
| Cartes | niveau « mois » (une carte par mois) | chantier → équipe → fonction → employés (voir ci-dessous) |
| Analytique | le mois le plus récent est ouvert uniquement si aucun mois n'est déjà sélectionné | ce mois |

Le même périmètre est appliqué **de la même façon partout** : la liste le filtre par `PaieSpecification`, les agrégats des
Cartes et de l'Analytique par `FiltresPaie` (mêmes règles : nom et CIN « contient » sans casse (les jokers `%` et `_` tapés sont des caractères ordinaires, `MotifRecherche`), identifiants multiples, un
filtre vide est ignoré).

### Vue Cartes

`PaieCartesComponent` (`cartes/`) est l'hôte du composant **partagé par tous les modules** ([Vues Cartes et Analytique partagées](../frontend/vues-perimetre.md), ADR 0014) ;
`paie-module.ts` décrit le module Paie (pas de référentiel propre ; périmètre = barre commune : mois, nom, CIN, chantiers, équipes,
fonctions ; la liste des mois en premier niveau). Lecture seule, sauf la suppression en groupe ci-dessous.

**Hiérarchie guidée.** Tant qu'aucun mois n'est choisi, la vue montre **une carte par mois** qui a de la paie. Ouvrir un mois
le choisit, puis la vue avance dans l'ordre **chantier → équipe → fonction → employés**. Ouvrir une carte en fait une **étape
du fil** (mois, chantier, équipe…), que l'on retire seule. Tout est dans l'URL (`periode`, `chantierIds`, `equipeIds`,
`fonctionIds`); le mois et les étapes sont conservés quand un filtre change. Les anciens liens contenant `par` suivent cette
même hiérarchie. Le fil de navigation est celui des Cartes : l'ancien fil de la barre de filtres a été retiré.

**Comparaison.** Chaque carte montre ses quatre indicateurs — **masse (DH)**, **bulletins** (personnes), **montant des STC** (DH) et
**STC** (personnes) — avec l'écart par rapport au **mois civil immédiatement précédent**, pour le même groupe : en pourcentage pour
les montants, en écart pour les personnes. Sans bulletin dans ce mois précédent, aucune comparaison n'est affichée ; jamais avec un
mois plus ancien. Les bulletins sans équipe forment la carte « Sans équipe » (`equipeIds=0`). Avec `EMPLOYEE_READ`, chaque carte
montre aussi les fiches Employé (dernier état importé) ; sans ce droit, ce bloc est masqué et le service n'est pas appelé.

Depuis chaque niveau, **« Voir la liste »** ouvre la vue Tabulaire avec les filtres de la barre et **« Voir les employés »** ouvre
les employés du même périmètre.

#### Suppression en groupe

Chaque carte (mois, chantier, équipe ou fonction) propose un bouton de suppression (permission **`PAIE_PURGE`**, distincte de
`PAIE_DELETE` qui ne couvre qu'un bulletin) : plus besoin de supprimer un à un, depuis la vue tabulaire, les bulletins d'un mois
importé par erreur. Le bouton est fourni par `PaieCartesComponent` (gabarit `#actionsCarte` du composant partagé).

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
- Les bulletins **sans équipe** ne se suppriment pas par leur carte (l'API ne sait pas les cibler) ; le bouton n'y est pas proposé.
  Après une suppression, le niveau affiché est rechargé.

### Vue Analytique

`PaieAnalytiqueComponent` (`analytique/`) est l'hôte du composant **partagé par tous les modules** ([Vues Cartes et Analytique partagées](../frontend/vues-perimetre.md), ADR 0014).
**Lecture seule**, sur le périmètre de la barre commune. Sans mois, le plus récent est ouvert et inscrit dans la barre ; chaque
changement de filtre relance l'analyse (une demande encore en cours est abandonnée).

| Bloc | Contenu |
|---|---|
| Synthèse | Le mois, puis masse salariale, effectif payé, coût moyen par personne, STC (nombre et montant) et chantiers — avec la variation par rapport au mois précédent (pourcentage pour la masse et le coût moyen, écart pour les autres). Sans bulletin le mois précédent sur ce périmètre : aucune variation, jamais un zéro ni une division par zéro |
| Évolution | **Une seule mesure à la fois, sur un seul axe** : Masse (DH), Effectif (personnes), STC (personnes) ou STC (DH). Les montants et les effectifs n'ont pas la même échelle, ils ne partagent jamais un graphique. Les données couvrent **tous** les mois qui ont de la paie dans le périmètre ; le mois analysé est agrandi |
| Répartition | Barres par chantier, équipe ou fonction (« Répartir par », dimension pas encore choisie), mesure Masse (DH) ou Effectif payé ; les catégories à zéro sont exclues, aucune n'est regroupée sous « Autres ». **Un clic sur une barre ajoute ce groupe au périmètre** et approfondit l'analyse. Le tableau de données donne tous les groupes avec leurs STC |
| Qualité des données | Bulletins sans équipe et sans observation, pour suivre la tâche « Qualité des données » du TODO |
| Répartition des totaux | Histogramme du `salaireTotal` de tous les bulletins du mois, en 6 tranches de même largeur, la dernière ouverte |
| Mouvements | Employés payés, entrées, sorties et mutations mois par mois (`POST /paie/effectifs`) |
| Fiches Employé | Avec `EMPLOYEE_READ` : chiffres clés, pyramide des âges, ancienneté, répartition en poste / sortis |

**Backend** : `PaieAnalytiqueService` (façade `IPaieAnalytiqueService`), appelé par `POST /paie/analytique` (`PAIE_READ`).
Tout est agrégé en base par des requêtes JPQL de `PaieRepository` qui partagent le même fragment de filtres (`FiltresPaie`) ; le
STC reprend la définition de `ObservationStc` (comme `/paie/periodes`) et la masse est `SUM(salaireTotal)` comme partout. Les
répartitions `parEquipe` et `parFonction` portent chacune le nombre et le montant des STC de leur groupe (`stc`, `stcMontant`). Le
mois précédent est celui du calendrier (`periode - 1`), même s'il n'y a pas de paie. Si le mois choisi n'a aucun bulletin sur le périmètre, la réponse porte des indicateurs à zéro et des listes vides, **sauf l'historique mensuel (`evolution`)**, qui reste celui du périmètre (ex. une équipe qui a payé un autre mois). **Les tranches** n'ont pas de seuil
métier : la largeur est celle qui couvre le plus gros total du périmètre en 6 tranches, arrondie à 500 DH au-dessus, donc des
bornes lisibles qui suivent les données.

**Graphiques** : Chart.js via `stp-chart` du kit Staport (dépendance `chart.js`, chargée à la demande à la création du premier graphique). Chart.js dessine
dans un canvas et ne lit pas le CSS : les couleurs, la police et les infobulles viennent des jetons, lus à l'exécution
(`shared/ui/chart/chart-theme.ts`, mesures de la paie dans `paie-chart-theme.ts`), et **chaque graphique dépend du thème courant** : à la bascule clair / sombre il est redessiné aux
couleurs du nouveau thème, sans recharger la page. **La couleur suit la mesure, pas le rang** : la masse est toujours bleue
**Les valeurs de l'évolution sont inscrites au-dessus de chaque point** ; l'infobulle et le tableau de données restent
disponibles pour une lecture détaillée. Les montants gardent deux décimales et les effectifs sont affichés comme des entiers.
(`--chart-1`), les bulletins toujours orange (`--chart-2`) ; la paie reste dans une palette limitée aux cinq premiers jetons `--chart-1` à `--chart-5`, dans tous les graphiques. Marques fines (barres de 18 px au bout
arrondi), grille discrète, infobulle au survol de toute la ligne, aucune légende pour une série unique. **Alternative
accessible** : chaque graphique a un bouton « Afficher les données » qui déplie son tableau (mois et niveau de répartition,
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
de création et modification demandent `PAIE_WRITE` et `EMPLOYEE_WRITE` car le choix d'équipe met aussi à jour la fiche Employé. Suppression, import et export sont conditionnés par `PAIE_DELETE` (un bulletin), `PAIE_PURGE` (suppression en groupe),
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
