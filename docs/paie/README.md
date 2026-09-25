# Module Paie

> Bulletins de paie mensuels des employés. Un employé a au plus **un** bulletin par mois
> (contrainte unique `employé × période`).

---

## Vue d'ensemble

| | |
|---|---|
| Backend | `backend/src/main/java/staport/rh/paie/` |
| Frontend | `frontend/src/app/portail/paie/` |
| Table | `paie` |
| Endpoints | `/paie`, `/paie/search`, `/paie/import`, `/paie/export` |

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
│   ├── PaieImportService.java       ← lecture du fichier, résolution CIN/fonction/chantier, upsert, création des fonctions manquantes, génération du modèle
│   ├── PaieImportController.java    ← POST /paie/import?periode=aaaa-MM, GET /paie/import/modele
│   └── PaieImportResultDto.java, PaieImportException.java
└── export/
    ├── PaieExportService.java       ← orchestration (regroupement, totaux, période précédente)
    ├── PaieSheetWriter.java         ← mise en page d'une feuille (partagée GLB/chantier/équipe)
    ├── PaieExcelStyles.java         ← styles de cellule créés une fois par classeur
    ├── PaieExportRequestDto.java    ← périmètre équipe de l'export (voir section Export Excel)
    └── PaieExportController.java    ← POST /paie/export (corps : PaieExportRequestDto)
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
| `equipe` | `VARCHAR(50)` | nullable | **Snapshot** — équipe ce mois-là (texte libre, pas de domaine dédié) |
| `nombre_jours_travailles` | `INT` | `NOT NULL` | Jours travaillés |
| `jours_recuperation_ouvrable` | `DECIMAL(5,2)` | nullable | Jours de récupération (jour ouvrable) |
| `jours_recuperation_dimanche` | `DECIMAL(5,2)` | nullable | Jours de récupération (dimanche) |
| `salaire_mensuel` | `DECIMAL(10,2)` | `NOT NULL` | Salaire de base |
| `prime_roulage_ordinaire` | `DECIMAL(10,2)` | nullable | Prime de roulage (ordinaire) |
| `prime_roulage_dimanche` | `DECIMAL(10,2)` | nullable | Prime de roulage (dimanche) |
| `salaire_total` | `DECIMAL(10,2)` | `NOT NULL` | **Calculé, jamais saisi** — `salaireMensuel + primeRoulageOrdinaire + primeRoulageDimanche` |
| `observation` | `VARCHAR(255)` | nullable | Note libre |

**Contrainte unique** : `uk_paie_employee_periode` (`employee_id`, `periode`) — un employé a au plus
un bulletin par mois.

Index : `idx_paie_employee`, `idx_paie_periode`, `idx_paie_chantier`.

### Pourquoi fonction/chantier/équipe sont dupliqués depuis Employee ?

**Ce n'est pas une duplication accidentelle — c'est un snapshot volontaire.** `Employee.fonction` et
`Employee.chantier` reflètent la situation *actuelle* de l'employé (ils changent quand l'employé est
réaffecté). `Paie.fonction`/`Paie.chantier`/`Paie.equipe` figent la situation *du mois du bulletin*.
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
  `equipe` aussi.
- `salaireTotal` n'est **jamais saisi** — ni via l'API (absent de `PaieCreateRequestDto` et
  `PaieUpdateRequestDto`), ni via l'import Excel (colonne "Total" du fichier ignorée). Il est
  systématiquement recalculé côté serveur (`Paie.calculerSalaireTotal()`) à partir de
  `salaireMensuel + primeRoulageOrdinaire + primeRoulageDimanche` (primes nulles comptées pour zéro),
  à la création comme à la modification. Aucun setter public n'existe sur l'entité pour ce champ.
  C'est un premier pas vers le calcul automatique complet acté comme décision produit (voir
  [TODO.md](../../TODO.md)) : à terme, la paie doit se calculer depuis le Pointage, sans saisie
  manuelle d'aucune valeur calculable.
- La suppression (`DELETE /paie/{id}`) n'a pas de contrainte de blocage particulière au-delà de
  l'existence du bulletin.

---

## API

| Méthode | Route | Description | Codes |
|---|---|---|---|
| `POST` | `/paie` | Créer un bulletin | 201, 400, 409 |
| `PUT` | `/paie/{id}` | Modifier un bulletin (employé/période non modifiables) | 200, 400, 404 |
| `GET` | `/paie/{id}` | Consulter un bulletin | 200, 404 |
| `POST` | `/paie/search` | Rechercher (paginé, triable) — body `PaieSearchCriteria` (`cin`, `nomPrenom`, `periode`, `fonctionId`, `chantierId`, `equipe`) | 200 |
| `DELETE` | `/paie/{id}` | Supprimer | 204, 404 |
| `POST` | `/paie/import?periode=aaaa-MM` | Importer un fichier Excel pour une période | 200, 400 |
| `GET` | `/paie/import/modele` | Télécharger le modèle Excel vierge attendu par l'import | 200 |
| `GET` | `/paie/equipes?chantierCode=C168&periode=2026-08` | Équipes distinctes trouvées sur ce chantier pour cette période (alimente la configuration de l'export) | 200 |
| `POST` | `/paie/export` (corps `PaieExportRequestDto`) | Exporter en Excel (GLB + par chantier + par équipe selon la configuration) | 200 |
| `POST` | `/paie/report/pdf` (corps `PaieReportPdfRequestDto`) | Rapport PDF BI de synthèse — périmètre = mêmes filtres que `/paie/search`, voir `docs/report/README.md` | 200, 404 |

`PaieResponseDto` : `id`, `employee` (`id`, `nomPrenom`, `cin`), `periode` (`"aaaa-MM"`),
`fonction` (`id`, `libelle`), `chantier` (`id`, `code`, `designation`), `equipe`,
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
que de deviner ou de réutiliser un fichier dont la structure a pu changer. La colonne "Total" est
étiquetée *"Total (calculé automatiquement)"* plutôt que retirée, pour ne pas décaler les colonnes
suivantes (Observation, Chantier, Équipe) par rapport aux fichiers mensuels déjà utilisés.

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
| J | Total — **ignorée**, `salaireTotal` est toujours recalculé (G + H + I), quelle que soit la valeur de cette colonne |
| K | Observation |
| L | Chantier (code, doit exister et être actif) |
| M | Équipe |

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
créé ni mis à jour, **aucune fonction n'est créée non plus** :

| Cas | Message affiché |
|---|---|
| Champ obligatoire manquant (fonction, jours, salaire, chantier) | `Champs obligatoires manquants ou invalides : ...` |
| CIN sans employé correspondant | `Employé introuvable avec ce CIN` |
| Chantier absent du référentiel actif | `Chantier introuvable ou inactif : <valeur>` |
| Au moins une ligne invalide parmi les autres | `400 Bad Request`, **rien** n'est persisté, `crees = 0`, `misAJour = 0`, détail complet dans `lignesIgnorees` |
| Toutes les lignes valides | `200 OK`, tous les bulletins créés/mis à jour, fonctions manquantes créées |

**Ré-import = correction, pas doublon** : si un bulletin existe déjà pour (employé, période), il est
**mis à jour**, jamais dupliqué.

Toutes les lignes sont d'abord validées, en ne gardant en mémoire que les valeurs brutes de chaque
ligne (pas d'entité JPA, pas de libellé de fonction résolu). La création des fonctions manquantes, la
résolution (employé, période) → bulletin existant et sa mutation n'ont lieu qu'une fois la totalité
du fichier confirmée valide : créer une fonction ou charger/muter une entité JPA gérée plus tôt
exposerait l'import au dirty-checking automatique d'Hibernate (flush déclenché par la requête d'une
ligne suivante, ou par le commit de la transaction) — la fonction resterait créée en base, ou la
mutation serait persistée, même si l'import est finalement rejeté à cause d'une autre ligne. Les
fonctions manquantes sont dédupliquées avant création : si dix lignes du même fichier référencent un
même libellé inédit, il n'est créé qu'une fois.

`salaireTotal` est recalculé pour chaque ligne (`Paie.calculerSalaireTotal()`) après résolution des
montants — la colonne J du fichier n'est jamais lue.

`PaieImportResultDto` : `periode`, `totalLignes`, `crees`, `misAJour`, `ignores`, `lignesIgnorees[]`
(`numeroLigne`, `cin`, `nomPrenom`, `raison`), `fonctionsCreees[]` (libellés des fonctions créées par
cet import, pour transparence — l'UI les affiche explicitement dans le toast et le détail du
résultat). Le corps de réponse a la même forme en succès (`200`) qu'en rejet (`400`) — seul le code
HTTP change.

### Performance

Employés (par CIN) et chantiers actifs sont chargés **une seule fois** avant la boucle de lecture
(deux requêtes, pas une par ligne), conformément à `conventions/performance.md`. Le référentiel
Function est chargé une seconde fois, séparément, dans la phase de persistance (après confirmation
que le fichier est entièrement valide) — nécessaire pour disposer d'un état à jour incluant les
fonctions qui viennent d'être créées, avant de résoudre l'id de chaque ligne.

---

## Export Excel et Rapport PDF

La génération de documents à partir des bulletins de paie est documentée dans
**`docs/report/README.md`** : export Excel multi-feuilles (opérationnel, dialog dédié
`PaieExportExcelDialogComponent`) et rapport PDF (BI RH/Paie de synthèse pour la direction,
téléchargement direct sans dialog sur la période sélectionnée dans la liste) — architecture, modèle
analytique et catalogue de KPI du rapport PDF, structure des feuilles/sections, paramétrage
chantier/équipe, règle Include/Exclude, et points d'extension. Ne pas dupliquer cette documentation
ici — seules les règles ci-dessous, propres au champ `Paie.equipe` en tant que donnée métier
(indépendantes du format de sortie), restent dans ce document.

`GET /paie/equipes?chantierCode=X&periode=aaaa-MM` liste les équipes distinctes trouvées sur les
bulletins de ce chantier pour cette période (`PaieRepository.findDistinctEquipesByChantierCodeAndPeriode`)
— c'est la seule source possible pour peupler ces sélecteurs côté UI, `équipe` n'ayant aucun
référentiel dédié (voir section suivante).

### Regroupement par équipe : correspondance texte exact, pas de normalisation

`Paie.equipe` est un champ texte libre (décision actée : pas de domaine dédié). Le regroupement pour
les sous-feuilles équipe (`PaieExportService.ecrireFeuillesEquipes`) et le rapprochement avec le mois
précédent se font par **égalité de chaîne exacte** sur cette valeur (`Collectors.groupingBy(Paie::getEquipe)`).
À l'import, `equipe` n'est que **trimée**, jamais mise en majuscule ni normalisée
(`PaieImportService` : `equipe.trim()`) — contrairement à `fonction`/`chantier`, résolus par référentiel.
Conséquence concrète : `"Equipe A"` et `"EQUIPE A"` produisent **deux sous-feuilles distinctes** et ne
se rapprochent jamais d'un mois sur l'autre pour le total précédent, même s'il s'agit de la même
équipe pour l'utilisateur. C'est une source d'erreur silencieuse si la saisie/l'import n'est pas
rigoureusement homogène d'un mois à l'autre — candidat naturel à une normalisation (`trim` +
`toUpperCase`, ou promotion en domaine dédié) si ce cas se présente en pratique.

Le détail des règles de mise en page (total du mois précédent, colonne STC, squelette matériel
C168, cas des feuilles sans ligne) et du rapport PDF est dans `docs/report/README.md`.

---

## Frontend

Routes sous `/paie` (lazy loading, `paie.routes.ts`) :

| Route | Composant | Description |
|---|---|---|
| `/paie` | `PaieListComponent` | Liste paginée, recherche temps réel avec debounce (nom, CIN, période, fonction, chantier), tri, suppression, téléchargement du modèle, import (avec sélecteur de période). Export, voir `docs/report/README.md` — « Exporter Excel » ouvre un dialog dédié (`PaieExportExcelDialogComponent`, configuration chantier/équipe) ; « Exporter PDF » télécharge directement le rapport BI, sans dialog, sur la période sélectionnée dans le filtre de la liste (les autres filtres ne s'appliquent pas au rapport) |
| `/paie/new` | `PaieFormComponent` | Création — recherche d'employé par saisie assistée (les employés sont trop nombreux pour une liste chargée entièrement, contrairement à Function/Chantier) |
| `/paie/:id` | `PaieDetailComponent` | Consultation |
| `/paie/:id/edit` | `PaieFormComponent` | Modification — employé et période affichés en lecture seule avec un message explicite |

La recherche d'employé (`shared/reference-data/employee-reference.service.ts`) interroge
`/employees/search` par page réduite à chaque frappe, plutôt qu'un chargement complet — à la
différence de `FunctionReferenceService`/`ChantierReferenceService`, qui chargent tout (jeux de
données bien plus petits).

Accès via la barre latérale de l'application (`app.component.ts`, entrée "Paie").

---

## Évolutions prévues

Voir [TODO.md](../../TODO.md) pour le détail complet — deux décisions produit actées mais pas encore
implémentées (le domaine Pointage, dont elles dépendent, n'existe pas encore) :

- **Calcul de la paie depuis le Pointage** : à terme, l'import Excel de la paie disparaît. La saisie
  du Pointage (jours travaillés, récupérations...) déclenchera le calcul automatique du bulletin
  correspondant, sans intervention humaine sur les valeurs calculables — poursuite logique du calcul
  déjà automatique de `salaireTotal` (voir « Règles métier » ci-dessus).
- **Statuts provisoire / validé (Pointage et Paie)** : une fois validé, un pointage ou un bulletin
  sera figé (non modifiable) ; seul l'état provisoire restera éditable. Un mois ne pourra être saisi
  que si le mois précédent est validé, imposant une progression strictement séquentielle.

---

## Limites connues

Voir [TODO.md](../../TODO.md) pour le détail :

- Aucune limite liée à l'authentification : tous les endpoints requièrent un JWT valide et la
  permission adéquate (voir `docs/rbac/paie.md`).
- Aucun audit (Hibernate Envers).
- `salaireMensuel` et les primes restent saisis/importés, jamais calculés — seul `salaireTotal` en
  est dérivé pour l'instant. Le calcul complet depuis le Pointage (voir « Évolutions prévues »
  ci-dessus) reste à construire.
