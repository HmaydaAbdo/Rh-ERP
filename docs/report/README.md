# Module Report (Paie)

> Documentation dédiée à l'export/reporting de la paie — distincte de `docs/paie/README.md`
> (domaine métier Paie : entité, import Excel, API CRUD). Ce document couvre la génération de
> documents à partir des bulletins de paie : l'export Excel (opérationnel/tabulaire) et le rapport
> PDF (BI RH/Paie de synthèse pour la direction) — deux besoins différents, deux architectures
> dédiées côté périmètre de données (voir « Pourquoi deux périmètres ? »), un même principe de
> conception : jamais de duplication de la logique métier entre eux.

---

## Rôle du module

Produire, pour une période donnée (aaaa-MM), des documents dérivés des bulletins de paie (`Paie`)
sans jamais les modifier :

- **Export Excel** : classeur multi-feuilles opérationnel — sert à exploiter/vérifier les données
  ligne par ligne (voir « Export Excel »).
- **Rapport PDF** : rapport BI de synthèse — sert à comprendre la situation RH/Paie en un coup
  d'œil (masse de paie, effectif, comparaison au mois précédent, distributions), avec une descente
  progressive Global → Chantier → Équipe → Employé (voir « Rapport PDF (BI) »). **Ce n'est pas un
  export Excel converti en PDF** : la structure, la granularité affichée et l'objectif sont
  volontairement différents.

---

## Architecture

```text
staport.rh.paie.reporting/   ← périmètre de l'export Excel (feuilles à générer, inclusions/exclusions)
├── PaiePerimetreService.java    Calcule le périmètre Excel : GLB + par chantier, équipes à séparer.
├── PerimetrePaie.java            Résultat : lignes globales + total mois précédent + Map<code, PerimetreChantier>
├── PerimetreChantier.java        Résultat par chantier : lignes retenues, lignes par équipe à générer, totaux
├── FeuillesEquipeMode.java       Enum : AUCUNE / TOUTES / PERSONNALISE
└── ObservationStc.java           Détection observation "STC"/"sortie" — réutilisée telle quelle par le PDF

staport.rh.paie.export/      ← sortie Excel (Apache POI)
├── PaieExportController.java     POST /paie/export
├── PaieExportService.java        Orchestration : appelle PaiePerimetreService, écrit les feuilles
├── PaieSheetWriter.java          Mise en page d'UNE feuille (partagée GLB/chantier/équipe)
├── PaieExcelStyles.java          Styles POI (en-têtes, bordures, formats numériques)
├── SqueletteMateriel.java        Cas particulier chantier C168 (tableau matériel à main levée)
└── PaieExportRequestDto.java     Corps de la requête

staport.rh.paie.report/      ← sortie PDF BI (Thymeleaf + openhtmltopdf + JFreeChart)
├── PaieReportController.java     POST /paie/report/pdf
├── PaieReportPdfService.java     Orchestration : appelle PaieBiReportBuilder, rend le HTML, produit le PDF
├── PaieBiReportBuilder.java      Périmètre + agrégations BI (fait/dimensions/mesures — voir plus bas).
│                                 N'utilise PAS PaiePerimetreService : besoin différent (agrégation
│                                 systématique de tout le périmètre filtré, jamais une sélection
│                                 manuelle de sous-feuilles) — voir « Pourquoi deux périmètres ? ».
├── PaieReportChartService.java   Graphiques en barres horizontales (JFreeChart → PNG → base64)
├── RapportBiVue / SyntheseGlobaleVue / ChantierBiVue / EquipeBiVue / DistributionVue /
│   KpiMontantVue / KpiEffectifVue / EffectifFonctionSimpleVue / LigneMatriceFonctionChantierVue /
│   LigneEmployeVue                Vue-modèle (records), aucune logique métier
├── PaieReportFontProvider.java   Police embarquée pour le rendu PDF (accents FR)
├── PaieReportNumberFormat.java   Formatage des nombres, variations et tendances (HAUSSE/BAISSE/STABLE)
└── PaieReportPdfRequestDto.java  Corps de la requête — mêmes filtres que PaieSearchCriteria (page Paie)
```

Frontend (`frontend/src/app/portail/paie/`) :

```text
export-excel/
└── PaieExportExcelDialogComponent   Dialog dédié à l'export Excel (bouton "Exporter Excel")

export-pdf/
└── PaieExportPdfDialogComponent     Dialog dédié au rapport PDF (bouton "Exporter PDF") : affiche en
                                      lecture seule les filtres actifs de la liste (périmètre du
                                      rapport) + un sélecteur Année/Mois obligatoire.

list/
└── PaieListComponent                Porte les deux boutons, le filterForm (périmètre partagé), et
                                      transmet ses valeurs courantes au dialog PDF.
```

### Pourquoi deux périmètres (`PaiePerimetreService` vs `PaieBiReportBuilder`) ?

`PaiePerimetreService` répond à « quelles feuilles Excel générer, selon une configuration manuelle
de sous-feuilles équipe » (voir `PaieExportExcelDialogComponent`) — sa notion de périmètre est celle
d'un classeur à onglets, où GLB et les feuilles chantier sont toujours complètes et où les
sous-feuilles équipe sont une sélection explicite de l'utilisateur (rien d'automatique). Le rapport
BI répond à une question différente — « quelle est la situation RH/Paie sur le périmètre filtré ? »
— et doit donc **tout** agréger automatiquement (chaque chantier, chaque équipe y compris
« Sans équipe »), sans aucune configuration manuelle. Ce sont deux contrats différents ; les forcer
à partager un seul service aurait introduit des branches conditionnelles artificielles des deux
côtés. Les deux s'appuient en revanche sur les mêmes briques transverses quand c'est légitime
(`ObservationStc`, le même format de nombre côté PDF que côté Excel).

---

## Export Excel

`PaieExportService.exporter(periode, requete)` :

1. Délègue le calcul du périmètre à `PaiePerimetreService.calculer(...)`.
2. Écrit une feuille **GLB** avec `perimetre.lignesGlobales()` — **toujours tous les employés de
   la période**, quel que soit le paramétrage équipe (jamais filtrée par lui).
3. Écrit une feuille par chantier trouvé dans `perimetre.parChantier()` — **toujours une par
   chantier de la période**, également indépendante du paramétrage équipe.
4. Pour chaque chantier, écrit une sous-feuille par équipe listée dans
   `chantier.lignesParEquipeAGenerer()` (configuration équipe, voir plus bas).

Ces deux premiers points sont un invariant du module, valable pour n'importe quelle
configuration : **Global et chantiers ne sont jamais filtrés par la configuration équipe**. Le
champ `chantiers` existe dans `PaieExportRequestDto` (restriction de tout le périmètre par code
chantier, y compris GLB) mais n'est **plus exposé par le dialog Excel** — conservé dans le contrat
pour ne pas casser un appel API existant.

### Structure des feuilles générées

Chaque feuille (GLB, chantier, ou équipe) est écrite par `PaieSheetWriter.ecrire(...)` avec la même
mise en page :

- Titre : `"CHANTIER : X - PAIE MOIS MM-aaaa"` (X = `GLOBAL`, le code chantier, ou
  `<code> - Equipe: <équipe>`).
- En-têtes à deux niveaux : Nbre Jrs → P / J.R.O / J.R.D, SALAIRE → SALAIRE / RO / RD.
- Une ligne par employé retenu sur cette feuille.
- **TOTAL GENERAL** : formule Excel `SUBTOTAL(9, ...)`, recalculée dynamiquement (pas une valeur
  figée).
- **TOTAL GENERAL MOIS PRECEDENT** : valeur figée calculée côté serveur, somme de `salaireTotal`
  sur la période précédente pour le même périmètre — affiche `INTROUVABLE` si aucune paie n'existe
  pour ce périmètre le mois précédent (distingue "aucune donnée" de "total réellement nul", voir
  `PaiePerimetreService.totalSalairesOuNull`).
- Récapitulatif **effectif par fonction** (tri alphabétique) avec une colonne **STC** : nombre de
  lignes dont `observation` vaut exactement `"STC"` ou `"sortie"` (voir `ObservationStc`).
- Cas particulier : sur une feuille **équipe** du chantier **C168**, un second tableau ("squelette
  matériel" CAMION ou ENGINS, étiquettes à remplir à la main) est ajouté — voir
  `SqueletteMateriel` et `docs/paie/README.md` pour le détail de cette règle propre à ce chantier.

### Paramétrage chantier/équipe

Piloté par trois champs de la requête (`PaieExportRequestDto`), calculés côté frontend et
interprétés par `PaiePerimetreService.calculer` :

| Champ | Rôle |
|---|---|
| `feuillesEquipeMode` | `AUCUNE` (aucune sous-feuille équipe) ou `PERSONNALISE` (liste explicite via `equipesParChantier`). `TOUTES` existe dans l'enum et reste supportée par le backend (une sous-feuille par équipe trouvée, pour chaque chantier), mais n'est **plus produite par le dialog Excel actuel** — conservée pour compatibilité API. |
| `equipesParChantier` | `Map<code chantier, équipes>` — uniquement en mode `PERSONNALISE` : pour chaque chantier listé, exactement les équipes indiquées obtiennent leur propre sous-feuille. Un chantier absent de la map n'a aucune sous-feuille équipe. **Sélectionner un chantier ne sélectionne aucune équipe automatiquement** — la sélection est toujours explicite, équipe par équipe. |
| `equipesExcluesFeuilleChantier` | `Map<code chantier, équipes>` — indépendant du champ précédent : pour un chantier donné, les équipes listées ici n'apparaissent pas sur **la feuille de ce chantier** (le total du mois précédent affiché sur cette feuille applique la même exclusion, pour rester comparable). |

Le dialog Excel (`PaieExportExcelDialogComponent`) construit ces champs à partir d'une UX à trois
niveaux, plus simple que la structure `AUCUNE`/`TOUTES`/`PERSONNALISE` brute :

1. **Chantiers concernés** (multi-sélection) : chantiers pour lesquels une configuration équipe va
   être définie. En sélectionner un n'a par lui-même aucun effet sur les feuilles générées.
2. Pour chaque chantier concerné, **Équipes à séparer** (multi-sélection, alimentée par
   `GET /paie/equipes?chantierCode=...&periode=...`) : équipes qui obtiennent leur propre
   sous-feuille. Rien n'est présélectionné.
3. Pour chaque équipe à séparer, un toggle **Inclure / Exclure** : la présence de cette équipe sur
   la feuille du chantier lui-même (par défaut Inclure).

Le composant traduit cette configuration en `feuillesEquipeMode: 'PERSONNALISE'` (ou `'AUCUNE'` si
aucun chantier concerné n'a d'équipe à séparer) + les deux maps ci-dessus — jamais `'TOUTES'`,
jamais de filtre `chantiers`.

### Règle Include/Exclude d'une équipe dans la feuille chantier

Une équipe **exclue** de la feuille de son chantier :

- n'apparaît plus dans `Chantier X` (la feuille chantier) ;
- reste présente dans `Chantier X - Equipe: <équipe>` (sa propre sous-feuille, si elle en a une) ;
- reste présente dans `GLB` (jamais affectée par cette exclusion).

Exemple avec Équipe 1 incluse et Équipe 3 exclue :

| Feuille | Équipe 1 | Équipe 3 |
|---|---|---|
| `GLB` | présente | présente |
| `Chantier A` | présente | **absente** |
| `Chantier A - Equipe: Équipe 1` | présente | — |
| `Chantier A - Equipe: Équipe 3` | — | présente |

`equipesExcluesFeuilleChantier` est indépendant de `equipesParChantier` (une équipe peut en théorie
être exclue de la feuille chantier sans avoir sa propre sous-feuille) — le dialog Excel restreint
volontairement cette possibilité : l'UI ne propose le toggle Inclure/Exclure que pour les équipes
déjà choisies comme « à séparer », pour garder une hiérarchie de configuration simple (Période →
Chantiers concernés → Équipes à séparer → Inclure/Exclure). La capacité plus large reste disponible
pour un appel direct à l'API.

---

## Rapport PDF (BI)

`POST /paie/report/pdf` (corps `PaieReportPdfRequestDto`) génère un rapport BI RH/Paie de synthèse
pour la direction — pas un export tabulaire. Il répond à quatre questions : quelle est la situation
actuelle de la paie ? comment évolue-t-elle par rapport au mois précédent ? où est concentrée la
masse/l'effectif (chantier, équipe, fonction) ? et pour chaque chantier, que se passe-t-il en
détail ?

### Périmètre et filtres

Le rapport reprend **exactement** les filtres déjà disponibles sur la page Paie
(`PaieSearchCriteria`, sans pagination) : `nomPrenom`, `cin`, `fonctionId`, `chantierId` — plus
`periode`, obligatoire (pas de filtre dans la liste). Un filtre actif restreint le périmètre entier
du rapport (KPI globaux compris) — **jamais ignoré silencieusement**. Le dialog PDF
(`PaieExportPdfDialogComponent`) affiche les filtres actifs en lecture seule et laisse choisir la
période ; il ne propose aucune configuration supplémentaire (pas de sélection manuelle de
chantiers/équipes — voir « Pourquoi deux périmètres ? »).

### Modèle analytique

| | |
|---|---|
| **Fait** | `Paie` — grain = 1 employé × 1 période (contrainte d'unicité `employee_id + periode` : `COUNT(*)` est toujours un effectif exact, jamais de double comptage). |
| **Dimensions** | Chantier (obligatoire sur `Paie`), Fonction (obligatoire), Équipe (optionnelle → `Sans équipe`), Employé, Période (mois analysé + mois précédent). |
| **Mesures de base** | Masse réelle de paie = `SUM(salaireTotal)` (**jamais** `salaireMensuel` — voir ci-dessous) ; Effectif = `COUNT(*)` ; STC = `COUNT` des lignes où `ObservationStc.estStcOuSortie`. |
| **Mesures calculées** | Part du total (%), variation absolue, variation %, masse moyenne par employé. |
| **Historique** | Chaque bulletin `Paie` est un instantané figé de chantier/fonction/équipe pour son mois — le rapport agrège donc les valeurs *stockées sur `Paie`*, jamais l'affectation actuelle de `Employee` (qui peut avoir changé depuis). La comparaison au mois précédent respecte le même principe : elle relit les `Paie` du mois précédent, pas l'état actuel. |

**Pourquoi `salaireTotal` et pas `salaireMensuel`** : `salaireMensuel` est une composante du
bulletin (le salaire de base) ; `salaireTotal` est le montant réellement versé (salaire + primes de
roulage) — c'est la seule mesure qui représente la masse de paie réelle de l'entreprise.

### Catalogue de KPI

| KPI | Formule | Grain | Comparaison mois précédent |
|---|---|---|---|
| Masse réelle de paie | `SUM(salaireTotal)` sur le périmètre filtré | Global / chantier | Oui — Δ absolu + Δ % (voir « Null-handling ») |
| Effectif | `COUNT(*)` | Global / chantier | Oui — Δ absolu (jamais ambigu, 0 est une valeur légitime) |
| Masse moyenne par employé | masse ÷ effectif | Global | Non (dérivé, comparer une moyenne de moyennes n'apporte rien) |
| Nombre de chantiers / fonctions | `COUNT DISTINCT` | Global | Non |
| Distribution par chantier | `SUM(salaireTotal)` groupé par chantier, + part du total | Global | Non (déjà 1 comparaison par KPI ci-dessus ; comparer chaque barre alourdirait le rapport sans plus-value décisionnelle claire) |
| Distribution par équipe (avec Sans équipe) | idem, groupé par équipe | Global / chantier | Non |
| Effectif par fonction (+ STC) | `COUNT(*)`, `COUNT` STC, groupés par fonction | Global / chantier | Non |
| Matrice Fonction × Chantier (+ STC) | `COUNT(*)`, `COUNT` STC, groupés par (chantier, fonction) | Global | Non |

Pas de KPI dupliqué : chaque carte/tableau répond à une question différente (voir §16 du prompt de
conception — jamais cinq façons de montrer le même montant).

### Null-handling (comparaison mois précédent)

- **Aucune ligne** le mois précédent pour le périmètre → la comparaison est explicitement
  indisponible (`Tendance.NON_DISPONIBLE`, valeur précédente affichée `INTROUVABLE`, aucune
  variation calculée) — jamais un `0 DH` ou un `+∞ %` trompeur.
- **Des lignes existent mais leur somme vaut zéro** (cas réel, distinct du cas précédent) → la
  variation absolue reste calculable, la variation % est explicitement `null` (division par zéro
  évitée), voir `PaieReportNumberFormat.variationPourcent`/`variationAbsolue`/`tendance`.
- Cette distinction est la même que celle déjà en place côté Excel (`INTROUVABLE` vs `0`,
  `PaiePerimetreService.totalSalairesOuNull`) — réutilisée à l'identique, pas réinventée.

### Cohérence global → local

La même mesure garde la même définition à tous les niveaux : masse globale = `SUM(salaireTotal)`
sur tout le périmètre filtré ; masse d'un chantier = `SUM(salaireTotal)` restreint à ce chantier ;
masse d'une équipe = `SUM(salaireTotal)` restreinte à ce chantier + cette équipe. Par construction,
`masse globale = Σ masses des chantiers` et `masse d'un chantier = Σ masses de ses équipes (Sans
équipe comprise)` — vérifié explicitement par un test (voir `PaieBiReportBuilderTest`). Les
pourcentages de part ne sont, en revanche, jamais mélangés entre niveaux : une distribution
« globale » rapporte au total global, une distribution intra-chantier rapporte au total du
chantier — jamais l'un à la place de l'autre.

### `Sans équipe` — catégorie de première classe

`Paie.equipe` est optionnel. Toute ligne dont `equipe` est `null` ou vide est regroupée sous le
libellé **`Sans équipe`**, à tous les niveaux où une distribution par équipe existe (globale,
intra-chantier) et jusqu'au détail employé (sa propre section « Sans équipe », avec BI + tableau,
au même niveau qu'une section équipe nommée). Elle n'est **jamais exclue** des agrégations ni
fusionnée silencieusement dans une équipe existante.

### Anti-duplication du détail employé

Un employé n'apparaît dans un tableau détaillé qu'**une seule fois**, au niveau équipe (ou
« Sans équipe ») — jamais au niveau chantier, qui ne montre que des agrégats BI. C'est la même
logique que la hiérarchie Global → Chantier → Équipe → Employé : chaque niveau au-dessus du dernier
résume, seul le dernier détaille.

### Structure du rapport

1. **Synthèse globale** (page 1) : bandeau (période + filtres actifs + date de génération), KPI
   (masse réelle, effectif, masse moyenne/employé, nombre de chantiers/fonctions), graphiques +
   tableaux de distribution (chantier, équipe), effectif par fonction.
2. **Effectif et STC par chantier et par fonction** : la matrice Fonction × Chantier, en table
   plate (voir « Visualisations » — pas de heatmap à cette cardinalité).
3. **Une section par chantier**, dans l'ordre alphabétique des codes : synthèse BI du chantier
   (masse + comparaison, effectif + comparaison, part de la masse globale, distribution par
   équipe, effectif par fonction), puis une sous-section par équipe (BI compacte : effectif, masse,
   part du chantier — puis le tableau détaillé des employés), et enfin **Sans équipe** dans les
   mêmes conditions.

Le tableau employé reprend les colonnes de la liste Paie à l'écran, moins Chantier et Équipe (déjà
portées par les titres de section) : Nom & prénom, Fonction, CIN, Nbre jrs (P/J.R.O/J.R.D), Salaire
(Salaire/RO/RD), Total, Obs.

### Visualisations

- **Distribution par chantier / par équipe** (page 1) : barres horizontales générées côté serveur
  (`PaieReportChartService`, JFreeChart → PNG embarqué en base64 — le rendu PDF openhtmltopdf n'a
  pas d'URI de base pour référencer un fichier image). Jamais de camembert/donut : une barre
  horizontale compare mieux plus de 3-4 valeurs et affiche le montant directement sur la barre. Le
  graphique est plafonné aux 12 plus grosses valeurs (le reste regroupé sous « Autres ») pour rester
  lisible imprimé — le tableau de distribution associé, lui, n'est jamais tronqué.
- **Matrice Fonction × Chantier** : table plate plutôt qu'une heatmap, la cardinalité chantier ×
  fonction d'une PME BTP restant largement lisible en tableau — une heatmap y ajouterait du chrome
  sans gain de lecture.

### Composants et services principaux

| Fichier | Rôle |
|---|---|
| `PaiePerimetreService` | Périmètre Excel (sélection manuelle de sous-feuilles équipe) |
| `PaieExportService` / `PaieSheetWriter` / `PaieExcelStyles` | Génération du classeur Excel |
| `PaieBiReportBuilder` | Périmètre + agrégations BI du rapport PDF — testé isolément (`PaieBiReportBuilderTest`) sans dépendre du repository via `construireDepuis` |
| `PaieReportPdfService` | Orchestration HTML → PDF du rapport PDF |
| `PaieReportChartService` | Graphiques du rapport PDF (JFreeChart) |
| `PaieExportExcelDialogComponent` (frontend) | UX dédiée à la configuration de l'export Excel |
| `PaieExportPdfDialogComponent` (frontend) | UX dédiée au rapport PDF : filtres actifs + période |
| `PaieService.exporter()` / `.telechargerRapportPdf()` / `.listerEquipes()` (frontend) | Appels HTTP, aucune logique métier côté client |

---

## Points d'extension

- **Logo Staport dans l'en-tête PDF** : aucun fichier logo n'existe encore dans le dépôt (le seul
  actif disponible est `frontend/src/favicon.ico`) ; à ajouter dans le fragment `hero` de
  `resources/report/paie/fragments.html` en le chargeant en classpath (`ClassPathResource`, comme
  `PaieReportPdfService.chargerCss`) et en l'encodant en base64 — le rendu PDF n'a pas d'URI de base
  pour résoudre un chemin relatif.
- **Comparaison mois précédent au niveau équipe** : volontairement omise pour l'instant (une
  variation par équipe, en plus du global et du chantier, ajoute une 3ᵉ couche de deltas pour un
  gain de lecture marginal) — à ajouter dans `PaieBiReportBuilder.equipeVue` si un besoin réel se
  confirme.
- **Filtre `equipe`** : `PaieSearchCriteria` le supporte déjà, mais aucun filtre équipe n'existe sur
  la page Paie à ce jour — le rapport ne l'expose donc pas non plus (le périmètre du rapport est
  strictement celui des filtres réellement disponibles à l'écran). À réévaluer si un filtre équipe
  est ajouté à la liste.
- **Nouveaux indicateurs BI** : ajouter une mesure suit toujours le même chemin —
  `PaieBiReportBuilder` (calcul), un nouveau record de vue-modèle si la forme ne rentre dans aucun
  existant, un fragment Thymeleaf dans `fragments.html`, une entrée dans le catalogue de KPI
  ci-dessus. Avant d'ajouter un KPI, vérifier qu'il répond à une question non déjà couverte (voir
  « Catalogue de KPI ») pour éviter la duplication.
