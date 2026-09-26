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

staport.rh.paie.report/      ← sortie PDF BI (JasperReports Library — JRXML compilés au démarrage,
│                                 resources/report/paie/jasper/)
├── PaieReportController.java     POST /paie/report/pdf
├── PaieReportPdfService.java     Orchestration : appelle PaieBiReportBuilder, aplatit chantiers →
│                                 équipes → employés en une seule liste dénormalisée
│                                 (LigneRapportDetailBean), remplit le gabarit JRXML unique
│                                 (rapport.jrxml) en DEUX passages (voir « Sommaire ») et exporte en
│                                 PDF (JRPdfExporter) — un seul JasperPrint réellement exporté
├── PaieBiReportBuilder.java      Périmètre + agrégations BI (fait/dimensions/mesures — voir plus bas).
│                                 N'utilise PAS PaiePerimetreService : besoin différent (agrégation
│                                 systématique de tout le périmètre filtré, jamais une sélection
│                                 manuelle de sous-feuilles) — voir « Pourquoi deux périmètres ? ».
├── PaieReportChartCustomizer.java Personnalise les 4 <barChart> JRXML natifs (barres horizontales,
│                                 couleurs, étiquette de valeur centrée à l'intérieur de chaque barre)
│                                 — seule logique Java des graphiques catégoriels, le moteur JFreeChart
│                                 est interne à JasperReports (aucun PNG généré à part). Réglages
│                                 systématiquement posés au niveau de la série (série 0), jamais via
│                                 les setters "base" dépréciés de JFreeChart : le thème par défaut de
│                                 JasperReports positionne déjà une visibilité par série avant l'appel
│                                 de ce customizer, qui prime sinon silencieusement sur un
│                                 setItemLabelsVisible(true) et empêche l'affichage des étiquettes.
├── PaieReportEvolutionChartCustomizer.java Personnalise le <lineChart> unique « Évolution de la
│                                 masse salariale » (courbe + marqueurs) — jamais fusionné avec
│                                 PaieReportChartCustomizer : une tendance dans le temps répond à une
│                                 question différente d'une comparaison catégorielle (voir
│                                 « Visualisations »).
├── RapportBiVue / SyntheseGlobaleVue / ChantierBiVue / EquipeBiVue / KpiMontantVue / KpiEffectifVue /
│   LigneEmployeVue                Vue-modèle (records), aucune logique métier — utilisée uniquement
│                                 côté Java (paramètres JRXML), jamais liée par réflexion
├── DistributionVue / RepartitionBean / EvolutionMasseBean / LigneRapportDetailBean / SommaireEntreeBean
│                                 Classes à getters (pas des records) : lignes de table/graphique
│                                 liées par introspection JavaBean (JRBeanCollectionDataSource) —
│                                 un getter public sur une classe non publique n'est pas accessible
│                                 par réflexion depuis un autre package, ces classes sont publiques.
│                                 LigneRapportDetailBean est la source de données unique et à plat de
│                                 rapport.jrxml : un employé par ligne, dénormalisée avec le contexte
│                                 chantier + équipe (voir « Structure du rapport »). SommaireEntreeBean
│                                 (libellé de section + numéro de page) alimente le sous-rapport
│                                 Sommaire (voir « Sommaire »). EvolutionMasseBean (période + masse)
│                                 alimente le lineChart d'évolution (voir « Visualisations »)
├── PaieReportNumberFormat.java   Formatage des nombres, variations et tendances (HAUSSE/BAISSE/STABLE)
└── PaieReportPdfRequestDto.java  Corps de la requête — mêmes filtres que PaieSearchCriteria (page Paie)

resources/report/paie/jasper/  ← gabarits JRXML
├── rapport.jrxml                 Gabarit unique pour tout le document : page de garde (bande title,
│                                 isTitleNewPage — seule page sans pageHeader/pageFooter, voir
│                                 « Structure du rapport »), puis 4 groupes à expression constante
│                                 (en-tête imprimé une seule fois chacun, en tout début de document) :
│                                 GroupSommaire, GroupSynthese (KPI + narratif, plus aucun graphique),
│                                 GroupGraphEvolution (lineChart), GroupGraphChantier et
│                                 GroupGraphFonction (2 barChart empilés pleine largeur chacun) — puis
│                                 groupe GroupChantier (isStartNewPage) et groupe GroupEquipe
│                                 (keepTogether, isReprintHeaderOnEachPage) pilotant la même source de
│                                 données à plat — zéro duplication de bande entre sections, le
│                                 pageHeader à 3 blocs (une seule bande définie une fois) se répète
│                                 nativement sur toutes ces pages
├── sommaire.jrxml                Sous-rapport : une ligne par section (Synthèse globale, Évolution,
│                                 les 2 pages graphiques, puis un chantier par ligne) avec son numéro
│                                 de page réel — voir « Sommaire »
└── tableDistribution.jrxml       Sous-rapport : répartition par équipe d'un chantier
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
masse/l'effectif (chantier, équipe, fonction) ? et pour chaque chantier, que se passe-t-il en
détail ?

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
| **Dimensions** | Chantier (obligatoire sur `Paie`), Fonction (obligatoire), Équipe (optionnelle → `Sans équipe`), Employé, Période (mois analysé + mois précédent). |
| **Mesures de base** | Masse réelle de paie = `SUM(salaireTotal)` (**jamais** `salaireMensuel` — voir ci-dessous) ; Effectif = `COUNT(*)` ; STC / sortie = `COUNT` des lignes où `ObservationStc.estStcOuSortie`, calculé **par chantier** (indicateur, jamais une liste globale — voir « Catalogue de KPI »). |
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
| Nombre de chantiers | `COUNT DISTINCT` | Global | Non — seul indicateur/filtre global conservé sur la déclinaison Chantier/Fonction (voir ci-dessous) |
| Masse par chantier (chart 1) | `SUM(salaireTotal)` groupé par chantier | Global | Non |
| Effectif par chantier (chart 2) | `COUNT(*)` groupé par chantier | Global | Non |
| Masse par fonction (chart 3) | `SUM(salaireTotal)` groupé par fonction | Global | Non |
| Effectif par fonction (chart 4) | `COUNT(*)` groupé par fonction | Global | Non |
| Évolution de la masse salariale | `SUM(salaireTotal)` groupé par période, pour **toutes** les périodes réellement présentes en base pour le périmètre filtré (jamais une fenêtre glissante à trous) | Global | N/A — c'est la comparaison, sur plus de deux points |
| Distribution par équipe (avec Sans équipe) | `SUM(salaireTotal)` groupé par équipe, + part du total | Chantier | Non |
| STC / sortie du chantier | `COUNT` des lignes où `ObservationStc.estStcOuSortie`, restreint à ce chantier | Chantier | Non — indicateur unique (pas de table), affiché dans le bandeau KPI du chantier |

Pas de KPI dupliqué : chaque carte/tableau/graphique répond à une question différente (voir §16 du
prompt de conception — jamais cinq façons de montrer le même montant). La synthèse globale (page
100% graphique) ne conserve que l'indicateur Chantier — la déclinaison combinée Chantier/Fonction
(ex. l'ancienne carte "Chantiers / Fonctions") a été retirée ; la dimension Fonction reste couverte,
mais uniquement par les charts 2 et 3 ci-dessus, jamais par un second indicateur/filtre global. Au
niveau chantier, l'ancien tableau « Effectif par fonction (+ STC) » et la liste globale « STC /
sortie du mois » ont été retirés : le STC/sortie est désormais un indicateur numérique unique par
chantier (jamais une table de noms), et la dimension Fonction au niveau chantier n'a pas d'écran
dédié (elle reste couverte globalement par les charts 2 et 3).

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

1. **Page de garde** (`title` JRXML, `isTitleNewPage` — la seule page du document sans
   `pageHeader`/`pageFooter`, comportement JasperReports pour une bande title en isTitleNewPage,
   exploité ici plutôt que subi : une couverture porte sa propre mise en avant du logo et de la
   période, elle n'a pas besoin du bandeau récurrent) : logo, titre du rapport, puis 3 clés-valeurs
   **Département** (`Ressources Humaines`) / **Année** / **Mois**, date de génération. Jamais de
   sous-titre « Synthèse BI », jamais de ligne Périmètre — une couverture reste minimale.
2. **Sommaire** (`<group name="GroupSommaire">` à expression constante — son en-tête ne s'imprime
   qu'une seule fois, en tout début de document, juste après la page de garde) : une ligne par
   section (Synthèse globale, Évolution de la masse salariale, les 2 pages graphiques catégorielles,
   puis un chantier par ligne, dans l'ordre d'apparition) avec son numéro de page réel — voir
   « Sommaire » pour le mécanisme de double remplissage qui rend ces numéros exacts.
3. **Bandeau** (`pageHeader` JRXML, un seul défini dans `rapport.jrxml`) : répété à l'identique sur
   **toutes** les pages de contenu qui suivent (Sommaire compris), y compris les pages chantier — un
   seul `JasperPrint` réellement exporté, jamais de bande dupliquée dans un second gabarit (voir
   « Composants et services principaux »). Trois blocs, chacun un logo ou une paire de clés-valeurs
   empilées (jamais concaténées en une seule ligne) :
   - logo seul (plus de texte "Rapport de paie" à côté) ;
   - clé **Département** (valeur `Ressources Humaines & Paie`) + clé **Généré le** ;
   - clé **Mois** + clé **Année**, séparées. Jamais de ligne Périmètre (retirée elle aussi).
4. **Synthèse globale** (`<group name="GroupSynthese">`, même mécanique d'en-tête imprimé une seule
   fois que GroupSommaire — c'est l'ancienne bande `title`, déplacée ici pour bénéficier du
   `pageHeader`/`pageFooter` comme toute page de contenu) : KPI (masse réelle, effectif, masse
   moyenne/employé, **nombre de chantiers** — seul indicateur/filtre global conservé sur la
   déclinaison Chantier/Fonction, voir « Catalogue de KPI ») puis une **phrase courte de synthèse**
   (voir « Narratif léger ») — plus aucun graphique sur cette page, voir point suivant.
5. **3 pages dédiées aux visualisations** (`GroupGraphEvolution`, `GroupGraphChantier`,
   `GroupGraphFonction`, même mécanique d'en-tête imprimé une seule fois), dans cet ordre : évolution
   de la masse salariale (1 lineChart), puis masse + effectif par chantier (2 barChart empilés pleine
   largeur), puis masse + effectif par fonction (2 barChart empilés pleine largeur) — voir
   « Visualisations » pour le détail et la justification de ce découpage.
6. **Une section par chantier**, dans l'ordre alphabétique des codes : synthèse BI du chantier
   (masse + comparaison, effectif + comparaison, part de la masse globale, **indicateur STC /
   sortie** — voir « Catalogue de KPI », une **phrase courte de synthèse** du chantier, distribution
   par équipe), puis une sous-section par équipe (BI compacte : effectif, masse, part du chantier —
   puis le tableau détaillé des employés), et enfin **Sans équipe** dans les mêmes conditions.

Chaque chantier commence sur une nouvelle page (`<group name="GroupChantier" isStartNewPage="true">`
dans `rapport.jrxml`, piloté par la même source de données à plat que le reste du document — jamais
de `JasperPrint` séparé par chantier). Une équipe (Sans équipe comprise), en revanche, ne démarre pas
systématiquement sur sa propre page — elle garde son détail employé sur la même page que son en-tête
tant qu'elle y tient (`<group name="GroupEquipe" keepTogether="true" isReprintHeaderOnEachPage="true">`)
et n'est coupée entre deux pages que si elle est, à elle seule, plus grande qu'une page : avec un
chantier réel comportant de nombreuses petites équipes, forcer une page par équipe produirait des
dizaines de pages quasi vides. Le tableau employé reprend les colonnes de la liste Paie à l'écran,
moins Chantier et Équipe (déjà portées par les titres de section) : Nom & prénom, Fonction, CIN,
Nbre jrs (P/J.R.O/J.R.D), Salaire (Salaire/RO/RD), Total, Obs.

### Sommaire

Une vraie page de sommaire imprimée — pas seulement des signets PDF — nécessite de connaître le
numéro de page de chaque section **avant** de l'imprimer, alors que JasperReports ne met en page
qu'en un seul passage, dans l'ordre. `PaieReportPdfService.generer` résout ça par un **double
remplissage** du même gabarit `rapport.jrxml` (jamais un second gabarit, jamais une concaténation de
`JasperPrint` déjà rendus après coup — cette dernière approche désynchroniserait le compteur
`$V{PAGE_NUMBER}` du pied de page, voir la Javadoc de la classe) :

1. **Passage de découverte** (silencieux, jamais exporté) : rempli avec des numéros de page
   provisoires (0) dans le Sommaire. Chaque section porte une ancre JRXML
   (`anchorNameExpression="synthese-globale"` sur le bandeau Synthèse globale,
   `anchorNameExpression="chantier-" + code` sur le bandeau de chaque chantier — uniquement possible
   sur un `<textField>`, `<staticText>` ne le supporte pas dans le schéma JRXML). Le
   `JasperPrint` obtenu est relu page par page (`pagesParAncre`) pour retrouver la première page où
   chaque ancre apparaît.
2. **Passage final** : le même gabarit est rempli une seconde fois, cette fois avec les numéros de
   page réels injectés dans le Sommaire. Comme la mise en page du reste du document (Synthèse
   globale, chantiers) ne dépend en rien du contenu textuel du Sommaire — seulement de sa hauteur,
   déjà correcte dès le premier passage —, les numéros de page obtenus sont exacts.

Coût : la génération prend environ deux fois plus de temps (deux mises en page complètes) — accepté
pour un rapport de direction généré à la demande, pas en masse.

### Visualisations

- **Évolution de la masse salariale** (page dédiée, seule avant les graphiques catégoriels) :
  `<lineChart>` JRXML natif, personnalisé par `PaieReportEvolutionChartCustomizer` (courbe + marqueurs,
  pas de barres) — une tendance dans le temps est une question différente d'une comparaison de
  catégories, jamais mélangée au même graphique. Couvre **toutes** les périodes réellement présentes
  en base pour le périmètre filtré, jamais une fenêtre glissante à trous (choix explicite, voir
  `PaieBiReportBuilder.evolutionMasse`) : un mois sans bulletin n'existe simplement pas sur l'axe,
  jamais affiché comme un creux à 0 DH trompeur.
- **Les 4 barChart de masse/effectif par chantier et par fonction**, répartis sur **2 pages
  distinctes** (masse + effectif par chantier ; masse + effectif par fonction), 2 graphiques empilés
  pleine largeur par page plutôt que 4 compressés en grille sur une seule page : des barres deux fois
  plus larges rendent les montants directement lisibles sans avoir à zoomer. `<barChart>` JRXML
  natifs (moteur JFreeChart interne à JasperReports, personnalisés par `PaieReportChartCustomizer` —
  barres horizontales, jamais de PNG pré-généré à part). Jamais de camembert/donut : une barre
  horizontale compare mieux plus de 3-4 valeurs et affiche le montant/effectif directement sur la
  barre — l'étiquette de valeur est centrée **à l'intérieur** de chaque barre (jamais à côté), les
  barres étant dimensionnées en conséquence (marges de catégorie réduites, largeur de barre
  maximisée). Ces réglages sont posés au niveau de la série JFreeChart
  (`setSeriesItemLabelsVisible`/`setSeriesItemLabelFont`/etc.), jamais via les setters "base"
  dépréciés — le thème par défaut de JasperReports positionne une visibilité par série avant l'appel
  du customizer, qui l'emporte silencieusement sur un `setItemLabelsVisible(true)` global et
  empêchait l'affichage des étiquettes. Chaque graphique est plafonné aux 20 plus grosses valeurs (le
  reste regroupé sous « Autres », masse et effectif cumulés, toujours trié à sa vraie place dans le
  classement décroissant) pour rester lisible imprimé — voir `PaieBiReportBuilder.versRepartition`.
- **Distribution par équipe (niveau chantier)** : reste une table (`tableDistribution.jrxml`) — au
  niveau chantier, la cardinalité (quelques équipes) se lit mieux en table qu'en graphique.

### Narratif léger

Sous les cartes KPI de la Synthèse globale, et sous le bandeau KPI de chaque chantier, une phrase
courte en italique résume les chiffres déjà affichés — style factuel, pas un paragraphe rédigé :

- Globale : `Masse : <valeur> DH (<variation>)  ·  Effectif : <n>  ·  <n> chantiers.`
- Par chantier : `<part>% de la masse globale  ·  <effectif> pers  ·  <n> STC/sortie(s).` (clause
  STC/sortie omise quand elle vaut 0 — rien à signaler).

Calculé dans `PaieReportPdfService` (`syntheseNarratif`/`chantierNarratif`), à partir des mêmes
valeurs déjà agrégées par `PaieBiReportBuilder` — aucune nouvelle donnée, aucun seuil de « hausse
notable » : ce niveau reste volontairement descriptif, jamais une détection d'anomalie/tendance
(qui resterait à définir explicitement si un besoin réel se confirme).

### Composants et services principaux

| Fichier | Rôle |
|---|---|
| `PaiePerimetreService` | Périmètre Excel (sélection manuelle de sous-feuilles équipe) |
| `PaieExportService` / `PaieSheetWriter` / `PaieExcelStyles` | Génération du classeur Excel |
| `PaieBiReportBuilder` | Périmètre + agrégations BI du rapport PDF — testé isolément (`PaieBiReportBuilderTest`) sans dépendre du repository via `construireDepuis` |
| `PaieReportPdfService` | Orchestration JRXML → PDF du rapport PDF (compilation du gabarit unique, aplatissement des données, **double remplissage** — voir « Sommaire », export) — testée de bout en bout par `PaieReportPdfServiceTest` |
| `PaieReportChartCustomizer` | Personnalisation Java des 4 `<barChart>` JRXML (orientation horizontale, couleurs, étiquettes) |
| `PaieReportEvolutionChartCustomizer` | Personnalisation Java du `<lineChart>` unique d'évolution (courbe, marqueurs) |
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

- **Comparaison mois précédent au niveau équipe** : volontairement omise pour l'instant (une
  variation par équipe, en plus du global et du chantier, ajoute une 3ᵉ couche de deltas pour un
  gain de lecture marginal) — à ajouter dans `PaieBiReportBuilder.equipeVue` si un besoin réel se
  confirme.
- **Autres filtres de la liste (nom, CIN, fonction, chantier)** : volontairement non appliqués au
  rapport PDF (voir « Périmètre et filtres ») — un rapport de direction porte sur l'ensemble des
  chantiers/employés de la période, pas sur une recherche ponctuelle. `PaieReportPdfRequestDto` les
  garde optionnels pour un appel API direct ; à réexposer côté UI seulement si un besoin réel de
  rapport filtré se confirme (probablement pas un simple dialog de confirmation, plutôt un besoin à
  redéfinir explicitement).
- **Nouveaux indicateurs BI** : ajouter une mesure suit toujours le même chemin —
  `PaieBiReportBuilder` (calcul), un nouveau record de vue-modèle (paramètre scalaire) ou une classe
  à getters (ligne de table/graphique liée par réflexion) si la forme ne rentre dans aucun existant,
  les éléments correspondants dans le gabarit JRXML concerné, une entrée dans le catalogue de KPI
  ci-dessus. Avant d'ajouter un KPI, vérifier qu'il répond à une question non déjà couverte (voir
  « Catalogue de KPI ») pour éviter la duplication.
