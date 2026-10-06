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

staport.rh.paie.report/      ← sortie PDF BI — pipeline HTML/CSS pur (jsoup + openhtmltopdf, voir
│                                 « Rapport PDF (BI) » plus bas pour l'historique complet de cette
│                                 migration, 2026-09-29 — remplace JasperReports/JRXML)
├── PaieReportController.java     POST /paie/report/pdf
├── PaieReportHtmlPdfService.java Orchestration ET moteur de rendu : appelle
│                                 PaieBiReportBuilder.construire() (inchangé) → découpe en pages
│                                 (RapportPageModelBuilder) → construit le DOM (PaieReportHtmlBuilder)
│                                 → UN SEUL rendu PDF (openhtmltopdf) — voir « Numérotation des
│                                 chapitres et des pages » (plus de double passage, contrairement à
│                                 l'ancien pipeline JasperReports). Porte aussi l'enregistrement des 4
│                                 polices Liberation Serif auprès d'openhtmltopdf.
├── RapportPageModelBuilder.java  Moteur de PAGINATION — pur Java, aucune dépendance HTML/PDF,
│                                 entièrement testable sans rendu (RapportPageModelBuilderTest).
│                                 Parcourt RapportBiVue et décide, par arithmétique (largeurs de
│                                 colonnes et hauteur de ligne FIXES, connues d'avance), exactement
│                                 quel contenu va sur quelle page — voir « Pagination : contrôle
│                                 100% Java » pour pourquoi ce choix plutôt que de laisser le moteur
│                                 de rendu déborder naturellement (leçon de l'ancien pipeline
│                                 JasperReports, dont le comportement de débordement près de
│                                 certaines limites internes non documentées s'est révélé
│                                 imprévisible).
├── PageModel.java / CarteKpi.java  Vue-modèle de PAGINATION — chaque PageModel est une page physique
│                                 déjà entièrement résolue (texte d'en-tête/pied, numéro de page,
│                                 liste de Bloc : titre de chapitre/section/équipe, cartes KPI,
│                                 graphique, tranche de tableau employé, pied récap). Types de
│                                 données purs, jamais un élément jsoup.
├── PaieReportHtmlBuilder.java    Construit le DOM — EXCLUSIVEMENT par programmation via l'API
│                                 jsoup Element/Document, jamais par concaténation de chaîne ni
│                                 template (voir son Javadoc pour l'incident de production que ce
│                                 choix évite structurellement). Traduit chaque PageModel.Bloc en
│                                 HTML/CSS, aucune décision de pagination ici.
├── RapportChartSvgBuilder.java   Graphiques en barres groupées — construits en SVG à la main (voir
│                                 « Visualisations »), remplace PaieReportGroupedChartCustomizer/
│                                 JFreeChart (retirés avec JasperReports). Même logique de
│                                 normalisation par série (voir plus bas).
├── RapportRessourcesStatiques.java  Charge une seule fois (constructeur) les polices/CSS/logo,
│                                 partagés entre PaieReportHtmlBuilder et PaieReportHtmlPdfService
│                                 sans dépendance circulaire entre les deux.
├── PaieBiReportBuilder.java      Périmètre + agrégations BI (fait/dimensions/mesures — voir plus bas)
│                                 — INCHANGÉ par la migration HTML, toute la logique métier et le
│                                 formatage restent ici. Chaque chantier a sa propre section
│                                 (`ChantierBiVue.avecDetailEquipe`, piloté par la sélection
│                                 manuelle `PaieReportPdfRequestDto.equipesParChantier` — voir
│                                 « Export unifié PDF/Excel »). N'utilise PAS PaiePerimetreService :
│                                 besoin différent (agrégation systématique de tout le périmètre
│                                 filtré) — voir « Pourquoi deux pipelines ? ».
├── RapportBiVue / SyntheseGlobaleVue / ChantierBiVue / EquipeBiVue / KpiMontantVue / KpiEffectifVue /
│   LigneEmployeVue / RepartitionBean / MaterielLigneVue  Vue-modèle (records, sauf RepartitionBean/
│                                 MaterielLigneVue — classes à getters historiques, conservées telles
│                                 quelles), aucune logique métier — TOUTE valeur affichable y est déjà
│                                 une String pré-formatée non nulle ("-" si inconnue), sauf le
│                                 montant du mois précédent (`null` si introuvable : le libellé reste
│                                 affiché, sans valeur) et RepartitionBean.montant/stcMontant (BigDecimal
│                                 potentiellement null, consommé uniquement par RapportChartSvgBuilder — voir son
│                                 Javadoc pour le null-check dédié). `ChantierBiVue.avecDetailEquipe` :
│                                 `true` dès qu'au moins une équipe du chantier a été sélectionnée
│                                 manuellement. `EquipeBiVue` porte, en plus du détail employé,
│                                 `montantMoisPrecedent` (carte KPI "MASSE MOIS
│                                 PRECEDENT"), `repartitionFonction` (tableau récap) et `materiel`
│                                 (squelette parc matériel, vide sauf C168/CH/OP).
├── PaieReportNumberFormat.java   Formatage des nombres, variations, tendances (HAUSSE/BAISSE/STABLE)
│                                 et chiffres romains (numérotation des chapitres)
└── PaieReportPdfRequestDto.java  Corps de la requête — mêmes filtres que PaieSearchCriteria (page
                                  Paie) + `equipesParChantier` (même forme et même sélection que
                                  PaieExportRequestDto.equipesParChantier, voir « Export unifié »).

resources/report/paie/html/rapport.css  ← feuille de style STATIQUE, jamais interpolée avec une
                                  donnée métier (voir le Javadoc de PaieReportHtmlBuilder) — style
                                  noir/blanc/gris, police Liberation Serif, seuls les graphiques
                                  restent en couleur (voir « Style visuel »). Dimensions en `pt`
                                  (point PDF), jamais `px` CSS — géométrie A4 exacte, imprimée sur
                                  papier réel. Moteur CSS d'openhtmltopdf = CSS 2.1 pur : aucun
                                  support de `var()`/flexbox/`gap`/`object-fit` — toute la mise en
                                  page horizontale utilise `float`+`margin` (jamais flexbox), voir
                                  les commentaires en tête du fichier.

resources/report/paie/fonts/  ← 4 TTF Liberation Serif (Regular/Bold/Italic/BoldItalic), embarqués
                                  et enregistrés programmatiquement (jamais une police OS) — à la
                                  fois auprès d'AWT (RapportRessourcesStatiques, bloc statique, pour
                                  le rendu SVG des graphiques via Batik) ET auprès d'openhtmltopdf
                                  (PaieReportHtmlPdfService.enregistrerPolices, pour le texte du
                                  PDF) — deux sous-systèmes de police distincts, chacun a besoin du
                                  sien.
```

Frontend (`frontend/src/app/portail/paie/`) :

```text
export/
└── PaieExportWizardComponent    Assistant d'export UNIQUE (bouton "Exporter") en étapes guidées : mois,
                                  format PDF/Excel, équipes, parc matériel, génération. La même sélection
                                  d'équipes pour les deux formats (voir « Assistant d'export »).

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

Un seul bouton "Exporter" (`PaieListComponent`) ouvre `PaieExportWizardComponent` : l'étape « Format »
choisit PDF ou Excel, le reste de l'assistant — période, chantiers à détailler par équipe, équipes à
séparer par chantier — est **identique pour les deux formats** et
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

## Assistant d'export (2026-10-03)

Le bouton « Exporter » de la liste Paie ouvre `PaieExportWizardComponent`, un assistant en étapes guidées qui
remplace l'ancien dialogue unique. Bandeau d'étapes en haut (les étapes faites sont cliquables pour revenir en
arrière), panneaux qui glissent d'une étape à l'autre, animations coupées si l'utilisateur a demandé moins de
mouvement dans son système.

| Étape | Contenu |
|---|---|
| **1. Mois** | Un seul champ : sélecteur de mois partagé (`app-month-picker`, flèches d'année et 12 tuiles). Les mois **sans paie sont grisés** et non sélectionnables ; le dernier mois disponible est présélectionné. Dès qu'un mois est choisi, une carte annonce son contenu avec des compteurs animés (bulletins, chantiers, masse salariale, STC / sorties). Sans aucune paie : message « Aucune paie enregistrée ». Source : `GET /paie/periodes` (chargée une fois à l'ouverture, donc sans attente) |
| **2. Format** | Deux cartes : Rapport PDF (synthèse pour la direction) et Classeur Excel (détail ligne par ligne), avec aperçu animé |
| **3. Équipes** (facultative) | Chantiers du mois triés par masse, avec recherche. **Cliquer sur la ligne d'un chantier déplie ses équipes** (un badge « n / N équipes » signale ceux dont au moins une équipe est cochée ; un chantier sans équipe ne se déplie pas) : **aucune équipe n'est cochée d'office** : l'utilisateur choisit explicitement les équipes (une par une, ou « Toutes » / « Aucune » par chantier). Il n'y a volontairement **pas de sélection globale des chantiers** : tous les chantiers figurent de toute façon dans l'export, déplier un chantier ne sert qu'à choisir ses équipes, chantier par chantier. En Excel, une icône œil barré par équipe la **retire de la feuille du chantier** (elle garde sa propre feuille). Un chantier sans équipe ne peut pas être détaillé. Source : `GET /paie/chantiers` |
| **4. Matériel** (conditionnelle) | Voir ci-dessous |
| **5. Export** | Récapitulatif (chaque ligne a un lien « Modifier » qui ramène à son étape) et nom du fichier ; « Générer » lance l'appel, avec une barre d'attente **sans pourcentage** (le backend ne notifie pas son avancement), puis un écran de fin avec « Télécharger à nouveau » et « Nouvel export ». Les erreurs du backend (corps JSON en `Blob`) sont relues et affichées |

### Étape « Matériel »

Elle n'apparaît **que si un tableau matériel sera imprimé**, c'est-à-dire si un tableau du catalogue
(`GET /paie/materiel`) a son chantier détaillé **avec l'équipe qui le porte** (C168 avec CH pour CAMION, avec OP
pour ENGINS) ; sinon l'assistant passe directement au récapitulatif. Une carte par tableau concerné :

- une ligne par libellé du catalogue, avec un champ numérique et des boutons moins / plus, navigation au clavier
  par Entrée jusqu'au bouton « Continuer » ;
- barre « n sur N renseignées », total animé, carte en vert quand toutes les lignes sont renseignées ;
- **vide ou zéro** : une ligne vide s'imprime vide (à remplir au stylo), un `0` s'imprime `0` ; l'interrupteur
  « laisser vide » d'une carte conserve le comportement d'avant en un clic ; « Mettre 0 aux lignes vides » évite de
  saisir les zéros un par un ;
- saisie validée : entier de 0 à 999, message d'erreur sous la zone sinon, et on ne peut pas continuer tant qu'il
  est affiché ;
- **mémorisation** : les derniers nombres saisis sont gardés dans le navigateur (`localStorage`, clé
  `paie.export.materiel`) et préremplissent l'export suivant ; jamais écrits en base, jamais partagés entre
  utilisateurs ni appareils.

Seuls les nombres des tableaux réellement imprimés et non « laissés vides » sont envoyés (`materiel`).

### Tests

`paie-export-wizard.component.spec.ts` (mois présélectionné, refus sans mois valide, chargement des chantiers,
équipes cochées, apparition de l'étape matériel, contenu des requêtes PDF et Excel, nombres invalides,
mémorisation), `month-picker.component.spec.ts` (mois grisés, émission `aaaa-MM`, bornes d'année),
`PaieServiceTest` (routes de lecture), `PaieExportServiceTest` et `PaieBiReportBuilderTest` (nombres du parc
matériel dans l'Excel et le PDF). Voir `docs/testing.md`.

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
| `equipesParChantier` | `Map<code chantier, équipes>` — uniquement en mode `PERSONNALISE` : pour chaque chantier listé, exactement les équipes indiquées obtiennent leur propre sous-feuille. Un chantier absent de la map n'a aucune sous-feuille équipe. Activer un chantier dans l'assistant **ne coche aucune équipe** (décision du 2026-10-03) : la sélection est toujours explicite, comme côté API où seules les équipes envoyées sont détaillées. Même map envoyée au PDF (voir « Export unifié »). |
| `equipesExcluesFeuilleChantier` | `Map<code chantier, équipes>` — indépendant du champ précédent : pour un chantier donné, les équipes listées ici n'apparaissent pas sur **la feuille de ce chantier** (le total du mois précédent affiché sur cette feuille applique la même exclusion, pour rester comparable). Spécifique à l'Excel, ignoré par le PDF. |

L'assistant (`PaieExportWizardComponent`) construit ces champs à partir d'une UX à trois niveaux,
plus simple que la structure `AUCUNE`/`TOUTES`/`PERSONNALISE` brute :

1. **Chantiers à détailler par équipe** (multi-sélection) : chantiers pour lesquels une
   configuration équipe va être définie. En sélectionner un n'a par lui-même aucun effet sur les
   documents générés.
2. Pour chaque chantier concerné, **Équipes à détailler** (multi-sélection, alimentée par
   `GET /paie/chantiers?periode=...`) : équipes qui obtiennent leur propre
   sous-feuille (Excel) et/ou section (PDF). Rien n'est présélectionné : le choix est toujours explicite (boutons « Toutes » / « Aucune » disponibles).
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

### Parc matériel (chantier C168)

Décision (HMAYDA, 2026-09-22, étendue au PDF le 2026-09-29) : sur les sections équipe du chantier
**C168**, un tableau matériel est ajouté à côté du tableau récap Fonction/Effectif/STC. Sa colonne
« Nbre » est **remplie avec les nombres saisis dans l'assistant d'export** (décision du 2026-10-03,
voir « Assistant d'export », étape « Matériel »), ou laissée vide pour une ligne non renseignée :

- Équipe **CH** → tableau **CAMION** (Camion citerne, Camion 8x4, Camion SR, Port char, Pick up).
- Équipe **OP** → tableau **ENGINS** (Pelle pneu, Pelle chenille, Niveleuse, Compacteurs, Chargeur,
  Bull, Tractopelle).

Règle propre à ce chantier uniquement, aucune règle générale identifiée pour les autres —
**volontairement pas généralisée** (décision du 2026-10-03 : pas d'écran de paramétrage, pas de
persistance en base). Les nombres voyagent avec la demande d'export
(`materiel` : libellé de la ligne → nombre, 0 à 999, dans `PaieExportRequestDto` et
`PaieReportPdfRequestDto`, validé par le backend, `400` sinon) ; une ligne absente de la map reste vide, à
remplir au stylo sur le document imprimé, et un `0` s'imprime `0`. Le PDF les imprime via
`MaterielLigneVue.nombre`, l'Excel les écrit en cellule numérique (`SqueletteMateriel.nombres`). La règle métier (quel chantier/équipe → quels libellés) vit dans
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

L'assistant unifié (`PaieExportWizardComponent`, voir « Assistant d'export ») pilote : la
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
| Masse réelle de paie | `SUM(salaireTotal)` sur le périmètre filtré | Global / chantier / section | Oui — montant du mois précédent visible au global, Δ absolu + Δ % au chantier (voir « Null-handling ») |
| Effectif | `COUNT(*)` | Global / chantier / section | Oui — Δ absolu (jamais ambigu, 0 est une valeur légitime) |
| Masse moyenne par employé | masse ÷ effectif | Global / chantier | Non (dérivé, comparer une moyenne de moyennes n'apporte rien) |
| Nombre de chantiers | `COUNT DISTINCT` | Global | Non — seul indicateur global conservé sur la déclinaison par chantier |
| Masse/Effectif/STC (personnes et DH) par chantier | `SUM(salaireTotal)`/`COUNT`/`COUNT(ObservationStc)`/`SUM(salaireTotal STC)` groupés par chantier | Global | Non — 1 seul graphique à 4 séries groupées, titré « Répartition par chantier » — voir « Visualisations » |
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
  indisponible (`Tendance.NON_DISPONIBLE`, valeur précédente `null` : le PDF garde le libellé et laisse la valeur vide, aucune
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

### Libellé des équipes

Partout où le rapport affiche une équipe (titre de section "ÉQUIPE : ...", bandeau
`pageHeader`/`pageFooter` "CHANTIER : ... · ÉQUIPE : ...", graphique "Répartition par équipe", titres
de feuille Excel) : le **libellé** de l'équipe ("CHAUFFEURS", `Equipe.libelle` du référentiel Équipe,
voir `docs/equipe/README.md`), jamais son code ("CH") — demande explicite de direction, 2026-09-29.
Il est lu sur l'entité `Equipe` des bulletins (`PaieBiReportBuilder.libellesParCode`,
`PaieExportService.ecrireFeuillesEquipes`), plus aucune table codée en dur. La colonne « Équipe » du
tableau employé affiche en revanche le **code** (demande de direction du 2026-10-03).

Le libellé est **strictement un habillage d'affichage** : le code reste la clé utilisée partout
ailleurs — sélection manuelle des équipes à détailler dans le dialog d'export
(`PaieReportPdfRequestDto.equipesParChantier`/`PaieExportRequestDto.equipesParChantier`, qui
manipulent les codes), agrégation BI, détection de la section "reste". Même principe que
`chantierCode` vs `identifiantChantier` pour les chantiers (voir ci-dessous) : `EquipeBiVue.nom` reste
le code à usage interne, `EquipeBiVue.libelleAffiche` porte le libellé, réservé à l'affichage.

### Identifiant chantier (nom + code)

Partout où un chantier est identifié dans un texte affiché (titre de chapitre, section "reste",
bandeau `pageHeader`/`pageFooter`, titres de feuille Excel) :
**`"<nom> (<code>)"`** quand `Chantier.nom` est renseigné (champ optionnel, jamais exposé par la
synchronisation ERP — voir `docs/chantier/README.md`), **`"<code>"`** seul sinon (demande explicite
de direction, 2026-09-29 : le nom prime partout où il existe, le code reste l'identifiant de
repli). Calculé indépendamment par chaque format — `PaieBiReportBuilder.identifiantChantier` côté
PDF, `PaieExportService.titreZone` côté Excel — jamais partagé en code (voir « Pourquoi deux
pipelines ? »), mais avec la même règle. Côté PDF, ce texte est porté par `ChantierBiVue.identifiant()`
— à ne jamais confondre avec `chantierCode`, réservé aux mécanismes internes (détection de la
section "reste" via `equipe.nom().equals(chantier.code())`), jamais affiché tel quel.

**Exception : le graphique « Répartition par chantier »** (synthèse globale) porte le **nom seul** du chantier (`Chantier.nom`),
sans son code, quand il est renseigné ; le **code** reste le libellé de repli (nom vide ou absent) — demande de direction,
2026-10-05 (`PaieBiReportBuilder.repartitionChantiers`). Seul le libellé de la barre change : l'agrégat reste indexé par
code (filtrage des sections). Un nom trop long pour la colonne des libellés (jusqu'à 255 caractères) est coupé par
« … » (`RapportChartSvgBuilder.libelleAffiche`, environ 30 caractères) au lieu de déborder de la page. Deux chantiers qui
porteraient le même nom auraient deux barres de même libellé : le nom n'est pas unique, contrairement au code.

### Anti-duplication du détail employé

Un employé n'apparaît dans le tableau détaillé qu'**une seule fois**, dans sa section (une équipe
détaillée, ou le "reste" du chantier) — jamais répété ailleurs, un chantier ne montrant que des
agrégats BI en dehors de ce tableau. C'est la même logique que la hiérarchie Global → Chantier →
Section → Employé : chaque niveau au-dessus du dernier résume, seul le dernier détaille.

### Structure du rapport

1. **Page de garde** (`.page.cover`, sans bandeau/pied récurrent — voir rapport.css) : logo, titre
   du rapport, puis 3 clés-valeurs **Département** (`Ressources Humaines`) / **Mois** / **Année**
   (Mois avant Année — l'ordre de lecture naturel d'une période « Août 2026 »), empilées
   **verticalement**, puis un bloc **signatures** (Directeur Général à gauche, DRH à droite — rôle +
   nom du signataire en dur + filet à signer, jamais le filet pré-rempli). **Pas de date de
   génération** (retirée le 2026-09-29, demande explicite de direction — voir
   `docs/report/rapport-v2.md`).
2. **Bandeau récurrent** (`.page-header`, construit une seule fois par `PaieReportHtmlBuilder` et
   répété sur chaque page de contenu — jamais sur la page de garde) : 3 blocs sur une seule ligne
   chacun, séparés par de fins filets verticaux — Ressources Humaines / Mois-Année / **Niveau**. Le
   bloc **Niveau** est `GLOBAL` pour la page de synthèse, `CHANTIER : <identifiant> · ÉQUIPE : <nom>`
   pour une section équipe détaillée (voir « Identifiant chantier (nom + code) » pour la forme de
   `<identifiant>`), ou **`CHANTIER : <identifiant>` seul** (sans « · ÉQUIPE ») pour la section
   "reste" — `RapportPageModelBuilder` décide ce texte immédiatement, section par section, en même
   temps qu'il construit chaque page (voir « Numérotation des chapitres et des pages » : plus de
   passage de découverte, contrairement à l'ancien pipeline JasperReports). Le **pied de page**
   porte la même information (texte discret, aligné à gauche à côté de la pagination).
3. **I — Vue d'ensemble** : rubrique « Indicateurs clés » et 5 cartes KPI — la carte Masse affiche aussi
   le montant du mois précédent (libellé seul, valeur vide, si introuvable) ; masse réelle, effectif, masse moyenne/employé,
   nombre de chantiers, STC/sorties — puis, SUR LA MÊME PAGE, le graphique « Répartition par chantier »
   à 4 séries (masse/effectif/STC en personnes/STC en DH), qui montre **TOUS les chantiers**. Au-delà de 16
   chantiers, il continue sur une ou plusieurs pages « Répartition par chantier (suite) » — voir
   « Visualisations ».

   Chapitre « Répartition par fonction » retiré temporairement (voir « Points d'extension »).
4. **Une section par CHANTIER**, TOUS désormais — chacun son propre chapitre romain à la suite du
   seul chapitre fixe (II, III, ... — voir `RapportPageModelBuilder.chapitreChantier`) — voir « Vue
   détaillée d'un chantier » pour le détail.

Toutes ces sections partagent la même vue-modèle (`RapportBiVue`, voir « Modèle analytique ») —
`RapportPageModelBuilder` la parcourt directement (chantiers → équipes → employés), sans
aplatissement intermédiaire (contrairement à l'ancien `LigneRapportDetailBean` de l'ère
JasperReports, dont l'aplatissement n'a plus d'utilité une fois la pagination pilotée en Java).

### Vue détaillée d'un chantier

Un chantier occupe **1 seule page** pour sa rubrique « Indicateurs clés », ses cartes KPI + son
graphique titré « Répartition par équipe »
(le cas échéant), suivie d'une ou plusieurs pages par section équipe. Cette page suit la même
hiérarchie de lecture qu'à chaque niveau du rapport : **KPI → graphe (optionnel) → tableau(x)**.

1. **4 cartes KPI** : Masse salariale (avec comparaison mois précédent sur la même ligne que la
   valeur), Effectif, Coût moyen / employé, STC / sorties.
2. **"Répartition par équipe"** (renommé depuis "Équipes de chantier X" le 2026-09-29 — le chantier
   est déjà identifié par le titre de chapitre et le bandeau récurrent), SUR LA MÊME PAGE,
   **uniquement si au moins une équipe de ce chantier a été sélectionnée** pour un détail séparé
   (`ChantierBiVue.avecDetailEquipe`) — sinon la page se limite aux 4 cartes KPI. Quand affiché : UN
   SEUL graphique à barres groupées (masse/effectif/STC en personnes/STC en DH,
   `ChantierBiVue.repartitionEquipe` — TOUJOURS la distribution complète de toutes les équipes
   réelles du chantier, même si seule une partie a sa propre section ci-dessous) — **SEUL, sans
   tableau**.

Puis, sur une ou plusieurs pages dédiées chacune (`RapportPageModelBuilder.ajouterPagesEquipe`) :
une section par équipe **sélectionnée**, puis, si des employés restent (équipes non sélectionnées,
"Sans équipe" compris), une dernière section "reste" les regroupant tous — jamais un employé dans
deux sections. Si aucune équipe n'a été sélectionnée pour ce chantier, une seule section réunit tous
ses employés. Chaque section (12 colonnes, tout en noir — voir « Style visuel »), triée par ordre
**alphabétique** de fonction (voir `PaieBiReportBuilder.equipeVue`, même tri que le tableau récap
Fonction/Effectif/STC ci-dessous), se termine par le tableau récap et, le cas échéant, le squelette
matériel (voir « Cartes KPI de section et tableau récap »). Les KPI portent la rubrique « Indicateurs
clés ». Le tableau employé reprend 11 colonnes dans une section équipe nommée, 12 dans le « reste » :
de la liste Paie à l'écran, moins Chantier (déjà porté par le titre de section) : Nom & prénom,
Fonction, CIN, Nbre jrs (P/J.R.O/J.R.D), Salaire (Salaire/RO/RD), Total, Obs et **Équipe** dans la
section "reste" uniquement, où les employés viennent potentiellement de plusieurs équipes non sélectionnées mélangées, voir
`LigneEmployeVue.equipeReelle`). Cette colonne, comme tous les autres endroits du rapport où une
équipe est nommée (titre de section, bandeau CHANTIER/ÉQUIPE, graphique "Répartition par équipe"),
affiche le **nom complet** de l'équipe ("CHAUFFEURS"), jamais son code brut ("CH") — voir « Nom
complet des équipes » ci-dessous. Colonne Fonction élargie (100pt) et police réduite (8pt) : un
libellé fonction long ("CH. CAMION PORT CHAR") se retrouvait tronqué de façon indiscernable d'un
autre ("CH. CAMION GASOIL", tous deux affichés "CH. CAMION...") — constaté par l'utilisateur sur
données réelles.

Les en-têtes de colonnes ne se répètent JAMAIS sur les pages de continuation d'une section qui
déborde (`PageModel.BlocTableauEmployes.avecEnTeteColonnes`, vrai uniquement sur la 1re page) —
évite l'effet "tableau vide suivi de ses totaux" sur les pages de continuation.

### Pagination : contrôle 100 % Java (2026-09-29)

**Ce rapport a connu 2 architectures de rendu avant celle-ci** : un premier pipeline HTML (Thymeleaf
+ openhtmltopdf + JFreeChart), abandonné le 2026-09-25 pour JasperReports après plusieurs incidents
de production (voir « Historique — pourquoi 3 pipelines » ci-dessous) ; puis JasperReports/JRXML,
abandonné à son tour le 2026-09-29 (demande explicite de direction, après plusieurs bugs de
pagination — pages blanches provoquées par une limite interne non documentée du moteur, résolue par
une longue série de corrections empiriques). Cette 3e architecture revient à un pipeline HTML, mais
neutralise structurellement les 3 modes d'échec historiques (voir le Javadoc de
`PaieReportHtmlBuilder`/`RapportChartSvgBuilder` pour le détail de chacun).

**Décision centrale** : `RapportPageModelBuilder` découpe CHAQUE page à l'avance, en Java pur, avant
tout rendu HTML — jamais de règle CSS de pagination avancée (`@page` margin boxes, `position:
running()`, compteurs de page), dont le support par openhtmltopdf 1.0.x est incomplet et sensible à
la version. Chaque page physique (`PageModel`) est un bloc HTML à taille FIXE (842×595pt, A4
paysage), avec son texte d'en-tête/pied déjà résolu et sa tranche exacte de contenu — le moteur de
rendu n'a plus aucune décision de pagination à prendre, seulement de la mise en page de contenu à
taille fixe (la partie la mieux supportée et la moins risquée d'un moteur CSS).

Pourquoi c'est sûr et pas du sur-ingénierie : le tableau employé a des colonnes de largeur FIXE et
une hauteur de ligne FIXE (16pt, `table.employes td` dans rapport.css) — sa pagination est de
l'arithmétique, pas de la composition typographique ouverte. Puisque la hauteur de ligne est choisie
et fixée par nous-mêmes en CSS (jamais rétro-ingénierée depuis le comportement d'un moteur tiers,
contrairement à l'ancien `LIGNE_HAUTEUR` JasperReports), cette constante est fiable par construction.

**La règle qui a causé le plus de bugs sous JasperReports — le pied récapitulatif d'une section ne
doit jamais apparaître seul en haut d'une page sans aucune ligne employé au-dessus — devient une
simple condition Java** dans la boucle de découpage
(`RapportPageModelBuilder.ajouterPagesEquipe`) : en découpant les employés d'une section en pages,
si la dernière tranche laisserait le récap sans aucune ligne employé au-dessus, un saut de page est
forcé plus tôt ; sinon le récap est ajouté à la suite des dernières lignes, sur cette même page. Plus
aucun seuil empirique en pixels façon `SEUIL_CONTENU_PAGE_AVEC_FOOTER` : ce fudge-factor n'existait
que pour compenser un bug moteur (JasperReports décidait qu'une bande "tenait" sur la page courante
en comparant sa hauteur DÉCLARÉE à l'espace restant, jamais sa hauteur réellement nécessaire — voir
l'historique Git pour le détail complet de cette saga, `docs/report/README.md` avant le 2026-09-29)
qui n'a plus lieu d'être : une page est un bloc HTML à taille fixe (`overflow: hidden`), calculée
directement à partir de constantes que nous choisissons (`PAGE_BODY_HAUTEUR`, `LIGNE_HAUTEUR`,
`RECAP_BASE_HAUTEUR`/`RECAP_LIGNE_HAUTEUR`), avec une marge de sécurité (`MARGE_SECURITE`) absorbant
un éventuel écart d'arrondi entre cette arithmétique et le rendu CSS réel — jamais pour contourner un
bug de moteur.

Vérifié par un test dédié (`RapportPageModelBuilderTest`, qui balaie 1 à 120 employés croisés avec 0
à 16 lignes de récap et vérifie, sur le `List<PageModel>` retourné : aucun employé perdu ni dupliqué,
aucune page ne dépasse la hauteur utile, le récap n'est jamais accompagné d'un tableau vide) — plus
fort que l'ancien test JasperReports (`calculerSautPage_...`, supprimé) car il porte sur NOTRE modèle
explicite, jamais sur la prédiction du comportement d'un moteur tiers — et par une reproduction
locale à l'échelle réelle (plusieurs chantiers, dont une équipe à 74 employés/5 fonctions avec
squelette matériel C168/CH, une autre à 45 employés/11 fonctions) confirmant l'absence de page
blanche et de ligne perdue.

**Chantier sans détail par équipe** (aucune équipe sélectionnée, donc pas de graphique « Répartition par
équipe ») : la page du chantier n'a que le chapitre et ses cartes KPI, et le reste de la page serait vide. La
section « reste » (titre, KPI, récap, détail des employés) démarre donc **directement sous les cartes KPI du
chantier, sur la même page** : `RapportPageModelBuilder` déduit la hauteur de l'en-tête chantier
(`ENTETE_CHANTIER_HAUTEUR`) de la capacité de cette 1re page, et la suite de la pagination est inchangée. Avec un
détail par équipe, le chantier garde sa page propre (chapitre, KPI, graphique) et chaque équipe la sienne.
Couvert par `RapportPageModelBuilderTest` (1 à 120 employés × 0 à 16 lignes de récap : rien ne déborde, aucun
employé perdu).

### Cartes KPI de section et tableau récap

En-tête de CHAQUE section, quelle que soit la section (équipe détaillée ou "reste") : titre, rubrique
« Indicateurs clés », puis 4 cartes KPI — Effectif, STC/sorties, Masse (`EquipeBiVue.masse`, part du chantier), **Masse mois
précédent** (`EquipeBiVue.montantMoisPrecedent`, libellé gardé et valeur vide si aucune donnée, même
règle que « Null-handling ») — même style que les cartes de « I — Vue d'ensemble » et de chaque
chantier. Ces 2 derniers indicateurs sont des cartes à hauteur FIXE dans l'en-tête plutôt que des
lignes au bas du tableau (héritage d'une décision JasperReports du 2026-09-29 qui reste valide ici :
un indicateur à hauteur fixe ne peut structurellement jamais se retrouver orphelin en haut de page).

Collé directement au bas de CHAQUE tableau employé, quand il tient (voir « Pagination : contrôle
100 % Java » ci-dessus) :

1. **Tableau récap Fonction/Effectif/STC** : effectif et nombre de STC/sorties de CETTE section,
   groupés par fonction (`EquipeBiVue.repartitionFonction`, réutilise `RepartitionBean` sans ses
   champs montant) — jamais un graphique (redondant avec celui du chantier), nombre de lignes
   variable d'une section à l'autre.
2. **Squelette parc matériel**, uniquement pour le chantier C168 équipes CH/OP (voir « Squelette
   parc matériel ») — absent (pas de tableau du tout) pour toute autre section.

### Visualisations

**Convention du document : barres groupées horizontales à 4 séries (masse/effectif/STC en
personnes/STC en DH), aucun graphique empilé — la SEULE famille de graphique du rapport (voir
« Évolution mensuelle » ci-dessous).** Construits en **SVG à la main** (`RapportChartSvgBuilder`,
jsoup — voir son Javadoc), rendu nativement par openhtmltopdf (support Batik) : répartition par
chantier (chapitre I) et répartition par équipe de chaque chantier concerné — la donnée sous-jacente
(`RepartitionBean`) est la même forme à chaque niveau.

- **Barres HORIZONTALES groupées** (catégories en Y — chantier ou équipe selon le niveau ; valeurs
  en X). 4 séries par catégorie : Masse (DH, bleu), Effectif (personnes, orange), STC (personnes,
  rouge), STC (DH, marron) — chacune nommée avec son unité dans la légende.
- **Valeurs en colonnes, pas au bout des barres** (refonte du 2026-10-03). Chaque catégorie occupe une ligne :
  libellé à gauche, 4 barres fines au centre, et **4 valeurs écrites en colonnes alignées à droite** (Masse,
  Effectif, STC pers., STC DH), sur une seule ligne. Les valeurs posées au bout de chaque barre se chevauchaient
  dès que les barres étaient fines (4 textes empilés dans la hauteur de 4 barres) ; en colonnes, la hauteur
  minimale d'une ligne est celle d'**un** texte, donc aucun chevauchement n'est possible, quel que soit le
  nombre de catégories. Chaque colonne a un en-tête souligné d'un filet de la couleur de sa série, ce qui la
  relie à ses barres sans mesurer la largeur du texte.
- **Axe des valeurs masqué ET chaque série normalisée à sa propre valeur maximale** (0 à 1,
  indépendamment des 3 autres séries) : masse/STC en DH (milliers de DH) et effectif/STC en
  personnes (quelques unités) ont des ordres de grandeur si différents qu'un axe masqué seul ne
  suffit pas. Le texte de chaque colonne reste la **vraie** valeur, lue AVANT normalisation, avec un
  null-check explicite (`RapportChartSvgBuilder.valeurMontant`, `RepartitionBean.montant`/`stcMontant` pouvant
  être `null` — seul endroit de toute la vue-modèle dans ce cas, voir « Architecture » — traité comme zéro,
  jamais la chaîne littérale "null", couvert par un test de non-régression dédié). Une valeur nulle (ou `null`)
  n'a pas de barre et s'affiche « – » : une cellule vide serait ambiguë.
- **Pleine largeur utile** : le dessin est construit en pt puis agrandi de 4/3 (`PX_PAR_PT`) pour occuper
  les 802 pt de largeur utile de la page. Le moteur de rendu (openhtmltopdf + Batik) ignore les attributs
  `width`/`height` du SVG et dimensionne le dessin d'après son `viewBox`, en px (1 px = 0,75 pt) : sans cet
  agrandissement, le graphique n'occupait que les trois quarts de la largeur (corrigé le 2026-10-03, test de
  non-régression dans `RapportChartSvgBuilderTest`). La colonne des libellés s'adapte au plus long libellé
  (48 à 200 pt), les 4 colonnes de valeurs prennent 292 pt à droite (`LARGEUR_COLONNES`) et la barre la plus
  longue de chaque série occupe tout l'espace restant entre les deux. La hauteur totale (en-tête des colonnes,
  lignes, légende) est plafonnée à 361 pt (`HAUTEUR_TOTALE_CHART`) pour tenir sous le bandeau, le titre de
  chapitre et les cartes KPI ; une ligne fait au plus 40 pt.
- **Aération** : les 4 barres d'une ligne occupent 72 % de sa hauteur (`PART_BARRES_PAR_CATEGORIE`), le reste est
  de l'espace blanc entre lignes, renforcé par un filet gris clair entre deux lignes et un axe vertical fin à
  gauche des barres. Barres séparées de 1,4 pt (`ECART_ENTRE_BARRES`), libellés de catégorie en gras 9,5 pt,
  valeurs en gras 7,5 pt. Vérifié sur des rendus de 10 chantiers et de 13 équipes.
- Légende obligatoire en bas (4 séries à distinguer). Palette fixe : Masse `#2563EB`, Effectif
  `#F59E0B`, STC personnes `#B91C1C`, STC DH `#7F1D1D` (les 2 nuances de STC restent dans la même
  famille de rouges, sous ses 2 représentations) — seule exception à la règle noir/blanc/gris du
  document (voir « Style visuel »).
- **Répartition par chantier (chapitre I) : TOUS les chantiers**, par masse salariale décroissante, **sans**
  regroupement « Autres » ni plafond (décision du 2026-10-03 : un premier plafond à 10 chantiers a été levé
  une fois la disposition en colonnes en place). Jusqu'à 16 chantiers, tout tient sur la page de synthèse.
  Au-delà, `RapportPageModelBuilder` répartit le graphique **à parts égales** sur plusieurs pages
  (`MAX_CHANTIERS_PAR_PAGE_GRAPHIQUE = 16` ; 25 chantiers = 13 puis 12, jamais une dernière page presque vide) :
  la 1re page garde le titre « Répartition par chantier », les suivantes portent « Répartition par chantier
  (suite) » avec le bandeau `GLOBAL`. **Toutes les pages partagent la même échelle** (`BlocGraphique.echelle` =
  l'ensemble des chantiers) : sans cela chaque page serait dessinée à sa propre échelle et ses barres ne seraient
  plus comparables à celles de la page précédente. Chaque page répète l'en-tête des colonnes et la légende. Le
  graphique « Répartition par équipe » d'un chantier n'est pas réparti : le nombre d'équipes d'un même chantier
  reste modeste.
- Les autres distributions (fonction, calculée sans être affichée) restent plafonnées aux 15 plus grosses
  valeurs (`MAX_BARRES_GRAPHIQUE`), le reste regroupé sous « Autres ». Pas de plafond au niveau
  « répartition par équipe » d'un chantier : le nombre d'équipes distinctes au sein d'un même chantier
  reste naturellement modeste.

> **Historique** : ce graphique a connu plusieurs conventions antérieures côté JasperReports, toutes
> abandonnées sur demande explicite de direction — barres verticales à série unique, puis colonnes
> verticales empilées. **Plus aucun graphique empilé n'existe dans ce document.** Un vrai double axe
> X numérique (2 échelles simultanées) a également été envisagé puis écarté — la normalisation par
> série reste l'alternative retenue, explicitement admise par la direction.

### Évolution mensuelle — retirée (2026-09-28)

Le rapport a porté, à une itération précédente, un graphique d'évolution mensuelle (masse, effectif)
aux niveaux Global et Chantier, avec une fenêtre glissante d'au plus 12 mois (jamais avant le
premier mois où une paie existe réellement en base, `PaieRepository.premierePeriode()`). **Ce
graphique a été retiré entièrement** (manque d'historique suffisant pour qu'une tendance mensuelle
soit significative) — voir `docs/report/rapport-v2.md` pour le détail complet de cette décision, de
celle qui l'a précédée (retrait du STC de ce même graphique), et de ce qui reste calculé côté Java
sans être affiché (`PaieBiReportBuilder.evolutionParNiveau`, prêt à être réactivé sans recalcul si le
besoin se confirme un jour). Le rapport ne porte donc aucun graphique d'évolution.

### Style visuel

Rendu recherché : un rapport BI de direction imprimé, sobre — jamais un export de données habillé.

- **Noir / blanc / gris partout dans le document, aucune exception, aucun fond de couleur.**
  `#000000` est le seul texte utilisé pour tout contenu (titres de chapitre, sous-titres, bandeaux,
  tableaux). **Toutes les tables du document sont 100 % blanches** (aucun fond, aucune alternance de
  lignes), chaque cellule délimitée par un filet noir `#000000` — sur **toutes** les cellules du
  tableau employé, pas seulement l'en-tête. Palette restante, hors texte courant et tableaux :
  `#595959` (libellés/captions secondaires), `#CCCCCC` (filets décoratifs hors tableau, contour des
  cartes KPI), `#808080`/`#999999` (séparateurs de blocs d'en-tête). **Seuls les graphiques restent
  en couleur** — la seule exception délibérée à la règle noir/blanc (voir « Visualisations » pour la
  palette exacte). Les indicateurs de tendance HAUSSE/BAISSE/STABLE sont du texte noir gras préfixé
  du mot (« Hausse : … », « Baisse : … », « Stable : … ») — la couleur ne porte pas l'information, le
  texte si.
- **Police Liberation Serif** dans tout le document (`rapport.css`, `font-family: "Liberation
  Serif"`) — substitut de « Times New Roman » demandé par la direction : la police Microsoft n'est
  pas installée sur l'environnement de rendu PDF, et Liberation Serif en est métriquement
  compatible. **La police est embarquée dans l'application, jamais supposée installée au niveau du
  système d'exploitation qui exécute le backend** (leçon d'un incident de production antérieur,
  `JRFontNotFoundException`, quand un déploiement s'appuyait sur la police *de l'environnement de
  développement*). Les 4 fichiers `.ttf` (licence SIL Open Font License,
  `resources/report/paie/fonts/`) sont enregistrés programmatiquement auprès de DEUX sous-systèmes
  de police distincts, chacun nécessaire pour sa propre moitié du rendu :
  1. `RapportRessourcesStatiques` (bloc statique) les enregistre auprès du `GraphicsEnvironment` AWT
     — nécessaire car `RapportChartSvgBuilder`/Batik résolvent leurs polices de texte SVG par ce
     chemin, jamais via openhtmltopdf.
  2. `PaieReportHtmlPdfService.enregistrerPolices` les enregistre en plus auprès
     d'openhtmltopdf (`PdfRendererBuilder.useFont`, un appel par fichier avec son poids/style exact)
     — nécessaire pour que le texte PDF proprement dit (tout sauf les graphiques) résolve la police,
     et que `font-weight: bold`/`font-style: italic` en CSS pointent vers le vrai fichier gras/
     italique embarqué plutôt qu'un gras/italique synthétique.
- **Hiérarchie typographique**, taille de référence 16pt (Liberation Serif) :
  - **Titres de chapitre** (I — Vue d'ensemble, puis un par chantier) : 16pt gras, texte noir sans
    fond, souligné d'un filet fin.
  - **Sous-titres** (bandeau équipe, titre de chaque graphique) : 12-13pt gras, texte noir.
  - **Indicateurs KPI** : 10-13pt gras pour la valeur, 7.5pt gras pour son libellé, avec la rubrique
    « Indicateurs clés » au-dessus de chaque rangée.
  - **Tableau détaillé employé** (11 colonnes en équipe nommée, 12 dans le « reste ») : 10.5pt
    (8pt pour la colonne Fonction, 9pt pour la colonne Équipe).
  - **Captions/notes** (libellés de blocs d'en-tête, pied de page) : 6.5-10pt.
- **Aucun sommaire imprimé** : un rapport généré à la demande n'a pas besoin d'une table des
  matières.
- **Dimensions CSS en `pt` (point PDF), jamais `px`** (qui vaudrait 1/96 pouce et fausserait la
  géométrie une fois imprimée sur A4 réel — voir « Pagination : contrôle 100 % Java »).
- **Moteur CSS d'openhtmltopdf 1.0.x = CSS 2.1 pur, pas un moteur de navigateur moderne** : aucun
  support de `var()`/custom properties, flexbox (`display:flex`/`gap`/`align-items`/
  `justify-content`), `object-fit`, `text-overflow` (constaté empiriquement lors de la migration,
  voir les avertissements de compilation openhtmltopdf) — toute la mise en page horizontale de
  `rapport.css` utilise donc `float`+`margin` (jamais flexbox), toutes les couleurs sont des
  hexadécimaux littéraux. **Piège constaté** : une rangée de flottants dont la largeur cumulée
  correspond EXACTEMENT à la largeur de son conteneur peut repasser à la ligne (arrondi interne du
  moteur) — toujours laisser ~15-20pt de marge de sécurité sur la largeur du conteneur d'une rangée
  de flottants (voir `.cover .signatures` dans rapport.css).

### Numérotation des chapitres et des pages

**Chapitres** : `RapportPageModelBuilder.chapitreChantier(index, chantier)` numérote en chiffre
romain CHAQUE chantier de `vue.chantiers()` (déjà triée par masse décroissante), `index` étant sa
position dans cette liste.

**Pages** : `RapportPageModelBuilder.construire` décide lui-même, dans le MÊME passage, la liste
complète des pages et sur laquelle démarre chaque chapitre — il n'y a donc RIEN à découvrir après
coup, contrairement à l'ancien pipeline JasperReports (qui ne connaissait les numéros de page réels
qu'après une mise en page complète, et résolvait ça par un double remplissage : un passage de
découverte silencieux, puis un passage final avec le seuil réel injecté). Le texte "Niveau" de
chaque page (`PageModel.niveauTexte`) est déjà résolu au moment où la page est construite, de même
que "Page N / TOTAL" (`TOTAL = pages.size()`, trivialement connu une fois la liste complète
construite). `PaieReportHtmlPdfService` appelle donc openhtmltopdf **UNE SEULE fois** — un gain net
de temps de génération par rapport à l'ancien double remplissage.

### Composants et services principaux

| Fichier | Rôle |
|---|---|
| `PaiePerimetreService` | Périmètre Excel (sélection manuelle de sous-feuilles équipe) |
| `PaieExportService` / `PaieSheetWriter` / `PaieExcelStyles` | Génération du classeur Excel |
| `MaterielChantierCatalogue` | Règle métier partagée PDF/Excel : squelette parc matériel du chantier C168 |
| `PaieBiReportBuilder` | Périmètre + agrégations BI du rapport PDF, calcul de `avecDetailEquipe` par chantier à partir de la sélection manuelle — testé isolément (`PaieBiReportBuilderTest`) sans dépendre du repository via `construireDepuis` |
| `RapportPageModelBuilder` | Pagination pure Java (voir « Pagination : contrôle 100 % Java ») — testée isolément (`RapportPageModelBuilderTest`), aucun rendu |
| `PaieReportHtmlBuilder` | Construction du DOM (jsoup pur) à partir des `PageModel` déjà résolus |
| `RapportChartSvgBuilder` | Graphiques en SVG (voir « Visualisations ») |
| `RapportRessourcesStatiques` | Chargement unique des polices/CSS/logo |
| `PaieReportHtmlPdfService` | Orchestration + rendu PDF final (un seul appel openhtmltopdf) — testée de bout en bout par `PaieReportHtmlPdfServiceTest`, y compris un test de non-régression dédié à l'échappement (charge hostile dans une observation) |
| `PaieExportWizardComponent` (frontend) | Assistant d'export UNIQUE en étapes, PDF ou Excel, une seule sélection d'équipes pour les deux formats |
| `PaieService.exporter()` / `.telechargerRapportPdf()` / `.listerPeriodes()` / `.listerChantiersDeLaPeriode()` / `.listerTableauxMateriel()` (frontend) | Appels HTTP, aucune logique métier côté client |

Le logo Staport (`resources/report/paie/logo-staport.png`) est chargé une seule fois
(`RapportRessourcesStatiques`) et embarqué en **data-URI base64** (`data:image/png;base64,...`) dans
chaque balise `<img>` qui le référence (page de garde + bandeau de chaque page) — openhtmltopdf n'a
pas d'URI de base pour résoudre un chemin de fichier relatif (même contrainte que l'ancien pipeline
HTML pré-JasperReports), et une chaîne base64 fonctionne à l'identique quel que soit le nombre
d'éléments qui la référencent, contrairement à un flux qui ne se lit qu'une fois (piège déjà
rencontré côté JasperReports avec un `InputStream`, voir l'historique Git).

### Historique — pourquoi 3 pipelines

Ce rapport a été reconstruit 2 fois (2026-09-25 puis 2026-09-29), toujours pour la même raison de
fond : fiabiliser un document dont la pagination/le rendu se comportait de façon imprévisible.

1. **Thymeleaf + openhtmltopdf + JFreeChart** (pipeline d'origine) → abandonné pour 3 incidents de
   production précis : (a) une `SAXParseException` fatale — un commentaire CSS contenant
   littéralement `<td>`/`<tr>`, injecté SANS échappement via `th:utext` dans une balise `<style>`,
   avait fait planter le parseur XML strict d'openhtmltopdf ; (b) `"null"` affiché littéralement
   dans la colonne Obs — concaténation de chaîne brute sans null-check ; (c) une résolution de
   police fragile.
2. **JasperReports/JRXML** → a résolu les 3 points ci-dessus (binding de champ automatique avec
   null-check intégré, police embarquée programmatiquement, aucune concaténation de chaîne HTML) —
   mais a introduit sa propre catégorie de bugs : un comportement de pagination interne non
   documenté produisant des pages blanches, résolu par une longue série de corrections empiriques
   (voir l'historique Git de ce fichier avant le 2026-09-29 pour le détail complet, notamment
   `calculerSautPage` et ses multiples itérations).
3. **jsoup + openhtmltopdf + SVG fait main** (pipeline ACTUEL) → revient à un pipeline HTML, mais
   neutralise les 3 incidents historiques par construction (jsoup `Element.text(...)` échappe
   TOUJOURS, jamais de `.html(String)` — voir le Javadoc de `PaieReportHtmlBuilder`) et évite la
   catégorie de bugs JasperReports en ne déléguant JAMAIS de décision de pagination au moteur de
   rendu (voir « Pagination : contrôle 100 % Java »).

---

## Points d'extension

> Voir aussi [rapport-v2.md](rapport-v2.md) — journal détaillé de tout ce qui
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
- **Comparaison mois précédent au niveau équipe/section** : déjà en place (carte KPI "MASSE MOIS
  PRECEDENT" de chaque section, voir « Cartes KPI de section et tableau récap »).
- **Autres filtres du dialog (nom, CIN, fonction, chantier unique)** : volontairement non exposés
  par `PaieExportWizardComponent` (voir « Périmètre et filtres ») — un rapport de direction porte
  sur l'ensemble des chantiers/employés de la période, pas sur une recherche ponctuelle.
  `PaieReportPdfRequestDto` les garde optionnels pour un appel API direct ; à réexposer côté UI
  seulement si un besoin réel de rapport filtré se confirme.
- **Nouveaux indicateurs BI** : ajouter une mesure suit toujours le même chemin —
  `PaieBiReportBuilder` (calcul), un nouveau champ de vue-modèle si la forme ne rentre dans aucun
  existant, le `PageModel.Bloc` et le rendu `PaieReportHtmlBuilder` correspondants, une entrée dans
  le catalogue de KPI ci-dessus. Avant d'ajouter un KPI, vérifier qu'il répond à une question non
  déjà couverte pour
  éviter la duplication.
