# Module Report (Paie)

> Documentation dédiée à l'export/reporting de la paie — distincte de `docs/paie/README.md`
> (domaine métier Paie : entité, import Excel, API CRUD). Ce document couvre la génération de
> documents à partir des bulletins de paie : l'export Excel (opérationnel/tabulaire) et le rapport
> PDF (BI RH/Paie de synthèse pour la direction) — deux besoins différents, deux pipelines de
> génération dédiés (voir « Pourquoi deux pipelines ? »), mais une seule sélection manuelle
> d'équipes à détailler, partagée par les deux formats depuis le 2026-09-29 (voir « Export unifié
> PDF/Excel »).

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
  volontairement différents — en particulier, un employé n'apparaît **jamais deux fois** dans le
  PDF, alors que l'Excel duplique volontairement (Global + chantier + équipe, voir « Export
  unifié PDF/Excel »).

---

## Architecture

```text
staport.rh.paie.reporting/   ← périmètre de l'export Excel + règles partagées PDF/Excel
├── PaiePerimetreService.java    Calcule le périmètre Excel : GLB + par chantier, équipes à séparer.
├── PerimetrePaie.java            Résultat : lignes globales + total mois précédent + Map<code, PerimetreChantier>
├── PerimetreChantier.java        Résultat par chantier : lignes retenues, lignes par équipe à générer, totaux
├── FeuillesEquipeMode.java       Enum : AUCUNE / TOUTES / PERSONNALISE
├── ObservationStc.java           Détection observation "STC"/"sortie" — réutilisée telle quelle par le PDF
└── MaterielChantierCatalogue.java Règle métier partagée PDF/Excel : squelette "parc matériel"
                                  (CAMION/ENGINS) du chantier "C168", équipes "CH"/"OP" — seule la
                                  présentation diffère par format (voir « Squelette parc matériel »).

staport.rh.paie.export/      ← sortie Excel (Apache POI)
├── PaieExportController.java     POST /paie/export
├── PaieExportService.java        Orchestration : appelle PaiePerimetreService, écrit les feuilles
├── PaieSheetWriter.java          Mise en page d'UNE feuille (partagée GLB/chantier/équipe) — lignes
│                                 de résumé TOTAL GENERAL / TOTAL GENERAL MOIS PRECEDENT, tableau
│                                 récap effectif par fonction, squelette matériel (voir plus bas)
├── PaieExcelStyles.java          Styles POI (en-têtes, bordures, formats numériques)
├── SqueletteMateriel.java        Vue Excel du squelette matériel (délègue à MaterielChantierCatalogue)
└── PaieExportRequestDto.java     Corps de la requête

staport.rh.paie.repositories/
├── EvolutionChantierEquipeProjection.java  Projection JPQL (chantierCode, equipe, periode, masse,
│                                 effectif, stc, stcMontant) — la donnée la plus fine dont le rapport
│                                 calcule un historique (Global, Chantier). Plus consommée par aucun
│                                 graphique du rapport (évolution mensuelle retirée, voir
│                                 docs/report/rapport-v2.md) mais toujours calculée, prête à être
│                                 réutilisée sans redévelopper si le besoin se confirme un jour.
└── PaieRepository.premierePeriode()  Mois le plus ancien où une paie existe réellement en base —
                                  plancher de la fenêtre glissante utilisée par le calcul ci-dessus,
                                  jamais un historique qui n'a jamais existé (mois "fantômes" à 0)

staport.rh.paie.report/      ← sortie PDF BI (JasperReports Library — JRXML compilé au démarrage,
│                                 resources/report/paie/jasper/)
├── PaieReportController.java     POST /paie/report/pdf
├── PaieReportPdfService.java     Orchestration : appelle PaieBiReportBuilder, aplatit chantiers →
│                                 sections (équipe détaillée ou "reste") → employés en une seule
│                                 liste dénormalisée (LigneRapportDetailBean), remplit le gabarit
│                                 JRXML principal (rapport.jrxml, avec ses 2 sous-rapports — voir
│                                 plus bas) en DEUX passages (voir « Numérotation des chapitres et
│                                 des pages ») et exporte en PDF (JRPdfExporter).
├── PaieBiReportBuilder.java      Périmètre + agrégations BI (fait/dimensions/mesures — voir plus bas).
│                                 Chaque chantier a désormais sa propre section
│                                 (`ChantierBiVue.avecDetailEquipe`, piloté par la sélection
│                                 manuelle `PaieReportPdfRequestDto.equipesParChantier` — voir
│                                 « Export unifié PDF/Excel »), plus de classement "détaillé/compact"
│                                 par effectif. N'utilise PAS PaiePerimetreService : besoin différent
│                                 (agrégation systématique de tout le périmètre filtré) — voir
│                                 « Pourquoi deux pipelines ? ».
├── PaieReportGroupedChartCustomizer.java Personnalise TOUS les <barChart> à barres groupées
│                                 horizontales du document (masse/effectif/STC en personnes/STC en DH —
│                                 4 séries, chacune nommée avec son unité dans la légende) : "Vue par
│                                 chantier" (chapitre I) et répartition par équipe de chaque chantier
│                                 ayant au moins une équipe détaillée — une seule classe réutilisée
│                                 partout, la donnée sous-jacente (RepartitionBean) étant la même
│                                 forme à chaque niveau. Axe des valeurs masqué — **chaque série est
│                                 normalisée à sa propre valeur maximale** (0 à 1, indépendamment des
│                                 3 autres) avant d'être tracée : masquer l'axe ne suffit pas à lui
│                                 seul à rendre lisibles 4 séries d'ordres de grandeur très différents
│                                 sur une échelle linéaire partagée. La vraie valeur (jamais la valeur
│                                 normalisée) reste affichée en étiquette sur chaque barre, lue dans
│                                 une table à part conservée avant normalisation. Plafonné aux 15 plus
│                                 grosses valeurs + "Autres" (voir
│                                 PaieBiReportBuilder.MAX_BARRES_GRAPHIQUE). Voir « Visualisations ».
├── RapportBiVue / SyntheseGlobaleVue / ChantierBiVue / EquipeBiVue / KpiMontantVue / KpiEffectifVue /
│   LigneEmployeVue / MaterielLigneVue  Vue-modèle (records, sauf classes à getters — voir plus bas),
│                                 aucune logique métier — utilisée uniquement côté Java (paramètres
│                                 JRXML), jamais liée par réflexion. `ChantierBiVue.avecDetailEquipe`
│                                 remplace l'ancien `compact` (seuil d'effectif) : `true` dès qu'au
│                                 moins une équipe du chantier a été sélectionnée manuellement.
│                                 `EquipeBiVue` porte, en plus du détail employé,
│                                 `montantMoisPrecedentOuIntrouvable` (ligne de résumé),
│                                 `repartitionFonction` (tableau récap) et `materiel` (squelette
│                                 parc matériel, vide sauf C168/CH/OP) — voir « Lignes de résumé et
│                                 tableau récap ».
├── RepartitionBean / LigneRapportDetailBean / MaterielLigneVue
│                                 Classes à getters (pas des records) : lignes de table/graphique
│                                 liées par introspection JavaBean (JRBeanCollectionDataSource) — un
│                                 getter public sur une classe non publique n'est pas accessible par
│                                 réflexion depuis un autre package, ces classes sont publiques.
│                                 LigneRapportDetailBean est la source de données unique et à plat de
│                                 rapport.jrxml : un employé par ligne, dénormalisée avec le contexte
│                                 chantier + section. Porte `chantierAvecDetailEquipe`, qui pilote un
│                                 `printWhenExpression` au niveau de la BANDE `GroupChantier` (pas
│                                 d'un élément) — bande totalement absente, hauteur nulle, quand le
│                                 chantier n'a aucune équipe détaillée. RepartitionBean (libellé,
│                                 effectif, montant, stc, stcMontant) alimente TOUS les barChart du
│                                 document et, réutilisée sans montant/stcMontant, le tableau récap
│                                 Fonction/Effectif/STC.
├── PaieReportNumberFormat.java   Formatage des nombres, variations, tendances (HAUSSE/BAISSE/STABLE)
│                                 et chiffres romains (numérotation des chapitres)
└── PaieReportPdfRequestDto.java  Corps de la requête — mêmes filtres que PaieSearchCriteria (page
                                  Paie) + `equipesParChantier` (même forme et même sélection que
                                  PaieExportRequestDto.equipesParChantier, voir « Export unifié »).

resources/report/paie/jasper/  ← gabarits JRXML — style noir/blanc/gris, police Liberation Serif,
                                  seul les graphiques restent en couleur — voir « Style visuel »
├── rapport.jrxml                 Gabarit principal : page de garde (bande title, isTitleNewPage —
│                                   seule page sans pageHeader/pageFooter, sans date de génération,
│                                   voir docs/report/rapport-v2.md), puis « I — Vue d'ensemble »
│                                   (GroupSynthese, expression constante), puis une section par
│                                   CHANTIER — TOUS désormais, chacun son propre chapitre romain
│                                   (GroupChantierEvolution, toujours affichée), suivie
│                                   optionnellement du graphique de répartition par équipe
│                                   (GroupChantier, bande conditionnelle) et d'une section par équipe
│                                   détaillée ou "reste" (GroupEquipe, isStartNewPage="true" — chaque
│                                   section démarre sur sa propre page). Le pageHeader/pageFooter (5
│                                   blocs / repère de hiérarchie, une seule bande définie une fois
│                                   chacun) se répètent nativement sur toutes ces pages. Voir
│                                   « Structure du rapport ».
├── recap-fonction.jrxml          Sous-rapport : tableau récap Fonction/Effectif/STC de chaque
│                                   section (nombre de lignes variable — voir « Lignes de résumé et
│                                   tableau récap »).
└── recap-materiel.jrxml          Sous-rapport : squelette "parc matériel" (CAMION/ENGINS),
                                    invoqué avec une liste vide (donc invisible) hors chantier
                                    C168/CH/OP — voir « Squelette parc matériel ».
```

Frontend (`frontend/src/app/portail/paie/`) :

```text
export/
└── PaieExportDialogComponent    Dialog d'export UNIQUE (bouton "Exporter") — un p-selectButton
                                  PDF/Excel, la même sélection manuelle de chantiers/équipes pour
                                  les deux formats (voir « Export unifié PDF/Excel »).

list/
└── PaieListComponent            Porte le bouton "Exporter", ouvre le dialog ci-dessus.
```

### Pourquoi deux pipelines (`PaiePerimetreService` vs `PaieBiReportBuilder`) ?

`PaiePerimetreService` répond à « quelles feuilles Excel générer » — sa notion de périmètre est
celle d'un classeur à onglets, où GLB et les feuilles chantier sont **toujours complètes**
(dupliquant volontairement les employés déjà présents dans une sous-feuille équipe). Le rapport BI
répond à une question différente — « quelle est la situation RH/Paie sur le périmètre filtré ? » —
et affiche chaque employé **une seule fois**, dans une seule section. Ce sont deux contrats de
sortie différents ; les forcer à partager un seul service de rendu aurait introduit des branches
conditionnelles artificielles des deux côtés. Depuis le 2026-09-29, les deux consomment en revanche
la **même sélection manuelle** d'équipes à détailler (`equipesParChantier`, un seul dialog
frontend, voir « Export unifié PDF/Excel ») et la même règle métier pour le squelette matériel
(`MaterielChantierCatalogue`) — seule la présentation par format reste distincte.

---

## Export unifié PDF/Excel (2026-09-29)

Un seul bouton "Exporter" (`PaieListComponent`) ouvre `PaieExportDialogComponent` : un
`p-selectButton` choisit le format (PDF ou Excel), le reste du formulaire — période, chantiers à
détailler par équipe, équipes à séparer par chantier — est **identique pour les deux formats** et
construit une seule structure `Map<code chantier, équipes>` envoyée soit à
`POST /paie/export` (`PaieExportRequestDto.equipesParChantier`), soit à `POST /paie/report/pdf`
(`PaieReportPdfRequestDto.equipesParChantier`).

**La conséquence de cette sélection diffère par format**, parce que les deux formats ont des
règles de duplication opposées (voir « Pourquoi deux pipelines ? ») :

| | Chantier NON sélectionné | Chantier sélectionné, équipe cochée | Chantier sélectionné, équipe NON cochée |
|---|---|---|---|
| **Excel** | Feuille chantier complète (comme toujours) | Feuille équipe en plus (ses employés restent aussi dans la feuille chantier, sauf exclusion explicite) | Feuille chantier complète (comme si le chantier n'était pas sélectionné) |
| **PDF** | Un chapitre, une seule section listant tous les employés, aucun graphique de répartition | Section dédiée (graphique + tableau), ses employés **retirés** de la section "reste" | Ses employés rejoignent la section "reste" du chantier (jamais nommée "Sans équipe", voir `EquipeBiVue`) |

Le toggle Inclure/Exclure (propre à l'Excel, voir « Règle Include/Exclude ») n'a pas de sens pour
le PDF — l'UI ne l'affiche que pour le format Excel — puisqu'un employé n'y apparaît jamais deux
fois.

Le dialog affiche, avant de télécharger, un panneau récapitulatif reformulant en une phrase par
chantier ce qui sera réellement généré (ex. « Chantier C168 : graphique répartition par équipe +
section détaillée pour CH, OP, et un tableau "CHANTIER : C168" pour le reste des employés. ») — un
garde-fou visuel avant l'export, pas seulement une liste de cases cochées.

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
chantier, y compris GLB) mais n'est **plus exposé par le dialog** — conservé dans le contrat
pour ne pas casser un appel API existant.

### Structure des feuilles générées

Chaque feuille (GLB, chantier, ou équipe) est écrite par `PaieSheetWriter.ecrire(...)` avec la même
mise en page :

- Titre : `"CHANTIER : X - PAIE MOIS MM-aaaa"` (X = `GLOBAL`, le code chantier, ou
  `<code> - Equipe: <équipe>`).
- En-têtes à deux niveaux : Nbre Jrs → P / J.R.O / J.R.D, SALAIRE → SALAIRE / RO / RD.
- Une ligne par employé retenu sur cette feuille.
- **TOTAL GENERAL** : formule Excel `SUBTOTAL(9, ...)`. Depuis le 2026-09-29,
  `Workbook.setForceFormulaRecalculation(true)` est activé sur le classeur généré : sans ce flag,
  POI écrit la formule sans valeur mise en cache, et Excel/LibreOffice affichaient la cellule vide
  jusqu'à un recalcul manuel (F9) — corrigé, la somme s'affiche désormais dès l'ouverture du
  fichier.
- **TOTAL GENERAL MOIS PRECEDENT** : valeur figée calculée côté serveur, somme de `salaireTotal`
  sur la période précédente pour le même périmètre — affiche `INTROUVABLE` si aucune paie n'existe
  pour ce périmètre le mois précédent (distingue "aucune donnée" de "total réellement nul", voir
  `PaiePerimetreService.totalSalairesOuNull`).
- Récapitulatif **effectif par fonction** (tri alphabétique) avec une colonne **STC** : nombre de
  lignes dont `observation` vaut exactement `"STC"` ou `"sortie"` (voir `ObservationStc`).
- Cas particulier : sur une feuille **équipe** du chantier **C168**, un second tableau ("squelette
  matériel" CAMION ou ENGINS, étiquettes à remplir à la main) est ajouté — voir « Squelette parc
  matériel ».

### Paramétrage chantier/équipe

Piloté par trois champs de la requête (`PaieExportRequestDto`), calculés côté frontend et
interprétés par `PaiePerimetreService.calculer` :

| Champ | Rôle |
|---|---|
| `feuillesEquipeMode` | `AUCUNE` (aucune sous-feuille équipe) ou `PERSONNALISE` (liste explicite via `equipesParChantier`). `TOUTES` existe dans l'enum et reste supportée par le backend (une sous-feuille par équipe trouvée, pour chaque chantier), mais n'est **plus produite par le dialog actuel** — conservée pour compatibilité API. |
| `equipesParChantier` | `Map<code chantier, équipes>` — uniquement en mode `PERSONNALISE` : pour chaque chantier listé, exactement les équipes indiquées obtiennent leur propre sous-feuille. Un chantier absent de la map n'a aucune sous-feuille équipe. **Sélectionner un chantier ne sélectionne aucune équipe automatiquement** — la sélection est toujours explicite, équipe par équipe. Même map envoyée au PDF (voir « Export unifié »). |
| `equipesExcluesFeuilleChantier` | `Map<code chantier, équipes>` — indépendant du champ précédent : pour un chantier donné, les équipes listées ici n'apparaissent pas sur **la feuille de ce chantier** (le total du mois précédent affiché sur cette feuille applique la même exclusion, pour rester comparable). Spécifique à l'Excel, ignoré par le PDF. |

Le dialog (`PaieExportDialogComponent`) construit ces champs à partir d'une UX à trois niveaux,
plus simple que la structure `AUCUNE`/`TOUTES`/`PERSONNALISE` brute :

1. **Chantiers à détailler par équipe** (multi-sélection) : chantiers pour lesquels une
   configuration équipe va être définie. En sélectionner un n'a par lui-même aucun effet sur les
   documents générés.
2. Pour chaque chantier concerné, **Équipes à détailler** (multi-sélection, alimentée par
   `GET /paie/equipes?chantierCode=...&periode=...`) : équipes qui obtiennent leur propre
   sous-feuille (Excel) et/ou section (PDF). Rien n'est présélectionné.
3. **Format Excel uniquement** : pour chaque équipe à détailler, un toggle **Inclure / Exclure** :
   la présence de cette équipe sur la feuille du chantier lui-même (par défaut Inclure). Absent de
   l'UI en format PDF (voir « Export unifié »).

Le composant traduit cette configuration en `feuillesEquipeMode: 'PERSONNALISE'` (ou `'AUCUNE'` si
aucun chantier concerné n'a d'équipe à détailler) + les deux maps ci-dessus — jamais `'TOUTES'`,
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
être exclue de la feuille chantier sans avoir sa propre sous-feuille) — le dialog restreint
volontairement cette possibilité : l'UI ne propose le toggle Inclure/Exclure que pour les équipes
déjà choisies comme « à détailler », pour garder une hiérarchie de configuration simple. La
capacité plus large reste disponible pour un appel direct à l'API.

### Squelette parc matériel (chantier C168)

Décision (HMAYDA, 2026-09-22, étendue au PDF le 2026-09-29) : sur les sections équipe du chantier
**C168**, un squelette de tableau matériel — labels uniquement, colonne "Nbre" laissée vide — est
ajouté à côté du tableau récap Fonction/Effectif/STC :

- Équipe **CH** → tableau **CAMION** (Camion citerne, Camion 8x4, Camion SR, Port char, Pick up).
- Équipe **OP** → tableau **ENGINS** (Pelle pneu, Pelle chenille, Niveleuse, Compacteurs, Chargeur,
  Bull, Tractopelle).

Règle propre à ce chantier uniquement, aucune règle générale identifiée pour les autres —
**volontairement pas généralisée** (pas de saisie ni d'écran dédié, pas de persistance) : la
colonne "Nbre" est remplie à la main, au stylo, sur le document imprimé (PDF) ou dans le classeur
téléchargé (Excel, cellule libre). La règle métier (quel chantier/équipe → quels libellés) vit dans
`MaterielChantierCatalogue` (package `staport.rh.paie.reporting`), partagée par les deux formats —
`PaieExportService.squeletteMateriel` et `PaieBiReportBuilder` (via `EquipeBiVue.materiel`)
délèguent tous deux à cette classe, jamais de duplication de la règle. Le PDF affiche ce squelette
uniquement quand l'équipe CH/OP a été explicitement sélectionnée pour un détail séparé (voir
« Export unifié ») — une équipe non détaillée rejoint le "reste" du chantier, sans squelette
matériel propre.

---

## Rapport PDF (BI)

`POST /paie/report/pdf` (corps `PaieReportPdfRequestDto`) génère un rapport BI RH/Paie de synthèse
pour la direction — pas un export tabulaire. Il répond à quatre questions : quelle est la situation
actuelle de la paie ? comment évolue-t-elle par rapport au mois précédent ? où est concentrée la
masse/l'effectif (chantier, équipe) ? et pour chaque chantier, que se passe-t-il en détail ?

### Périmètre et filtres

Le dialog unifié (`PaieExportDialogComponent`, voir « Export unifié PDF/Excel ») pilote : la
période et la sélection d'équipes à détailler par chantier (`equipesParChantier`). Les autres
filtres (nom & prénom, CIN, fonction, chantier) **ne sont pas exposés par ce dialog** : le rapport
porte toujours sur l'ensemble des chantiers/employés de la période. Le backend
(`PaieReportPdfRequestDto`) garde ces champs optionnels (même forme que `PaieSearchCriteria`, sans
pagination) pour un appel API direct.

### Modèle analytique

| | |
|---|---|
| **Fait** | `Paie` — grain = 1 employé × 1 période (contrainte d'unicité `employee_id + periode` : `COUNT(*)` est toujours un effectif exact, jamais de double comptage). |
| **Dimensions** | Chantier (obligatoire sur `Paie`), Fonction (obligatoire — sert à trier le tableau employé ET alimente le tableau récap Fonction/Effectif/STC de chaque section, voir « Lignes de résumé et tableau récap »), Équipe (optionnelle → `Sans équipe`), Employé, Période (mois analysé + mois précédent). |
| **Mesures de base** | Masse réelle de paie = `SUM(salaireTotal)` (**jamais** `salaireMensuel` — voir ci-dessous) ; Effectif = `COUNT(*)` ; STC / sortie = `COUNT` des lignes où `ObservationStc.estStcOuSortie`, calculé **par chantier** et **par section** (indicateur, jamais une liste globale — voir « Catalogue de KPI »). |
| **Mesures calculées** | Part du total (%), variation absolue, variation %, masse moyenne par employé. |
| **Historique** | Chaque bulletin `Paie` est un instantané figé de chantier/fonction/équipe pour son mois — le rapport agrège donc les valeurs *stockées sur `Paie`*, jamais l'affectation actuelle de `Employee` (qui peut avoir changé depuis). La comparaison au mois précédent respecte le même principe. |

**Pourquoi `salaireTotal` et pas `salaireMensuel`** : `salaireMensuel` est une composante du
bulletin (le salaire de base) ; `salaireTotal` est le montant réellement versé (salaire + primes de
roulage) — c'est la seule mesure qui représente la masse de paie réelle de l'entreprise.

### Catalogue de KPI

| KPI | Formule | Grain | Comparaison mois précédent |
|---|---|---|---|
| Masse réelle de paie | `SUM(salaireTotal)` sur le périmètre filtré | Global / chantier / section | Oui — Δ absolu + Δ % (voir « Null-handling ») |
| Effectif | `COUNT(*)` | Global / chantier / section | Oui — Δ absolu (jamais ambigu, 0 est une valeur légitime) |
| Masse moyenne par employé | masse ÷ effectif | Global / chantier | Non (dérivé, comparer une moyenne de moyennes n'apporte rien) |
| Nombre de chantiers | `COUNT DISTINCT` | Global | Non — seul indicateur global conservé sur la déclinaison par chantier |
| Masse/Effectif/STC (personnes et DH) par chantier | `SUM(salaireTotal)`/`COUNT`/`COUNT(ObservationStc)`/`SUM(salaireTotal STC)` groupés par chantier | Global | Non — 1 seul graphique à 4 séries groupées (chapitre I, sans titre au-dessus) — voir « Visualisations » |
| ~~Masse/Effectif par fonction (globale)~~ | `SUM(salaireTotal)`/`COUNT` groupés par fonction | Global | Retiré temporairement (doublons dans le référentiel Fonction, voir « Points d'extension », TODO.md et `docs/report/rapport-v2.md`) — toujours calculé (`PaieBiReportBuilder`/`SyntheseGlobaleVue.repartitionFonction`), simplement plus affiché |
| Effectif/STC par fonction (tableau récap) | `COUNT`/`COUNT(ObservationStc)` groupés par fonction | Chaque section (équipe détaillée ou "reste") | Non — un tableau (jamais un graphique), voir « Lignes de résumé et tableau récap » |
| Répartition par équipe (avec Sans équipe) | `SUM(salaireTotal)`/`COUNT`/STC groupés par équipe | Chantier ayant au moins une équipe détaillée | Non — 1 graphique par chantier concerné ("Répartition par équipe"), TOUJOURS la distribution complète de toutes les équipes réelles — voir « Visualisations » |
| Coût moyen / employé (chantier) | masse chantier ÷ effectif chantier | Chantier | Non (dérivé, même principe que la moyenne globale) |
| STC / sortie | `COUNT` des lignes où `ObservationStc.estStcOuSortie` | Global / Chantier / Section | Non — indicateur numérique à chaque niveau, **et** 3ᵉ/4ᵉ série de chaque `<barChart>` |
| ~~Évolution masse/effectif (fenêtre glissante ≤ 12 mois)~~ | `SUM(salaireTotal)`/`COUNT` groupés par chantier/`periode` (`PaieRepository.sommerParChantierEquipePeriode`) | Global / Chantier | Retiré entièrement du rapport (2026-09-28, manque d'historique suffisant — voir `docs/report/rapport-v2.md`) — toujours calculé (`PaieBiReportBuilder.evolutionParNiveau`), simplement plus affiché |

Pas de KPI dupliqué : chaque carte/graphique répond à une question différente (jamais deux façons de
montrer le même montant). La dimension Fonction n'a plus d'écran dédié au niveau global du rapport
(chapitre retiré temporairement), mais alimente désormais le tableau récap de chaque section (voir
« Lignes de résumé et tableau récap »).

### Null-handling (comparaison mois précédent)

- **Aucune ligne** le mois précédent pour le périmètre → la comparaison est explicitement
  indisponible (`Tendance.NON_DISPONIBLE`, valeur précédente affichée `INTROUVABLE`, aucune
  variation calculée) — jamais un `0 DH` ou un `+∞ %` trompeur.
- **Des lignes existent mais leur somme vaut zéro** (cas réel, distinct du cas précédent) → la
  variation absolue reste calculable, la variation % est explicitement `null` (division par zéro
  évitée), voir `PaieReportNumberFormat.variationPourcent`/`variationAbsolue`/`tendance`.
- Cette distinction est la même que celle déjà en place côté Excel (`INTROUVABLE` vs `0`,
  `PaiePerimetreService.totalSalairesOuNull`) — réutilisée à l'identique, pas réinventée. La ligne
  "TOTAL GENERAL MOIS PRECEDENT" collée au bas de chaque tableau employé du PDF (voir plus bas)
  applique la même règle.

### Cohérence global → local

La même mesure garde la même définition à tous les niveaux : masse globale = `SUM(salaireTotal)`
sur tout le périmètre filtré ; masse d'un chantier = `SUM(salaireTotal)` restreint à ce chantier ;
masse d'une section = `SUM(salaireTotal)` restreinte à ce chantier + cette section. Par
construction, `masse globale = Σ masses des chantiers` et `masse d'un chantier = Σ masses de ses
sections (équipes détaillées + "reste")` — vérifié explicitement par un test (voir
`PaieBiReportBuilderTest`). Les pourcentages de part ne sont, en revanche, jamais mélangés entre
niveaux : une distribution « globale » rapporte au total global, une distribution intra-chantier
rapporte au total du chantier — jamais l'un à la place de l'autre.

### `Sans équipe` et le "reste" du chantier

`Paie.equipe` est optionnel. Toute ligne dont `equipe` est `null` ou vide est regroupée sous le
libellé **`Sans équipe`** dans le graphique de répartition par équipe (`ChantierBiVue.repartitionEquipe`,
toujours calculé sur la distribution complète). Au niveau du détail employé, en revanche, il n'existe
plus de section "Sans équipe" dédiée : ses employés rejoignent la section **"reste"** du chantier
(voir « Export unifié PDF/Excel ») avec les employés des autres équipes non sélectionnées pour un
détail séparé — cette section porte le titre du chantier (`"CHANTIER : <identifiant>"`, voir
« Identifiant chantier (nom + code) » ci-dessous), jamais "Sans équipe" (elle peut contenir des
employés d'une vraie équipe non sélectionnée, l'appeler "Sans équipe" serait trompeur). Dans la
colonne "Équipe" de la section "reste" en revanche (par ligne, pas par section), un employé sans
équipe affiche une cellule **vide**, jamais le texte "Sans équipe" (demande explicite de direction,
2026-09-29).

### Nom complet des équipes

Partout où le rapport affiche une équipe (titre de section "ÉQUIPE : ...", bandeau
`pageHeader`/`pageFooter` "CHANTIER : ... · ÉQUIPE : ...", colonne "Équipe" du tableau employé,
graphique "Répartition par équipe", titres de feuille Excel) : le **nom complet** de l'équipe
("CHAUFFEURS"), jamais son code brut tel que saisi en base ("CH") — demande explicite de direction,
2026-09-29, table fournie par la direction. Voir `staport.rh.paie.reporting.EquipeLibelleCatalogue`
(même package/principe que `MaterielChantierCatalogue`, partagé entre le rapport PDF et l'export
Excel) : un code absent de cette table est affiché tel quel (jamais de crash ni de masquage d'une
équipe imprévue).

Ce mapping est **strictement un habillage d'affichage** : le code brut reste la clé utilisée partout
ailleurs — sélection manuelle des équipes à détailler dans le dialog d'export
(`PaieReportPdfRequestDto.equipesParChantier`/`PaieExportRequestDto.equipesParChantier`, qui
continuent d'afficher et de manipuler les codes bruts, demande explicite de direction), agrégation
BI, détection de la section "reste". Même principe que `chantierCode` vs `identifiantChantier` pour
les chantiers (voir ci-dessous) : `EquipeBiVue.nom`/`LigneRapportDetailBean.equipeNom` restent le
code brut à usage interne, `EquipeBiVue.libelleAffiche`/`LigneRapportDetailBean.equipeLibelleAffiche`
portent le nom complet, réservé à l'affichage.

### Identifiant chantier (nom + code)

Partout où un chantier est identifié dans un texte affiché (titre de chapitre, section "reste",
bandeau `pageHeader`/`pageFooter`, titres de feuille Excel) :
**`"<nom> (<code>)"`** quand `Chantier.nom` est renseigné (champ optionnel, jamais exposé par la
synchronisation ERP — voir `docs/chantier/README.md`), **`"<code>"`** seul sinon (demande explicite
de direction, 2026-09-29 : le nom prime partout où il existe, le code reste l'identifiant de
repli). Calculé indépendamment par chaque format — `PaieBiReportBuilder.identifiantChantier` côté
PDF, `PaieExportService.titreZone` côté Excel — jamais partagé en code (voir « Pourquoi deux
pipelines ? »), mais avec la même règle. Côté PDF, ce texte est porté par
`ChantierBiVue.identifiant()`/`LigneRapportDetailBean.chantierIdentifiant` — à ne jamais confondre
avec `chantierCode`, réservé aux mécanismes internes (ancre de page, détection de la section
"reste" via `equipeNom.equals(chantierCode)"`), jamais affiché tel quel.

### Anti-duplication du détail employé

Un employé n'apparaît dans le tableau détaillé qu'**une seule fois**, dans sa section (une équipe
détaillée, ou le "reste" du chantier) — jamais répété ailleurs, un chantier ne montrant que des
agrégats BI en dehors de ce tableau. C'est la même logique que la hiérarchie Global → Chantier →
Section → Employé : chaque niveau au-dessus du dernier résume, seul le dernier détaille.

### Structure du rapport

1. **Page de garde** (`title` JRXML, `isTitleNewPage` — la seule page du document sans
   `pageHeader`/`pageFooter`, comportement JasperReports pour une bande title en isTitleNewPage,
   exploité ici plutôt que subi) : logo, titre du rapport, puis 3 clés-valeurs
   **Département** (`Ressources Humaines`) / **Mois** / **Année** (Mois avant Année — l'ordre de
   lecture naturel d'une période « Août 2026 »), empilées **verticalement**, puis un bloc
   **signatures** (Directeur Général à gauche, DRH à droite — rôle + nom du signataire en dur +
   filet à signer, jamais le filet pré-rempli). **Pas de date de génération** (retirée le
   2026-09-29, demande explicite de direction — voir `docs/report/rapport-v2.md`).
2. **Bandeau** (`pageHeader` JRXML, un seul défini dans `rapport.jrxml`) : répété à l'identique sur
   **toutes** les pages de contenu qui suivent. Réduit au minimum (2026-09-29, demande explicite de
   direction — hauteur 30 contre 62 avant, logo réduit) : **3 blocs sur une seule ligne chacun**
   (plus de libellé séparé au-dessus de la valeur), séparés par de fins filets verticaux —
   Ressources Humaines / Mois-Année / **Niveau**. Le bloc **Niveau** est dynamique — `GLOBAL` tant
   que la page précède le premier
   chantier (`$P{P_PAGE_PREMIER_CHANTIER}`, connu grâce à un premier remplissage silencieux de
   découverte, voir « Numérotation des chapitres et des pages »), `CHANTIER : <identifiant> ·
   ÉQUIPE : <nom>` pour une section équipe détaillée (voir « Identifiant chantier (nom + code) »
   pour la forme de `<identifiant>`), ou **`CHANTIER : <identifiant>` seul** (sans « · ÉQUIPE »)
   pour la section "reste" (afficher `equipeNom` tel quel y aurait donné un doublon trompeur,
   `equipeNom` valant alors le code chantier). Le **`pageFooter`** porte la même information (texte
   discret, aligné à gauche à côté de la pagination).
3. **I — Vue d'ensemble** (`<group name="GroupSynthese">`, expression constante — son en-tête ne
   s'imprime qu'une seule fois, au tout début du corps du document) : 5 cartes KPI compactées, label
   + valeur uniquement, sans note de comparaison sous la valeur (retirée le 2026-09-29, demande
   explicite de direction — masse réelle, effectif, masse moyenne/employé, nombre de chantiers,
   STC/sorties), une phrase courte de synthèse (voir « Narratif léger »), puis, SUR LA MÊME PAGE
   (`GroupGraphChantier`, sans titre au-dessus depuis le 2026-09-29) : UN SEUL `<barChart>` à 4
   séries (masse/effectif/STC en personnes/STC en DH), plafonné aux 15 plus gros chantiers +
   "Autres" — voir « Visualisations ».

   Chapitre « Répartition par fonction » retiré temporairement (voir « Points d'extension »).
4. **Une section par CHANTIER**, TOUS désormais (demande explicite de direction, 2026-09-29 : plus
   de distinction "détaillé"/"compact" par effectif) — chacun son propre chapitre romain à la suite
   du seul chapitre fixe (II, III, ... — voir `PaieReportPdfService.chapitreChantier`) — voir « Vue
   détaillée d'un chantier » pour le détail.

Toutes ces sections partagent la même source de données à plat (`LigneRapportDetailBean`, un employé
par ligne).

### Vue détaillée d'un chantier

Un chantier occupe **1 seule page continue** avant son détail employé
(`GroupChantierEvolution` puis, optionnellement, `GroupChantier` — `rapport.jrxml`, toutes deux
déclenchées par le même code chantier). Cette page suit la même hiérarchie de lecture qu'à chaque
niveau du rapport : **KPI → graphe (optionnel) → tableau(x)**.

**`GroupChantierEvolution`** — `isStartNewPage="true"`, c'est lui qui démarre la nouvelle page du
chapitre, TOUJOURS affiché :

1. **4 cartes KPI** (même style que la Vue d'ensemble, label + valeur uniquement) : Masse salariale
   (avec comparaison mois précédent sur la même ligne que la valeur), Effectif, Coût moyen / employé,
   STC / sorties.
2. La **phrase courte de synthèse** du chantier (voir « Narratif léger »).

**`GroupChantier`, "Répartition par équipe"** (renommé depuis "Équipes de chantier X" le 2026-09-29,
demande explicite de direction — le chantier est déjà identifié par le titre de chapitre et le
bandeau récurrent) — enchaîne directement, SANS saut de page, sur la même
page que `GroupChantierEvolution`, **uniquement si au moins une équipe de ce chantier a été
sélectionnée** pour un détail séparé (`ChantierBiVue.avecDetailEquipe`) : la bande entière porte un
`printWhenExpression`, absente (hauteur nulle, aucun espace réservé) sinon. Quand elle s'imprime :
UN SEUL `<barChart>` horizontal à barres groupées (masse/effectif/STC en personnes/STC en DH,
`PaieReportGroupedChartCustomizer`, `ChantierBiVue.repartitionEquipe` — TOUJOURS la distribution
complète de toutes les équipes réelles du chantier, même si seule une partie a sa propre section
ci-dessous) — **SEUL, sans tableau**.

Puis, sur une page dédiée chacune (`GroupEquipe`, `isStartNewPage="true"` depuis le 2026-09-29,
`isReprintHeaderOnEachPage="false"` et `keepTogether="false"` depuis le même jour — voir plus bas) :
une section par équipe **sélectionnée**, puis, si des employés restent (équipes non sélectionnées,
"Sans équipe" compris), une dernière section "reste" les regroupant tous — jamais un employé dans
deux sections. Si aucune équipe n'a été sélectionnée pour ce chantier, une seule section réunit tous
ses employés. Chaque section (12 colonnes, tout en noir — voir « Style visuel »), triée par ordre
**alphabétique** de fonction (demande explicite de direction, 2026-09-29 — plus par masse
décroissante, voir `PaieBiReportBuilder.equipeVue`, même tri que le tableau récap
Fonction/Effectif/STC ci-dessous), se termine par les lignes de résumé, le tableau récap et, le cas
échéant, le squelette matériel (voir « Lignes de résumé et tableau récap »). Le tableau employé
reprend les colonnes de la liste Paie à l'écran, moins Chantier (déjà porté par le titre de section) :
Nom & prénom, Fonction, CIN, Nbre jrs (P/J.R.O/J.R.D), Salaire (Salaire/RO/RD), Total, Obs, **Équipe**
(ajoutée le 2026-09-29 — vide dans une section équipe déjà nommée par son titre, ou quand l'employé
n'a aucune équipe renseignée (jamais "Sans équipe" — demande explicite de direction, 2026-09-29),
renseignée uniquement dans la section "reste" où les employés viennent potentiellement de plusieurs
équipes non sélectionnées mélangées, voir `LigneEmployeVue.equipeReelle`). Cette colonne, comme tous
les autres endroits du rapport où une équipe est nommée (titre de section, bandeau
CHANTIER/ÉQUIPE, graphique "Répartition par équipe"), affiche le **nom complet** de l'équipe
("CHAUFFEURS"), jamais son code brut ("CH") — voir « Nom complet des équipes » ci-dessous. Colonne
Fonction élargie (90→100, prise sur Nom & prénom 130→120) et police réduite (8pt) : un libellé
fonction long ("CH. CAMION PORT CHAR") se retrouvait tronqué de façon indiscernable d'un autre
("CH. CAMION GASOIL", tous deux affichés "CH. CAMION...") — constaté par l'utilisateur sur données
réelles.

**`isReprintHeaderOnEachPage="false"`** (depuis le 2026-09-29, demande explicite de direction) :
avec `true`, une équipe assez nombreuse pour que son tableau déborde sur plusieurs pages (ex. 74
employés) pouvait voir son `groupFooter` (résumé + récap) atterrir seul sur une page où
JasperReports réimprimait le bandeau équipe + les en-têtes de colonnes juste au-dessus — une page
qui ressemblait à un tableau vide suivi de ses totaux (constaté par l'utilisateur sur données
réelles). Avec `false`, cette page ne montre plus que les totaux/récaps ; en contrepartie, les
pages de continuation d'un tableau qui déborde n'ont plus l'en-tête de colonnes répété.

**`keepTogether="false"`** (depuis le 2026-09-29, remplace `true` — constaté par l'utilisateur sur
données réelles) : avec `true`, JasperReports essayait de garder TOUT le groupe (en-tête + lignes +
`groupFooter`) ensemble sur une page à chaque fois que possible, ce qui, combiné à
`isStartNewPage="true"`, causait des pages totalement blanches et reléguait systématiquement le
`groupFooter` (220px) à la page suivante dès que l'espace restant sous le dernier employé était
inférieur à sa hauteur déclarée — même quand cet espace restait largement suffisant pour les 2 lignes
TOTAL GENERAL. Sans utilité de toute façon : `isStartNewPage="true"` garantit déjà que l'en-tête de
section ne démarre jamais en bas d'une page précédente (seul le vrai rôle de `keepTogether`).

**Le bloc TOTAL GENERAL ne doit JAMAIS apparaître seul en haut d'une page sans employé au-dessus**
(demande explicite de direction, 2026-09-29) : `keepTogether="false"` seul ne suffit pas à le
garantir (un `groupFooter` peut encore être intégralement repoussé si AUCUNE place ne reste du tout).

Un premier essai — un groupe JRXML imbriqué (`GroupQueueEquipe`) gardant les 4 dernières lignes
employé ensemble via `keepTogether="true"` — s'est révélé insuffisant, **constaté sur données
réelles** : (1) 4 lignes (64px) ne suffisent pas à garantir que le `groupFooter` (jusqu'à 220px)
tienne derrière elles — le vrai besoin va jusqu'à 17 lignes selon où la section se termine sur la
page ; (2) JasperReports décide qu'une bande "tient" sur la page courante en comparant sa **hauteur
déclarée** à l'espace restant, jamais sa hauteur réellement nécessaire — un `groupFooter` peut donc
être intégralement repoussé même quand il resterait largement la place pour son contenu réel (peu de
fonctions/matériel ce mois-ci) ; (3) l'ajout de ce groupe semble avoir provoqué, à certaines
frontières de section, des pages totalement blanches.

**Solution retenue : un calcul arithmétique exact, pas une astuce de groupe JRXML.**
`PaieReportPdfService.calculerSautPage` prédit, par le calcul, EXACTEMENT où JasperReports ferait
déborder chaque page (hauteur de page, marges, bandeaux et hauteur de ligne sont toutes des
constantes fixes du gabarit — aucun texte à hauteur variable dans le tableau employé) : il simule le
remplissage naturel des pages d'une section (1re page : hauteur de `GroupEquipe.groupHeader` + lignes
; pages suivantes : lignes seules, l'en-tête n'étant jamais réimprimé) et, si la DERNIÈRE page ainsi
prédite ne laisserait pas la place au `groupFooter`, calcule l'index exact de la ligne à partir de
laquelle il faut basculer sur une page supplémentaire. Ce champ (`$F{sautPageAvant}`) pilote un
`<break type="Page">` natif de JasperReports, placé en tête de la bande `<detail>`, avec
`printWhenExpression="$F{sautPageAvant}"` — un mécanisme déclaratif standard, jamais un groupe
supplémentaire. Toutes les pages AUTRES que celle ajustée continuent de déborder normalement (flux
JasperReports natif, inchangé) : seul le point d'ajustement est calculé, jamais l'intégralité de la
pagination. Vérifié par un test dédié
(`PaieReportPdfServiceTest.calculerSautPage_neDevraitJamaisLaisserLaPageFinaleDeborderSaCapaciteAvecFooter`,
qui rejoue le découpage en pages pour des tailles de section de 1 à 400 employés).

### Lignes de résumé et tableau récap (2026-09-29)

Collés directement au bas de CHAQUE tableau employé (`GroupEquipe`, `groupFooter` de
`rapport.jrxml`), quelle que soit la section (équipe détaillée ou "reste") :

1. **Lignes de résumé** : `TOTAL GENERAL` (somme de la colonne Total de cette section, déjà
   disponible via `EquipeBiVue.masse`) et `TOTAL GENERAL MOIS PRECEDENT` (même somme sur la
   période précédente pour la même section — `EquipeBiVue.montantMoisPrecedentOuIntrouvable`,
   `INTROUVABLE` si aucune donnée, même règle que « Null-handling »).
2. **Tableau récap Fonction/Effectif/STC** : effectif et nombre de STC/sorties de CETTE section,
   groupés par fonction (`EquipeBiVue.repartitionFonction`, réutilise `RepartitionBean` sans ses
   champs montant) — jamais un graphique (redondant avec celui du chantier), imprimé via un
   sous-rapport (`recap-fonction.jrxml`) car le nombre de fonctions distinctes varie d'une section
   à l'autre — seul mécanisme JasperReports permettant à la bande parente de s'étirer pour un
   nombre de lignes inconnu à la compilation.
3. **Squelette parc matériel**, uniquement pour le chantier C168 équipes CH/OP (voir « Squelette
   parc matériel ») — même mécanisme de sous-rapport (`recap-materiel.jrxml`), invoqué avec une
   liste vide (donc invisible) pour toute autre section.

### Visualisations

**Convention du document : barres groupées horizontales à 4 séries (masse/effectif/STC en
personnes/STC en DH), aucun graphique empilé — et depuis le 2026-09-28, la SEULE famille de
graphique du rapport (voir « Évolution mensuelle » ci-dessous).** **Un seul customizer,
`PaieReportGroupedChartCustomizer`, réutilisé partout** : répartition par chantier (chapitre I) et
répartition par équipe de chaque chantier concerné — la donnée sous-jacente (`RepartitionBean`) est
la même forme à chaque niveau. Marges resserrées et hauteur de graphique augmentée le 2026-09-29
(demande explicite de direction, après constat sur données réelles que les étiquettes de valeur de
barres adjacentes se chevauchaient au plafond de 16 catégories × 4 séries) — voir le Javadoc de
`PaieReportGroupedChartCustomizer` pour le détail des marges (`categoryMargin`/`itemMargin`).

- **Barres HORIZONTALES groupées** (catégories en Y — chantier ou équipe selon le niveau ; valeurs
  en X). 4 séries par catégorie : Masse (DH, bleu), Effectif (personnes, orange), STC (personnes,
  rouge), STC (DH, marron) — chacune nommée avec son unité dans la légende.
- **Axe des valeurs masqué ET chaque série normalisée à sa propre valeur maximale** (0 à 1,
  indépendamment des 3 autres séries) : masse/STC en DH (milliers de DH) et effectif/STC en
  personnes (quelques unités) ont des ordres de grandeur si différents qu'un axe masqué seul ne
  suffit pas — les 4 séries restent dessinées sur la même échelle linéaire sous-jacente, ce qui
  rendait les barres personnes visuellement nulles à côté des barres DH (constaté en production).
  L'étiquette affichée sur chaque barre reste la **vraie** valeur, lue dans une table conservée
  avant normalisation — jamais la valeur normalisée réellement tracée. Une valeur exactement nulle
  n'a pas d'étiquette (la barre est de toute façon invisible) — son absence dit déjà "zéro" sans
  ambiguïté.
- **Chaque barre au maximum de sa série est mise à l'échelle à 82 % du tracé** (`ECHELLE_MAX`,
  `PaieReportGroupedChartCustomizer`), jamais 100 % : sans cette marge, l'étiquette d'une barre au
  maximum se retrouve à la toute limite du canevas et se fait tronquer par son bord — constaté en
  production avec de gros montants dont les derniers caractères disparaissaient, quel que soit
  l'inset du plot par ailleurs.
- **`<chartLegend position="Bottom">`** obligatoire (4 séries à distinguer). Palette fixe : Masse
  `#2563EB`, Effectif `#F59E0B`, STC personnes `#B91C1C`, STC DH `#7F1D1D` (les 2 nuances de STC
  restent dans la même famille de rouges, sous ses 2 représentations) — seule exception à la règle
  noir/blanc/gris du document (voir « Style visuel »).
- **Plafonné aux 15 plus grosses valeurs** (`PaieBiReportBuilder.MAX_BARRES_GRAPHIQUE`) au niveau
  global (chapitre I) — le reste regroupé sous « Autres », masse/effectif/STC cumulés, toujours
  retrié à sa vraie place. Pas de plafond au niveau « répartition par équipe » d'un chantier : le
  nombre d'équipes distinctes au sein d'un même chantier reste naturellement modeste.
- Étiquette de valeur à l'extérieur de chaque barre (`ItemLabelAnchor.OUTSIDE3`/
  `TextAnchor.CENTER_LEFT`), jamais à l'intérieur — une barre courte (petite valeur normalisée)
  étant parfois trop étroite pour contenir son étiquette.

> **Historique** : ce graphique a connu plusieurs conventions antérieures, toutes abandonnées sur
> demande explicite de direction — barres verticales à série unique, puis colonnes verticales
> empilées (`<stackedBarChart>`) par équipe. **Plus aucun graphique empilé n'existe dans ce
> document.** Un vrai double axe X numérique (2 échelles simultanées) a également été envisagé puis
> écarté : JFreeChart ne gère pas nativement des barres groupées réparties sur 2 axes indépendants,
> ce qui aurait demandé un renderer sur mesure — risque jugé disproportionné face à la normalisation
> par série, une alternative explicitement admise par la direction.

### Évolution mensuelle — retirée (2026-09-28)

Le rapport a porté, à une itération précédente, un `<lineChart>` d'évolution mensuelle (masse,
effectif) aux niveaux Global et Chantier, avec une fenêtre glissante d'au plus 12 mois (jamais
avant le premier mois où une paie existe réellement en base, `PaieRepository.premierePeriode()`) et
un système de normalisation par série (même principe que `PaieReportGroupedChartCustomizer`
ci-dessus) pour contourner les limites d'un vrai double axe Y à échelle réelle. **Ce graphique a été
retiré entièrement** (manque d'historique suffisant pour qu'une tendance mensuelle soit
significative) — voir `docs/report/rapport-v2.md` pour le détail complet de cette décision, de
celle qui l'a précédée (retrait du STC de ce même graphique), et de ce qui reste calculé côté Java
sans être affiché (prêt à être réactivé sans recalcul si le besoin se confirme un jour). Le rapport
ne porte donc plus aucun `<lineChart>`.

### Style visuel

Rendu recherché : un rapport BI de direction imprimé, sobre — jamais un export de données habillé.

- **Noir / blanc / gris partout dans le document, aucune exception, aucun fond de couleur.** Le
  document a connu une itération intermédiaire où certains titres (bandeau équipe, sous-titres de
  graphique) étaient en bleu marine `#011F5B` — **entièrement abandonnée sur demande explicite de
  direction** ("tout en noir") : plus aucune trace de cette couleur nulle part dans le gabarit,
  `#000000` est désormais le seul texte utilisé pour tout contenu (titres de chapitre, sous-titres,
  bandeaux, tableaux). **Toutes les tables du document sont 100 % blanches** (aucun fond, aucune
  alternance de lignes), chaque cellule délimitée par un filet noir `#000000` — sur **toutes** les
  cellules du tableau employé, pas seulement l'en-tête (demande explicite de direction). Palette
  restante, hors texte courant et tableaux : `#595959` (libellés/captions secondaires), `#CCCCCC`
  (filets décoratifs hors tableau, contour des cartes KPI), `#808080`/`#999999` (séparateurs de
  blocs d'en-tête). **Seuls les `<barChart>` restent en couleur** (plus aucun `<lineChart>` dans le
  document, voir « Évolution mensuelle ») — la seule exception délibérée à la règle noir/blanc (voir
  « Visualisations » pour la palette exacte). Les indicateurs de tendance HAUSSE/BAISSE/STABLE sont
  du texte noir gras
  préfixé du mot (« Hausse : … », « Baisse : … », « Stable : … ») — la couleur ne porte pas
  l'information, le texte si.
- **Police Liberation Serif** dans tout le document (gabarit JRXML et les customizers de graphique,
  propriété `net.sf.jasperreports.default.font.name`) — substitut de « Times New Roman » demandé par
  la direction : la police Microsoft n'est pas installée sur l'environnement de rendu PDF, et
  Liberation Serif en est métriquement compatible. **La police est embarquée dans l'application,
  jamais supposée installée au niveau du système d'exploitation qui exécute le backend** — un premier
  déploiement s'appuyait sur la police *de l'environnement de développement*, ce qui a levé
  `JRFontNotFoundException` au premier remplissage en production. Deux mécanismes, nécessaires
  ensemble :
  1. `resources/report/paie/fonts/LiberationSerif-{Regular,Bold,Italic,BoldItalic}.ttf` (licence SIL
     Open Font License) + `resources/report/paie/fonts/liberation-serif-fonts.xml` (déclaration de
     famille JasperReports, encodage PDF `Identity-H`) + `resources/jasperreports_extension.properties`
     — couvre tous les éléments texte des gabarits JRXML.
  2. Un bloc statique de `PaieReportPdfService` charge les 4 mêmes `.ttf` et les enregistre auprès de
     `GraphicsEnvironment` (`Font.createFont` + `registerFont`) — nécessaire car
     `PaieReportGroupedChartCustomizer` construit des `java.awt.Font` directement pour JFreeChart (pas
     via JasperReports), un chemin que l'extension de police JRXML ne couvre pas.
- **Hiérarchie typographique**, taille de référence 16pt (Liberation Serif) :
  - **Titres de chapitre** (I — Vue d'ensemble, puis un par chantier) : 16pt gras, texte noir sans
    fond, souligné d'un filet fin.
  - **Sous-titres** (bandeau équipe, titre de chaque graphique) : 12-13pt gras, texte noir.
  - **Indicateurs KPI** : 13-18pt gras pour la valeur, 7.5-9pt gras pour son libellé.
  - **Tableau détaillé employé** (11 colonnes) : 10.5pt.
  - **Captions/notes** (libellés de blocs d'en-tête, pied de page) : 6.5-10pt.
  - **⚠️ Piège JasperReports constaté en production** : une hauteur de `reportElement` trop proche
    de la taille de police (ex. `height="13"` pour `size="12"`) fait que le texte **ne s'affiche pas
    du tout, sans aucune exception ni avertissement** — ni dans les logs, ni dans le PDF, juste un
    vide silencieux. Une marge d'au moins ~6pt entre la hauteur et la taille de police
    (`height="18"` pour `size="12"`, `"22"` pour `size="16"`) évite le problème.
- **Aucun sommaire imprimé** : un rapport généré à la demande n'a pas besoin d'une table des
  matières. Le double remplissage (voir « Numérotation des chapitres et des pages ») subsiste,
  mais uniquement pour connaître la page de départ du premier chantier (bloc "Niveau" du bandeau).

### Numérotation des chapitres et des pages

**Chapitres** : `PaieReportPdfService.chapitreChantier(index, chantier)` numérote en chiffre romain
CHAQUE chantier de `vue.chantiers()` (déjà triée par masse décroissante), `index` étant sa position
dans cette liste — plus de partition "détaillé d'abord, compact ensuite" (voir
`docs/report/rapport-v2.md`).

**Pages** : le numéro de page réel n'est connu qu'après la mise en page complète du document, alors
que le bandeau récurrent a besoin de savoir, dès la première page, à partir de quelle page basculer
de "GLOBAL" à "CHANTIER" (voir « Structure du rapport »). `PaieReportPdfService.generer` résout ça
par un **double remplissage** du même gabarit (jamais un second gabarit) :

1. **Passage de découverte** (silencieux, jamais exporté) : rempli avec un seuil provisoire
   (`Integer.MAX_VALUE`, tout est "GLOBAL"). Le premier chantier porte une ancre JRXML
   (`anchorNameExpression="chantier-" + code`, sur `GroupChantierEvolution`, TOUJOURS affichée
   pour tout chantier). Le `JasperPrint` obtenu est relu page par page (`pagesParAncre`) pour
   retrouver la première page où cette ancre apparaît.
2. **Passage final** : le même gabarit est rempli une seconde fois avec ce seuil réel injecté — la
   mise en page du reste du document ne dépendant en rien de ce seuil, le résultat est exact.

Coût : la génération prend environ deux fois plus de temps (deux mises en page complètes) — accepté
pour un rapport de direction généré à la demande, pas en masse.

### Composants et services principaux

| Fichier | Rôle |
|---|---|
| `PaiePerimetreService` | Périmètre Excel (sélection manuelle de sous-feuilles équipe) |
| `PaieExportService` / `PaieSheetWriter` / `PaieExcelStyles` | Génération du classeur Excel |
| `MaterielChantierCatalogue` | Règle métier partagée PDF/Excel : squelette parc matériel du chantier C168 |
| `PaieBiReportBuilder` | Périmètre + agrégations BI du rapport PDF, calcul de `avecDetailEquipe` par chantier à partir de la sélection manuelle — testé isolément (`PaieBiReportBuilderTest`) sans dépendre du repository via `construireDepuis` |
| `PaieReportPdfService` | Orchestration JRXML → PDF (compilation du gabarit principal + 2 sous-rapports, aplatissement des données, **double remplissage** — voir « Numérotation des chapitres et des pages », export) — testée de bout en bout par `PaieReportPdfServiceTest` |
| `PaieReportGroupedChartCustomizer` | Personnalisation Java de TOUS les `<barChart>` du document (SEULE famille de graphique restante — masse/effectif/STC personnes/STC DH, 4 séries normalisées chacune à son propre maximum, étiquette = vraie valeur, plafond des 15 plus grosses valeurs + "Autres" — voir « Visualisations ») |
| `PaieExportDialogComponent` (frontend) | Dialog d'export UNIQUE, PDF ou Excel, une seule sélection manuelle d'équipes pour les deux formats |
| `PaieService.exporter()` / `.telechargerRapportPdf()` / `.listerEquipes()` (frontend) | Appels HTTP, aucune logique métier côté client |

Le logo Staport (`resources/report/paie/logo-staport.png`, chargé en classpath par
`PaieReportPdfService` et transmis au gabarit JRXML en paramètre **`byte[]`**, pas `InputStream`)
apparaît sur la page de garde et à gauche de chaque bandeau d'en-tête récurrent. `byte[]` est
réévaluable à volonté par le moteur de rendu, contrairement à un `InputStream` : ce dernier ne se lit
qu'une fois, et le logo est référencé par plusieurs `<image>` distincts dans le même gabarit (page de
garde + `pageHeader` répété) — avec un `InputStream` partagé, seule la première image affichée
consommait le flux, les suivantes restaient blanches (bug corrigé, voir l'historique Git).

---

## Points d'extension

> Voir aussi [docs/report/rapport-v2.md](docs/report/rapport-v2.md) — journal détaillé de tout ce qui
> a été retiré ou restructuré dans le rapport, avec pour chacun ce qui reste réutilisable sans
> redévelopper.

- **Réintroduire la répartition par fonction au niveau global** : retirée (le référentiel Fonction
  contient des doublons non nettoyés, voir TODO.md pour la tâche de nettoyage côté données).
  `SyntheseGlobaleVue.repartitionFonction`/`P_REPARTITION_FONCTION` restent calculés côté Java pour
  ne pas tout redévelopper à la réintroduction.
- **Réintroduire l'évolution mensuelle** : retirée entièrement (manque d'historique, voir
  `docs/report/rapport-v2.md`) mais toujours calculée côté Java
  (`PaieBiReportBuilder.evolutionParNiveau`) — à reconsidérer une fois plusieurs mois/années de
  données accumulées, si le besoin se confirme réellement.
- **Généraliser le squelette parc matériel** : aujourd'hui figé au chantier C168 (équipes CH/OP),
  sans persistance ni UI de saisie (voir « Squelette parc matériel ») — si le besoin s'étend à
  d'autres chantiers/équipes, la règle métier centralisée dans `MaterielChantierCatalogue` est le
  seul point à faire évoluer (aucune duplication à corriger des deux côtés).
- **Comparaison mois précédent au niveau équipe/section** : déjà en place (`TOTAL GENERAL MOIS
  PRECEDENT` de chaque section, voir « Lignes de résumé et tableau récap »).
- **Autres filtres du dialog (nom, CIN, fonction, chantier unique)** : volontairement non exposés
  par `PaieExportDialogComponent` (voir « Périmètre et filtres ») — un rapport de direction porte
  sur l'ensemble des chantiers/employés de la période, pas sur une recherche ponctuelle.
  `PaieReportPdfRequestDto` les garde optionnels pour un appel API direct ; à réexposer côté UI
  seulement si un besoin réel de rapport filtré se confirme.
- **Nouveaux indicateurs BI** : ajouter une mesure suit toujours le même chemin —
  `PaieBiReportBuilder` (calcul), un nouveau record de vue-modèle (paramètre scalaire) ou une classe
  à getters (ligne de table/graphique liée par réflexion) si la forme ne rentre dans aucun existant,
  les éléments correspondants dans le gabarit JRXML concerné, une entrée dans le catalogue de KPI
  ci-dessus. Avant d'ajouter un KPI, vérifier qu'il répond à une question non déjà couverte pour
  éviter la duplication.
