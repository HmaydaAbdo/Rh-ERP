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
│                                 équipes → employés en une seule liste dénormalisée
│                                 (LigneRapportDetailBean), remplit le gabarit JRXML unique
│                                 (rapport.jrxml) en DEUX passages (voir « Numérotation des chapitres
│                                 et des pages ») et exporte en PDF (JRPdfExporter) — un seul
│                                 JasperPrint réellement exporté. Aucun sommaire imprimé (retiré, voir
│                                 plus bas) : le double remplissage sert uniquement à connaître la page
│                                 de départ du premier chantier, pour le bandeau récurrent.
├── PaieBiReportBuilder.java      Périmètre + agrégations BI (fait/dimensions/mesures — voir plus bas).
│                                 Classe chaque chantier "détaillé" ou "compact" (effectif ≤
│                                 SEUIL_CHANTIER_COMPACT, actuellement 3 — voir « Chantiers à effectif
│                                 réduit ») et réordonne la liste en conséquence (détaillés d'abord,
│                                 masse décroissante dans chaque groupe) : c'est cet ordre, lu tel quel
│                                 par le gabarit JRXML, qui détermine entièrement la numérotation des
│                                 chapitres. N'utilise PAS PaiePerimetreService : besoin différent
│                                 (agrégation systématique de tout le périmètre filtré, jamais une
│                                 sélection manuelle de sous-feuilles) — voir « Pourquoi deux
│                                 périmètres ? ».
├── PaieReportGroupedChartCustomizer.java Personnalise TOUS les <barChart> à barres groupées
│                                 horizontales du document (masse/effectif/STC en personnes/STC en DH —
│                                 4 séries, chacune nommée avec son unité dans la légende) : "Vue par
│                                 chantier" (chapitre I), répartition par équipe de chaque chantier
│                                 détaillé, et répartition consolidée du chapitre final
│                                 "Chantiers à effectif réduit" — une seule classe réutilisée partout, la
│                                 donnée sous-jacente (RepartitionBean) étant la même forme à chaque
│                                 niveau. Axe des valeurs masqué — **chaque série est normalisée à sa
│                                 propre valeur maximale** (0 à 1, indépendamment des 3 autres) avant
│                                 d'être tracée : masquer l'axe ne suffit pas à lui seul à rendre lisibles
│                                 4 séries d'ordres de grandeur très différents sur une échelle linéaire
│                                 partagée. La vraie valeur (jamais la valeur normalisée) reste affichée
│                                 en étiquette sur chaque barre, lue dans une table à part conservée avant
│                                 normalisation. Plafonné aux 15 plus grosses valeurs + "Autres" (voir
│                                 PaieBiReportBuilder.MAX_BARRES_GRAPHIQUE). Voir « Visualisations ».
├── RapportBiVue / SyntheseGlobaleVue / ChantierBiVue / EquipeBiVue / KpiMontantVue / KpiEffectifVue /
│   LigneEmployeVue                Vue-modèle (records), aucune logique métier — utilisée uniquement
│                                 côté Java (paramètres JRXML), jamais liée par réflexion.
│                                 ChantierBiVue porte `compact` (effectif ≤ SEUIL_CHANTIER_COMPACT) et
│                                 `masseFormatee` (montant brut sans comparaison, réutilisé comme
│                                 en-tête du bloc tableau d'un chantier compact — voir « Chantiers à
│                                 effectif réduit »). RapportBiVue porte `repartitionChantiersCompacts`
│                                 (répartition consolidée des SEULS chantiers compacts — un unique
│                                 graphique pour tous, jamais un graphique par chantier compact).
├── RepartitionBean / LigneRapportDetailBean
│                                 Classes à getters (pas des records) : lignes de table/graphique
│                                 liées par introspection JavaBean (JRBeanCollectionDataSource) — un
│                                 getter public sur une classe non publique n'est pas accessible par
│                                 réflexion depuis un autre package, ces classes sont publiques.
│                                 LigneRapportDetailBean est la source de données unique et à plat de
│                                 rapport.jrxml : un employé par ligne, dénormalisée avec le contexte
│                                 chantier + équipe. Porte en plus `chantierCompact`/
│                                 `chantierEvolutionCle`/`chantierEquipesCle`/
│                                 `chantierChapitreTitreCompacts`, qui pilotent le déclenchement des
│                                 groupes JRXML "lourds" pour ne jamais donner sa propre page à un
│                                 chantier compact (voir « Chantiers à effectif réduit »). RepartitionBean
│                                 (libellé, effectif, montant, stc, stcMontant) alimente TOUS les
│                                 barChart du document — même forme réutilisée partout.
├── PaieReportNumberFormat.java   Formatage des nombres, variations, tendances (HAUSSE/BAISSE/STABLE)
│                                 et chiffres romains (numérotation des chapitres)
└── PaieReportPdfRequestDto.java  Corps de la requête — mêmes filtres que PaieSearchCriteria (page Paie)

resources/report/paie/jasper/  ← gabarit JRXML — style noir/blanc/gris, police Liberation Serif,
                                  seul les graphiques restent en couleur — voir « Style visuel »
└── rapport.jrxml                 Gabarit UNIQUE pour tout le document (aucun sous-rapport — le
                                   sous-rapport de sommaire et le sous-rapport de table de répartition
                                   partagée ont tous deux été retirés, voir plus bas) : page de garde
                                   (bande title, isTitleNewPage — seule page sans pageHeader/
                                   pageFooter), puis « I — Vue d'ensemble » (GroupSynthese, expression
                                   constante — imprimé une seule fois, en tout début de document : KPI
                                   + narratif, puis « Vue par chantier » sur sa propre page — plus de
                                   graphique d'évolution ni de sous-numérotation arabe depuis son
                                   retrait, voir docs/report/rapport-v2.md), puis une section par
                                   chantier DÉTAILLÉ
                                   (GroupChantierEvolution + GroupChantier, isStartNewPage, un chapitre
                                   romain chacun), puis UN SEUL chapitre final consolidant tous les
                                   chantiers "compacts" (réutilise GroupChantier/GroupEquipe avec des
                                   clés de déclenchement gelées — voir « Chantiers à effectif réduit »).
                                   Le pageHeader/pageFooter (5 blocs / repère de hiérarchie, une seule
                                   bande définie une fois chacun) se répètent nativement sur toutes ces
                                   pages. Voir « Structure du rapport ».
```

Frontend (`frontend/src/app/portail/paie/`) :

```text
export-excel/
└── PaieExportExcelDialogComponent   Dialog dédié à l'export Excel (bouton "Exporter Excel")

list/
└── PaieListComponent                Porte les deux boutons. « Exporter PDF » télécharge directement
                                      (aucun dialog) en utilisant uniquement la période sélectionnée
                                      dans le filtre de la liste (year/month picker) — voir
                                      « Périmètre et filtres » ci-dessous.
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
masse/l'effectif (chantier, équipe) ? et pour chaque chantier, que se passe-t-il en détail ?

### Périmètre et filtres

Aucun dialog pour le rapport PDF : le bouton « Exporter PDF » télécharge directement, en utilisant
**uniquement** la période sélectionnée dans le filtre de la liste (year/month picker de
`PaieListComponent.filterForm`) — désactivé tant qu'aucune période n'est choisie. Les autres filtres
de la liste (nom & prénom, CIN, fonction, chantier) **ne s'appliquent pas** au rapport PDF : le
rapport porte toujours sur l'ensemble des chantiers/employés de la période. Le backend
(`PaieReportPdfRequestDto`) garde ces champs optionnels (même forme que `PaieSearchCriteria`, sans
pagination) pour un appel API direct, mais le frontend n'envoie jamais que `periode`.

### Modèle analytique

| | |
|---|---|
| **Fait** | `Paie` — grain = 1 employé × 1 période (contrainte d'unicité `employee_id + periode` : `COUNT(*)` est toujours un effectif exact, jamais de double comptage). |
| **Dimensions** | Chantier (obligatoire sur `Paie`), Fonction (obligatoire — sert uniquement à trier le tableau employé, voir « Anti-duplication »), Équipe (optionnelle → `Sans équipe`), Employé, Période (mois analysé + mois précédent). |
| **Mesures de base** | Masse réelle de paie = `SUM(salaireTotal)` (**jamais** `salaireMensuel` — voir ci-dessous) ; Effectif = `COUNT(*)` ; STC / sortie = `COUNT` des lignes où `ObservationStc.estStcOuSortie`, calculé **par chantier** (indicateur, jamais une liste globale — voir « Catalogue de KPI »). |
| **Mesures calculées** | Part du total (%), variation absolue, variation %, masse moyenne par employé. |
| **Historique** | Chaque bulletin `Paie` est un instantané figé de chantier/fonction/équipe pour son mois — le rapport agrège donc les valeurs *stockées sur `Paie`*, jamais l'affectation actuelle de `Employee` (qui peut avoir changé depuis). La comparaison au mois précédent respecte le même principe. |

**Pourquoi `salaireTotal` et pas `salaireMensuel`** : `salaireMensuel` est une composante du
bulletin (le salaire de base) ; `salaireTotal` est le montant réellement versé (salaire + primes de
roulage) — c'est la seule mesure qui représente la masse de paie réelle de l'entreprise.

### Catalogue de KPI

| KPI | Formule | Grain | Comparaison mois précédent |
|---|---|---|---|
| Masse réelle de paie | `SUM(salaireTotal)` sur le périmètre filtré | Global / chantier | Oui — Δ absolu + Δ % (voir « Null-handling ») |
| Effectif | `COUNT(*)` | Global / chantier | Oui — Δ absolu (jamais ambigu, 0 est une valeur légitime) |
| Masse moyenne par employé | masse ÷ effectif | Global / chantier | Non (dérivé, comparer une moyenne de moyennes n'apporte rien) |
| Nombre de chantiers | `COUNT DISTINCT` | Global | Non — seul indicateur global conservé sur la déclinaison par chantier |
| Masse/Effectif/STC (personnes et DH) par chantier | `SUM(salaireTotal)`/`COUNT`/`COUNT(ObservationStc)`/`SUM(salaireTotal STC)` groupés par chantier | Global | Non — 1 seul graphique à 4 séries groupées ("Vue par chantier", chapitre I) — voir « Visualisations » |
| ~~Masse/Effectif par fonction~~ | `SUM(salaireTotal)`/`COUNT` groupés par fonction | Global | Retiré temporairement (doublons dans le référentiel Fonction, voir « Points d'extension », TODO.md et `docs/report/rapport-v2.md`) — toujours calculé (`PaieBiReportBuilder`/`SyntheseGlobaleVue.repartitionFonction`), simplement plus affiché |
| Répartition par équipe (avec Sans équipe) | `SUM(salaireTotal)`/`COUNT`/STC groupés par équipe | Chantier **détaillé** uniquement | Non — 1 graphique par chantier détaillé ("Équipes de chantier X") — voir « Visualisations » |
| Répartition consolidée des chantiers **compacts** | `SUM(salaireTotal)`/`COUNT`/STC groupés par chantier, restreints aux chantiers compacts | Global (chapitre final) | Non — 1 SEUL graphique pour tous les chantiers compacts confondus, jamais un graphique par chantier compact — voir « Chantiers à effectif réduit » |
| Coût moyen / employé (chantier) | masse chantier ÷ effectif chantier | Chantier détaillé | Non (dérivé, même principe que la moyenne globale) |
| STC / sortie | `COUNT` des lignes où `ObservationStc.estStcOuSortie` | Global / Chantier / Équipe (ou chantier compact) | Non — indicateur numérique à chaque niveau, **et** 3ᵉ/4ᵉ série de chaque `<barChart>` |
| ~~Évolution masse/effectif (fenêtre glissante ≤ 12 mois)~~ | `SUM(salaireTotal)`/`COUNT` groupés par chantier/`periode` (`PaieRepository.sommerParChantierEquipePeriode`) | Global / Chantier détaillé | Retiré entièrement du rapport (2026-09-28, manque d'historique suffisant — voir `docs/report/rapport-v2.md`) — toujours calculé (`PaieBiReportBuilder.evolutionParNiveau`), simplement plus affiché |

Pas de KPI dupliqué : chaque carte/graphique répond à une question différente (jamais deux façons de
montrer le même montant). La dimension Fonction n'a, pour l'instant, plus d'écran dédié dans le
rapport (chapitre retiré temporairement au niveau global, et la déclinaison intra-chantier/
intra-équipe qui existait à une itération précédente a depuis été retirée entièrement — jugée
redondante, voir « Points d'extension »). L'ancien tableau « Répartition par équipe » (une table à
côté du graphique équivalent) a également été retiré : il faisait double emploi avec le graphique et
n'apportait rien de plus — la seule répartition par équipe désormais visible est le `<barChart>`
lui-même (voir « Visualisations »).

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
libellé **`Sans équipe`**, à tous les niveaux où une distribution par équipe existe (globale au
sein d'un chantier détaillé) et jusqu'au détail employé (sa propre section « Sans équipe », au
même niveau qu'une section équipe nommée). Elle n'est **jamais exclue** des agrégations ni fusionnée
silencieusement dans une équipe existante. **Exception explicite** : pour un chantier **compact**
(voir « Chantiers à effectif réduit »), la distinction équipe — donc aussi `Sans équipe` en tant que
sous-section propre — disparaît volontairement : le tableau employé de ce chantier n'a qu'un seul
bloc, directement au niveau chantier (demande explicite de direction, un chantier à 1-3 personnes ne
justifie pas cette granularité supplémentaire).

### Anti-duplication du détail employé

Un employé n'apparaît dans le tableau détaillé qu'**une seule fois**, au niveau équipe (ou
« Sans équipe », ou directement au niveau chantier pour un chantier compact) — jamais répété
ailleurs, un chantier détaillé ne montrant que des agrégats BI en dehors de ce tableau. C'est la même
logique que la hiérarchie Global → Chantier → Équipe → Employé : chaque niveau au-dessus du dernier
résume, seul le dernier détaille.

### Structure du rapport

1. **Page de garde** (`title` JRXML, `isTitleNewPage` — la seule page du document sans
   `pageHeader`/`pageFooter`, comportement JasperReports pour une bande title en isTitleNewPage,
   exploité ici plutôt que subi : une couverture porte sa propre mise en avant du logo et de la
   période, elle n'a pas besoin du bandeau récurrent) : logo, titre du rapport, puis 3 clés-valeurs
   **Département** (`Ressources Humaines`) / **Mois** / **Année** (Mois avant Année — l'ordre de
   lecture naturel d'une période « Août 2026 »), empilées **verticalement**, puis un bloc
   **signatures** (Directeur Général à gauche, DRH à droite — rôle + nom du signataire en dur +
   filet à signer, jamais le filet pré-rempli), puis date de génération.
2. **Bandeau** (`pageHeader` JRXML, un seul défini dans `rapport.jrxml`) : répété à l'identique sur
   **toutes** les pages de contenu qui suivent — un seul `JasperPrint` réellement exporté, jamais de
   bande dupliquée dans un second gabarit. **5 blocs indépendants de même hauteur**, alignés
   horizontalement et séparés par de fins filets verticaux : Logo / Département / Mois / Année /
   **Niveau**. Le bloc **Niveau** est dynamique — `GLOBAL` tant que la page précède le premier
   chantier (`$P{P_PAGE_PREMIER_CHANTIER}`, connu grâce à un premier remplissage silencieux de
   découverte, voir « Numérotation des chapitres et des pages »), `CHANTIER : <code> · ÉQUIPE :
   <nom>` pour un chantier détaillé, ou **`CHANTIER : <code>` seul** (sans « · ÉQUIPE ») pour un
   chantier compact — afficher `equipeNom` tel quel y aurait donné un doublon trompeur
   (`CHANTIER : C085 · ÉQUIPE : C085`, voir « Chantiers à effectif réduit »). Le **`pageFooter`**
   porte la même information (texte discret, aligné à gauche à côté de la pagination).
3. **I — Vue d'ensemble** (`<group name="GroupSynthese">`, expression constante — son en-tête ne
   s'imprime qu'une seule fois, au tout début du corps du document) : 5 cartes KPI compactées
   (masse réelle, effectif, masse moyenne/employé, nombre de chantiers, STC/sorties), une phrase
   courte de synthèse (voir « Narratif léger »), puis **"Vue par chantier"** (`GroupGraphChantier`,
   sur SA PROPRE PAGE) : UN SEUL `<barChart>` à 4 séries (masse/effectif/STC en personnes/STC en
   DH), plafonné aux 15 plus gros chantiers + "Autres" — voir « Visualisations ». Plus de
   graphique d'évolution mensuelle ni de sous-numérotation arabe ici — retirés le 2026-09-28, voir
   `docs/report/rapport-v2.md`.

   Chapitre « Répartition par fonction » retiré temporairement (voir « Points d'extension »).
4. **Une section par chantier DÉTAILLÉ** (effectif > `SEUIL_CHANTIER_COMPACT`), chacun son propre
   chapitre romain à la suite du seul chapitre fixe (II, III, ... — voir
   `PaieReportPdfService.chapitreChantier`) — voir « Vue détaillée d'un chantier détaillé » pour le
   détail.
5. **UN SEUL chapitre final** consolidant TOUS les chantiers **compacts** (effectif ≤
   `SEUIL_CHANTIER_COMPACT`) : « N — Chantiers à effectif réduit » — voir « Chantiers à effectif
   réduit » pour le détail complet et la justification de cette section.

Toutes ces sections partagent la même source de données à plat (`LigneRapportDetailBean`, un employé
par ligne) — zéro duplication de bande, zéro sous-rapport.

### Vue détaillée d'un chantier détaillé

Un chantier détaillé occupe **2 pages d'en-tête** avant son détail employé
(`GroupChantierEvolution`, `GroupChantier`, `rapport.jrxml` — toutes deux déclenchées par le même
code chantier, donc imprimées exactement une fois par chantier, immédiatement l'une après l'autre).
Cette découpe suit la même hiérarchie de lecture qu'à chaque niveau du rapport : **KPI → graphe →
tableau**.

**Page 1 — `GroupChantierEvolution`, "Vue d'ensemble du chantier X"** (le nom du groupe JRXML,
hérité d'avant le retrait du graphique d'évolution — voir `docs/report/rapport-v2.md` — n'a pas été
changé, cette page ne porte plus de graphique) :

1. **4 cartes KPI** (même style que la Vue d'ensemble) : Masse salariale (+ comparaison mois
   précédent), Effectif (+ comparaison), Coût moyen / employé, STC / sorties.
2. La **phrase courte de synthèse** du chantier (voir « Narratif léger »).

**Page 2 — `GroupChantier`, "Équipes de chantier X"** : UN SEUL `<barChart>` horizontal à
barres groupées (masse/effectif/STC en personnes/STC en DH, `PaieReportGroupedChartCustomizer`,
`ChantierBiVue.repartitionEquipe`) — **SEUL, sans tableau** (l'ancienne table de répartition par
équipe accompagnant ce graphique a été retirée, doublon pur). Puis, à sa suite, chaque équipe
individuelle (`GroupEquipe`, `keepTogether`) — **NON numérotée séparément** (demande explicite de
direction) — juste son tableau employé (11 colonnes, tout en noir — voir « Style visuel »), trié
par fonction (celle qui consomme le plus de masse en premier, voir `PaieBiReportBuilder.equipeVue`).

Une équipe ne démarre pas systématiquement sur sa propre page — elle garde son détail employé sur la
même page que son en-tête tant qu'elle y tient (`isStartNewPage="false"`) et n'est coupée entre deux
pages que si elle est, à elle seule, plus grande qu'une page : avec un chantier réel comportant de
nombreuses petites équipes, forcer une page par équipe produirait des pages quasi vides — c'est
exactement ce même principe qui, poussé plus loin, justifie « Chantiers à effectif réduit »
ci-dessous. Le tableau employé reprend les colonnes de la liste Paie à l'écran, moins Chantier et
Équipe (déjà portées par les titres de section) : Nom & prénom, Fonction, CIN, Nbre jrs (P/J.R.O/
J.R.D), Salaire (Salaire/RO/RD), Total, Obs.

> **Point ouvert** : la page 1 ci-dessus (KPI + narratif seuls, depuis le retrait du graphique
> d'évolution) est nettement plus courte que la page 2 qui suit (pleine hauteur, pour le graphique)
> — elle se termine donc avec une zone blanche importante. Volontairement non traité pour l'instant
> (fusionner les 2 pages est un choix de mise en page distinct, avec son propre risque de rendu à
> vérifier) — voir `docs/report/rapport-v2.md` et `TODO.md`. Même remarque pour la page "I — Vue
> d'ensemble" au niveau global.

### Chantiers à effectif réduit

**Constat de production** : un chantier à 1 ou 2 employés recevait exactement le même traitement
qu'un chantier de 100 employés — ses propres pages « Vue d'ensemble » + évolution, sa propre page
« Équipes de chantier » (un graphique à 4 barres pour une seule catégorie), et son propre tableau
employé. Sur un rapport réel, un chantier à 1 seul employé générait ainsi **3 pages quasi vides**
pour une masse/un effectif négligeables — la cause principale du gonflement du rapport (jusqu'à
100+ pages sur un périmètre avec de nombreux petits chantiers).

**Seuil** : un chantier est « compact » quand son effectif est ≤ `SEUIL_CHANTIER_COMPACT` (constante
`PaieBiReportBuilder`, actuellement **3** — validée explicitement avec la direction après ce constat,
pas une valeur arbitraire). Un chantier « détaillé » (effectif > 3) garde exactement le traitement
complet décrit ci-dessus.

**Ce qu'un chantier compact perd** (toujours par rapport à un chantier détaillé) :

- Aucun chapitre romain individuel, aucune page « Vue d'ensemble »/évolution mensuelle (l'historique
  d'un chantier à 1-3 personnes n'apporte pas d'information utile en courbe — demande explicite de
  direction, décision définitive, pas un point d'extension).
- Aucun graphique de répartition par équipe qui lui soit propre.
- Aucune sous-distinction équipe dans son tableau employé (y compris `Sans équipe`, voir plus haut) :
  juste « chantier + employé ».

**Ce qui est conservé** : le détail nominatif intégral de chaque employé (aucune perte
d'information), et une comparaison directe entre chantiers compacts via **un unique graphique
consolidé** — un chantier compact par barre (masse/effectif/STC en personnes/STC en DH, même
plafond de 15 + "Autres" que partout ailleurs, voir `RapportBiVue.repartitionChantiersCompacts`).

**Rendu** : un unique chapitre final, « N — Chantiers à effectif réduit » (son numéro suit
directement le dernier chantier détaillé, voir `PaieReportPdfService.chapitreChantiersCompacts`) :

1. Le graphique consolidé ci-dessus, sur sa propre page.
2. Le tableau employé de **chaque** chantier compact, à la suite les uns des autres **sans saut de
   page entre eux** (plusieurs petits chantiers s'enchaînent donc sur la même page) — chacun avec
   son propre mini-en-tête « CHANTIER : Cxxx » (Effectif / STC / Masse, même style que l'en-tête
   d'équipe d'un chantier détaillé).

**Mécanisme technique** (JasperReports n'offre aucun moyen natif de « sauter » conditionnellement un
groupe) : plutôt que de piloter `GroupChantierEvolution`/`GroupChantier` par le vrai code chantier,
`LigneRapportDetailBean` leur fournit des clés de déclenchement dérivées
(`chantierEvolutionCle`/`chantierEquipesCle`, calculées par `PaieReportPdfService.lignesDetail`) :

- Pour un chantier détaillé, ces clés valent le vrai code chantier — le groupe se déclenche
  normalement, une fois par chantier.
- Pour TOUS les chantiers compacts, `chantierEvolutionCle` reste **gelée** à la valeur du dernier
  chantier détaillé rencontré (ou `""` s'il n'y en a aucun) : elle ne change plus jamais d'une ligne
  compacte à l'autre, donc `GroupChantierEvolution` (la page « Vue d'ensemble »/évolution) ne se
  déclenche plus du tout pour eux — page supprimée entièrement, pas seulement vidée.
  `chantierEquipesCle`, elle, prend une **constante dédiée** (`"__CHANTIERS_COMPACTS__"`) pour
  toutes les lignes compactes : `GroupChantier` se déclenche donc exactement UNE fois à l'entrée
  dans le bloc compact (impression du chapitre final), jamais une fois par chantier compact.

Le tableau employé, lui, réutilise directement le groupe `GroupEquipe` existant — **aucun groupe
JRXML supplémentaire** : pour une ligne compacte, `equipeNom` porte le CODE CHANTIER (pas un vrai nom
d'équipe), ce qui fait déclencher `GroupEquipe` exactement une fois par chantier compact (puisque ce
code est unique), avec `isStartNewPage="false"` — d'où l'enchaînement sans saut de page. Les autres
champs « équipe » (`equipeTitre`, `equipeEffectif`, `equipeMasse`, `equipePartChantierPourcent`,
`equipeStc`) portent alors les valeurs du CHANTIER plutôt que d'une équipe.

**Limite acceptée** : si le périmètre du rapport ne contient AUCUN chantier détaillé (ex. rapport
filtré sur un unique petit chantier via `chantierId`), la page « Vue d'ensemble »/évolution s'affiche
tout de même une fois, pour le premier chantier compact rencontré — tout groupe JasperReports se
déclenche nécessairement sur le tout premier enregistrement du document, quelle que soit sa clé. Cas
marginal (il faut qu'aucun chantier du périmètre filtré ne dépasse le seuil), jamais bloquant : au
pire une page en plus, jamais une page manquante ou un contenu incorrect.

### Visualisations

**Convention du document : barres groupées horizontales à 4 séries (masse/effectif/STC en
personnes/STC en DH), aucun graphique empilé — et depuis le 2026-09-28, la SEULE famille de
graphique du rapport (voir « Évolution mensuelle » ci-dessous).** **Un seul customizer,
`PaieReportGroupedChartCustomizer`, réutilisé partout** : "Vue par chantier" (chapitre I),
répartition par équipe de chaque chantier détaillé, répartition consolidée du chapitre final
"Chantiers à effectif réduit" — la donnée sous-jacente (`RepartitionBean`) est la même forme à
chaque niveau.

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
- **Plafonné aux 15 plus grosses valeurs** (`PaieBiReportBuilder.MAX_BARRES_GRAPHIQUE`), au niveau
  global (chapitre I) comme pour le chapitre final consolidé (le reste regroupé sous « Autres »,
  masse/effectif/STC cumulés, toujours retrié à sa vraie place) — un graphique complet à 25+
  catégories devient trop dense pour rester lisible imprimé. Pas de plafond au niveau « répartition
  par équipe » d'un chantier détaillé : le nombre d'équipes distinctes au sein d'un même chantier
  reste naturellement modeste.
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
effectif) aux niveaux Global et Chantier détaillé, avec une fenêtre glissante d'au plus 12 mois
(jamais avant le premier mois où une paie existe réellement en base,
`PaieRepository.premierePeriode()`) et un système de normalisation par série (même principe que
`PaieReportGroupedChartCustomizer` ci-dessus) pour contourner les limites d'un vrai double axe Y à
échelle réelle. **Ce graphique a été retiré entièrement** (manque d'historique suffisant pour qu'une
tendance mensuelle soit significative) — voir `docs/report/rapport-v2.md` pour le détail complet de
cette décision, de celle qui l'a précédée (retrait du STC de ce même graphique), et de ce qui reste
calculé côté Java sans être affiché (prêt à être réactivé sans recalcul si le besoin se confirme un
jour). Le rapport ne porte donc plus aucun `<lineChart>` — voir la note en tête de cette section.

### Narratif léger

Sous les cartes KPI de la Vue d'ensemble, et sous le bandeau KPI de chaque chantier détaillé, une
phrase courte en italique résume les chiffres déjà affichés — style factuel, pas un paragraphe
rédigé :

- Globale : `Masse : <valeur> DH (<variation>)  ·  Effectif : <n>  ·  <n> chantiers.`
- Par chantier : `<part>% de la masse globale  ·  <effectif> pers  ·  <n> STC/sortie(s).` (clause
  STC/sortie omise quand elle vaut 0 — rien à signaler).

Calculé dans `PaieReportPdfService` (`syntheseNarratif`/`chantierNarratif`), à partir des mêmes
valeurs déjà agrégées par `PaieBiReportBuilder` — aucune nouvelle donnée, aucun seuil de « hausse
notable » : ce niveau reste volontairement descriptif, jamais une détection d'anomalie/tendance.

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
  - **Titres de chapitre** (I — Vue d'ensemble, puis un par chantier détaillé, puis le chapitre
    final compact) : 16pt gras, texte noir sans fond, souligné d'un filet fin.
  - **Sous-titres** (bandeau équipe, titre de chaque graphique) : 12-13pt gras, texte noir.
  - **Indicateurs KPI** : 13-18pt gras pour la valeur, 7.5-9pt gras pour son libellé.
  - **Tableau détaillé employé** (11 colonnes) : 10.5pt.
  - **Captions/notes** (libellés de blocs d'en-tête, pied de page) : 6.5-10pt.
  - **⚠️ Piège JasperReports constaté en production** : une hauteur de `reportElement` trop proche
    de la taille de police (ex. `height="13"` pour `size="12"`) fait que le texte **ne s'affiche pas
    du tout, sans aucune exception ni avertissement** — ni dans les logs, ni dans le PDF, juste un
    vide silencieux. Une marge d'au moins ~6pt entre la hauteur et la taille de police
    (`height="18"` pour `size="12"`, `"22"` pour `size="16"`) évite le problème — voir les
    commentaires `GroupChantierEvolution`/`GroupChantier` de `rapport.jrxml` pour l'historique de ce
    diagnostic.
- **Aucun sommaire imprimé** : un rapport généré à la demande n'a pas besoin d'une table des
  matières — le sous-rapport dédié (`sommaire.jrxml`) et sa vue-modèle (`SommaireEntreeBean`) ont
  été supprimés. Le double remplissage (voir « Numérotation des chapitres et des pages ») subsiste,
  mais uniquement pour connaître la page de départ du premier chantier (bloc "Niveau" du bandeau).

### Numérotation des chapitres et des pages

**Chapitres** : `PaieReportPdfService.chapitreChantier(index, chantier)` numérote en chiffre romain
chaque chantier **détaillé**, `index` étant sa position parmi les seuls chantiers détaillés (jamais
parmi tous les chantiers — les compacts n'ont pas de chapitre individuel). Le chapitre final
consolidé (« Chantiers à effectif réduit ») suit directement le dernier chantier détaillé
(`chapitreChantiersCompacts`) — jamais un numéro fixe, toujours calculé à partir du nombre réel de
chantiers détaillés du périmètre filtré.

**Pages** : le numéro de page réel n'est connu qu'après la mise en page complète du document, alors
que le bandeau récurrent a besoin de savoir, dès la première page, à partir de quelle page basculer
de "GLOBAL" à "CHANTIER" (voir « Structure du rapport »). `PaieReportPdfService.generer` résout ça
par un **double remplissage** du même gabarit (jamais un second gabarit) :

1. **Passage de découverte** (silencieux, jamais exporté) : rempli avec un seuil provisoire
   (`Integer.MAX_VALUE`, tout est "GLOBAL"). Le premier chantier porte une ancre JRXML
   (`anchorNameExpression="chantier-" + code`, sur `GroupChantierEvolution` pour un chantier
   détaillé, et redondamment sur la branche "compacte" de `GroupChantier` pour couvrir le cas où le
   périmètre ne contient AUCUN chantier détaillé — voir « Chantiers à effectif réduit »). Le
   `JasperPrint` obtenu est relu page par page (`pagesParAncre`) pour retrouver la première page où
   cette ancre apparaît.
2. **Passage final** : le même gabarit est rempli une seconde fois avec ce seuil réel injecté — la
   mise en page du reste du document ne dépendant en rien de ce seuil, le résultat est exact.

Coût : la génération prend environ deux fois plus de temps (deux mises en page complètes) — accepté
pour un rapport de direction généré à la demande, pas en masse.

### Composants et services principaux

| Fichier | Rôle |
|---|---|
| `PaiePerimetreService` | Périmètre Excel (sélection manuelle de sous-feuilles équipe) |
| `PaieExportService` / `PaieSheetWriter` / `PaieExcelStyles` | Génération du classeur Excel |
| `PaieBiReportBuilder` | Périmètre + agrégations BI du rapport PDF, classement détaillé/compact — testé isolément (`PaieBiReportBuilderTest`) sans dépendre du repository via `construireDepuis` |
| `PaieReportPdfService` | Orchestration JRXML → PDF (compilation du gabarit unique, aplatissement des données, **double remplissage** — voir « Numérotation des chapitres et des pages », export) — testée de bout en bout par `PaieReportPdfServiceTest` |
| `PaieReportGroupedChartCustomizer` | Personnalisation Java de TOUS les `<barChart>` du document (SEULE famille de graphique restante — masse/effectif/STC personnes/STC DH, 4 séries normalisées chacune à son propre maximum, étiquette = vraie valeur, plafond des 15 plus grosses valeurs + "Autres" — voir « Visualisations ») |
| `PaieExportExcelDialogComponent` (frontend) | UX dédiée à la configuration de l'export Excel |
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
> a été retiré du rapport (évolution mensuelle, STC dans ces graphiques, répartition par fonction,
> sommaire, table de répartition par équipe), avec pour chacun ce qui reste réutilisable sans
> redévelopper.

- **Fusionner les pages "Vue d'ensemble" (KPI + narratif) avec la page de graphique qui suit** : au
  niveau global et pour chaque chantier détaillé, depuis le retrait du graphique d'évolution
  (2026-09-28), ces pages se terminent avec une zone blanche importante — voir « Vue détaillée d'un
  chantier détaillé ». Faisable en passant `isStartNewPage="false"` sur `GroupGraphChantier`/
  `GroupChantier` et en réduisant légèrement la hauteur des `<barChart>` concernés pour tenir sur la
  page restante ; nécessite une vérification visuelle dédiée (rendu PDF réel), volontairement pas
  fait dans la même passe que le retrait du graphique.
- **Réintroduire la répartition par fonction** : retirée à tous les niveaux (global, intra-chantier,
  intra-équipe) — le référentiel Fonction contient des doublons non nettoyés, qui rendraient un
  graphique par fonction illisible et trompeur (voir TODO.md pour la tâche de nettoyage côté
  données). `SyntheseGlobaleVue.repartitionFonction`/`P_REPARTITION_FONCTION` restent calculés côté
  Java pour ne pas tout redévelopper à la réintroduction : il suffira de rajouter le groupe JRXML
  correspondant une fois le référentiel fiable, et de décaler `CHAPITRES_FIXES`.
- **Réintroduire l'évolution mensuelle** : retirée entièrement (manque d'historique, voir
  `docs/report/rapport-v2.md`) mais toujours calculée côté Java
  (`PaieBiReportBuilder.evolutionParNiveau`) — à reconsidérer une fois plusieurs mois/années de
  données accumulées, si le besoin se confirme réellement. Le customizer dédié
  (`PaieReportEvolutionChartCustomizer`) a été supprimé du dépôt ; son implémentation reste
  consultable dans l'historique Git avant ce retrait.
- **Ajuster `SEUIL_CHANTIER_COMPACT`** (`PaieBiReportBuilder`, actuellement 3) : seuil validé avec la
  direction sur un cas de production concret, pas une science exacte — à revoir si un périmètre réel
  révèle qu'il est trop bas (des chantiers à 4-5 personnes méritant le même traitement compact) ou
  trop haut (des chantiers "détaillés" trop proches du seuil, gagneraient peu à leur chapitre
  complet).
- **Comparaison mois précédent au niveau équipe** : volontairement omise pour l'instant (une
  variation par équipe, en plus du global et du chantier, ajoute une 3ᵉ couche de deltas pour un
  gain de lecture marginal) — à ajouter dans `PaieBiReportBuilder.equipeVue` si un besoin réel se
  confirme.
- **Autres filtres de la liste (nom, CIN, fonction, chantier)** : volontairement non appliqués au
  rapport PDF (voir « Périmètre et filtres ») — un rapport de direction porte sur l'ensemble des
  chantiers/employés de la période, pas sur une recherche ponctuelle. `PaieReportPdfRequestDto` les
  garde optionnels pour un appel API direct ; à réexposer côté UI seulement si un besoin réel de
  rapport filtré se confirme.
- **Nouveaux indicateurs BI** : ajouter une mesure suit toujours le même chemin —
  `PaieBiReportBuilder` (calcul), un nouveau record de vue-modèle (paramètre scalaire) ou une classe
  à getters (ligne de table/graphique liée par réflexion) si la forme ne rentre dans aucun existant,
  les éléments correspondants dans le gabarit JRXML concerné, une entrée dans le catalogue de KPI
  ci-dessus. Avant d'ajouter un KPI, vérifier qu'il répond à une question non déjà couverte pour
  éviter la duplication.
