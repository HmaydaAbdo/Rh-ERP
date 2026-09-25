# Module Report (Paie)

> Documentation dédiée à l'export/reporting de la paie — distincte de `docs/paie/README.md`
> (domaine métier Paie : entité, import Excel, API CRUD). Ce document couvre uniquement la
> génération de documents à partir des bulletins de paie (Excel aujourd'hui, PDF à redessiner) :
> architecture, structure des feuilles/sections, paramétrage chantier/équipe, composants
> impliqués et points d'extension.

---

## Rôle du module

Produire, pour une période donnée (aaaa-MM), des documents dérivés des bulletins de paie
(`Paie`) sans jamais les modifier : un classeur Excel multi-feuilles aujourd'hui, un rapport PDF
mis en forme (en cours de refonte). Les deux formats partagent la **même lecture des données** —
aucune duplication de la logique de regroupement/filtrage chantier/équipe entre eux.

---

## Architecture

Trois packages backend, un principe : la logique de périmètre (quelles lignes vont sur quelle
feuille/section) est calculée une seule fois et consommée par les deux formats de sortie.

```text
staport.rh.paie.reporting/   ← logique de périmètre, partagée Excel + PDF
├── PaiePerimetreService.java    Calcule le périmètre : GLB + par chantier, équipes à séparer,
│                                 inclusions/exclusions. Point d'entrée unique.
├── PerimetrePaie.java            Résultat : lignes globales + total mois précédent + Map<code, PerimetreChantier>
├── PerimetreChantier.java        Résultat par chantier : lignes retenues, lignes par équipe à générer, totaux
├── FeuillesEquipeMode.java       Enum : AUCUNE / TOUTES / PERSONNALISE
└── ObservationStc.java           Détection observation "STC"/"sortie" (colonne STC du récapitulatif)

staport.rh.paie.export/      ← sortie Excel (Apache POI)
├── PaieExportController.java     POST /paie/export
├── PaieExportService.java        Orchestration : appelle PaiePerimetreService, écrit les feuilles
├── PaieSheetWriter.java          Mise en page d'UNE feuille (partagée GLB/chantier/équipe)
├── PaieExcelStyles.java          Styles POI (en-têtes, bordures, formats numériques)
├── SqueletteMateriel.java        Cas particulier chantier C168 (tableau matériel à main levée)
└── PaieExportRequestDto.java     Corps de la requête

staport.rh.paie.report/      ← sortie PDF (Thymeleaf + openhtmltopdf) — en cours de refonte UX
├── PaieReportController.java     POST /paie/report/pdf
├── PaieReportPdfService.java     Orchestration : appelle PaiePerimetreService, rend le HTML, produit le PDF
├── PaieReportViewModelBuilder.java  PerimetrePaie → vue-modèle formatée pour le template
├── RapportPaieVue / ChantierRapportVue / EquipeRapportVue / LigneVue / TotauxVue / EffectifFonctionVue
│                                 Vue-modèle (records), aucune logique métier
├── PaieReportFontProvider.java   Police embarquée pour le rendu PDF (accents FR)
├── PaieReportNumberFormat.java   Formatage des nombres identique à l'Excel
└── PaieReportPdfRequestDto.java  Corps de la requête — même forme que PaieExportRequestDto
```

Frontend (`frontend/src/app/portail/paie/`) :

```text
export-excel/
└── PaieExportExcelDialogComponent   Dialog dédié à l'export Excel (bouton "Exporter Excel")

list/
└── PaieListComponent                Bouton + dialog "Exporter PDF" — configuration équipe reprise
                                      telle quelle de l'ancien dialog combiné ; UX à redessiner
                                      (voir « Points d'extension » plus bas), non traitée ici.
```

---

## Fonctionnalités actuelles

- **Export Excel** : dialog dédié, propre bouton "Exporter Excel" sur `/paie`, propre configuration
  (voir ci-dessous).
- **Rapport PDF** : toujours généré depuis le dialog "Exporter PDF" de `PaieListComponent`, sur le
  même schéma de configuration que l'ancien export combiné (période, `feuillesEquipeMode`,
  sélection de chantiers/équipes, et un filtre optionnel `chantiers` qui restreint tout le rapport).
  Cette UX PDF **n'a pas encore été redessinée** pour suivre le modèle Excel décrit ici — elle fait
  l'objet d'une prochaine itération distincte.

---

## Logique de l'export Excel

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
champ `chantiers` existe dans `PaieExportRequestDto`/`PaieReportPdfRequestDto` (restriction de tout
le périmètre par code chantier, y compris GLB) mais n'est **plus exposé par le dialog Excel** —
conservé dans le contrat pour ne pas casser un appel API existant, voir « Points d'extension ».

---

## Structure des feuilles générées

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

---

## Paramétrage chantier/équipe

Piloté par trois champs de la requête (`PaieExportRequestDto`/`PaieReportPdfRequestDto`), calculés
côté frontend et interprétés par `PaiePerimetreService.calculer` :

| Champ | Rôle |
|---|---|
| `feuillesEquipeMode` | `AUCUNE` (aucune sous-feuille équipe) ou `PERSONNALISE` (liste explicite via `equipesParChantier`). `TOUTES` existe dans l'enum et reste supportée par le backend (une sous-feuille par équipe trouvée, pour chaque chantier), mais n'est **plus produite par le dialog Excel actuel** — conservée pour compatibilité API, voir « Points d'extension ». |
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

---

## Règle Include/Exclude d'une équipe dans la feuille chantier

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

Backend : `equipesExcluesFeuilleChantier` est indépendant de `equipesParChantier` (une équipe peut
en théorie être exclue de la feuille chantier sans avoir sa propre sous-feuille) — le dialog Excel
restreint volontairement cette possibilité : l'UI ne propose le toggle Inclure/Exclure que pour les
équipes déjà choisies comme "à séparer", pour garder une hiérarchie de configuration simple
(Période → Chantiers concernés → Équipes à séparer → Inclure/Exclure). La capacité plus large reste
disponible pour un appel direct à l'API.

---

## Composants et services principaux

| Fichier | Rôle |
|---|---|
| `PaiePerimetreService` | Source unique de vérité du périmètre — jamais dupliquée entre Excel et PDF |
| `PaieExportService` / `PaieSheetWriter` / `PaieExcelStyles` | Génération du classeur Excel |
| `PaieReportPdfService` / `PaieReportViewModelBuilder` | Génération du rapport PDF |
| `PaieExportExcelDialogComponent` (frontend) | UX dédiée à la configuration de l'export Excel |
| `PaieService.exporter()` / `.telechargerRapportPdf()` / `.listerEquipes()` (frontend) | Appels HTTP, aucune logique métier côté client |

---

## Points d'extension prévus pour le futur export PDF

Le contrat backend (`PaiePerimetreService.calculer`, `PaieReportPdfRequestDto`) est déjà partagé et
stable — la refonte de l'expérience PDF, traitée dans une itération séparée, portera uniquement sur
le frontend :

- Créer un dialog PDF dédié (sur le modèle de `PaieExportExcelDialogComponent`), avec son propre
  bouton, remplaçant le dialog "Exporter PDF" actuel de `PaieListComponent` (encore sur l'ancienne
  UX combinée Excel/PDF).
- Décider si la même hiérarchie de configuration équipe (Chantiers concernés → Équipes à séparer →
  Inclure/Exclure) s'applique telle quelle au PDF, ou si le rendu PDF (une section par
  chantier/équipe dans un seul document, contrairement aux onglets Excel) appelle une présentation
  différente.
- Décider du sort du filtre `chantiers` actuellement encore exposé dans le dialog PDF existant
  (restreint tout le rapport, y compris la section GLB) : le garder, l'aligner sur l'invariant
  Excel ("GLB et chantiers toujours complets"), ou le retirer également — à trancher avec
  l'utilisateur avant implémentation (changement de comportement, voir
  `conventions/architecture.md`).
- Ajouter le logo Staport dans l'en-tête du PDF (fragment `hero` de
  `resources/report/paie/fragments.html`) — aucun fichier logo n'existe encore dans le dépôt à ce
  jour ; voir le commentaire dédié dans `docs/paie/README.md` (section "Rapport PDF") pour la
  méthode d'intégration (classpath + base64, le moteur de rendu PDF n'ayant pas d'URI de base pour
  résoudre un chemin relatif).
