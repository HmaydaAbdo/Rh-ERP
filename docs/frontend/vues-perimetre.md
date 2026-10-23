# Vues Cartes et Analytique partagées (`portail/perimetre/`)

> Les vues **Cartes** et **Analytique** de tous les modules — Paie, Employés, Équipes, Fonctions, Chantiers — sont les deux
> mêmes composants. Ce document est la référence technique ; la règle est dans
> [`conventions/frontend.md`](../../conventions/frontend.md) (« Cartes par niveaux et Analytique graphique ») et la décision
> dans l'[ADR 0011](../adr/0011-vues-cartes-analytique-par-perimetre.md).

---

## Les pièces

| Fichier | Rôle |
|---|---|
| `perimetre.ts` | Types et fonctions pures sur l'URL : `lirePerimetre`, `etapeChoisie`, `niveauAffiche`, `porteeDe`, `porteeVide`, `versParametresPerimetre`, `critereEmployesDe`, `criterePaieDe` |
| `perimetre-module.ts` | `ModulePerimetre` (ce qui distingue un module), `CatalogueModule`, `ItemCatalogue`, `chargerToutLeReferentiel` |
| `perimetre-groupes.ts` | `GroupeCarte`, `fusionnerGroupes` (référentiel + fiches + paie), `lignesPaie`, `nomGroupe`, `variations` |
| `cartes/cartes-perimetre.component.*` | `CartesPerimetreComponent` (`app-cartes-perimetre`) |
| `analytique/analytique-perimetre.component.*` | `AnalytiquePerimetreComponent` (`app-analytique-perimetre`) |
| `analytique/graphiques-perimetre.ts` | Options des graphiques, `libelleTranche`, `libelleTrancheTotal`, `hauteurPourLignes` |

Chaque module écrit `<module>-module.ts` (`moduleChantier(service)`, `moduleEquipe(service)`, `moduleFunction(service)`,
`MODULE_EMPLOYE`, `MODULE_PAIE`) et deux hôtes minces (`<module>-cartes.component.ts`, `<module>-analytique.component.ts`).

## Le périmètre dans l'URL

| Paramètre | Sens |
|---|---|
| `chantierIds`, `fonctionIds` | Identifiants (entiers > 0, séparés par des virgules) |
| `equipeIds` | Identifiants ; `0` = bulletins et fiches sans équipe |
| `periode` | Mois de paie `AAAA-MM` |
| `par` | Cartes seulement : `chantier`, `equipe`, `fonction`, `employes`, `periode` |

Une dimension portant **exactement une valeur** est une **étape** du fil. Plusieurs valeurs (barre de filtres multiple des
Employés et de la Paie) restreignent le périmètre sans être une étape. Les filtres propres au module (`code`, `designation`,
`actif`, `libelle`, `nom`, `cin`, `statut`…) s'ajoutent à ces paramètres.

## Cartes

**Niveau affiché** (`niveauAffiche`) : le `par` demandé s'il est possible ; sinon, pour le module Paie sans mois, la liste des
mois (`PERIODE`) ; sinon la première dimension de l'ordre du module qui n'est pas une étape ; sinon les employés (avec
`EMPLOYEE_READ`) ou le dernier regroupement.

**Sources d'un niveau-dimension** (en parallèle, chacune indépendante) :

| Source | Appel | Droit |
|---|---|---|
| Référentiel du module | `catalogue.charger(params)` | celui du module |
| Fiches Employé | `POST /employees/regroupements?dimension=…` | `EMPLOYEE_READ` |
| Paie du mois | `POST /paie/analytique` | `PAIE_READ` |
| Paie du mois contigu | `POST /paie/analytique` (`periode − 1`) | `PAIE_READ` |

**Portée** : les identifiants du périmètre, plus ceux du référentiel quand ses filtres propres le restreignent. Une restriction
vide (aucun élément ne correspond) n'interroge aucune source.

**Cartes** (`fusionnerGroupes`) : au niveau de la dimension du module et sans autre dimension restreinte, le référentiel est
**exhaustif** (une carte par entrée, à zéro sans données) ; sinon il ne fait que décorer (statut, désignation, lien) les groupes
qui ont des fiches ou des bulletins. `variations` compare au mois contigu : pourcentage pour les montants, écart pour les
personnes, rien sans mois contigu.

**Action** : ouvrir une carte pose l'étape (`<dimension>Ids=<id>`) et retire `par` ; ouvrir une carte de mois pose `periode`.

**Extension** : un hôte projette un gabarit `#actionsCarte` (contexte : `groupe`, `niveau`, `periode`, `portee`) ; il recharge
le niveau avec `recharger()` (vue enfant `CartesPerimetreComponent`).

## Analytique

Même périmètre et même portée que les Cartes. Blocs, dans l'ordre :

1. En-tête : titre, mois (sauf module à niveau « mois », dont la barre le porte), lien « Voir les cartes », fil d'étapes.
2. **Paie** (`PAIE_READ`) : chiffres du mois et variation sur le mois précédent ; **évolution mensuelle** (une mesure, un axe :
   masse, effectif, STC personnes, STC DH ; mois analysé agrandi) ; **répartition** en barres par la dimension choisie
   (« Répartir par », masse ou effectif, les 12 plus grands groupes, tableau complet avec STC et bouton « Approfondir ») ;
   qualité des données ; tranches de total ; mouvements mois par mois (`POST /paie/effectifs`).
3. **Fiches Employé** (`EMPLOYEE_READ`) : chiffres clés, pyramide des âges, ancienneté, répartition en poste / sortis.

Un clic sur une barre ou sur « Approfondir » ajoute le groupe au périmètre. Un mois sans bulletin garde l'historique et
affiche des indicateurs à zéro. Le module à niveau « mois » (Paie) ouvre le mois le plus récent en l'inscrivant dans l'URL.

## Ce que chaque module apporte

| Module | Dimension | Ordre de descente | Référentiel | Particularités |
|---|---|---|---|---|
| Chantiers | `CHANTIER` | chantier → équipe → fonction | code, nom/désignation, statut En cours / Clôturé | filtres code, désignation, statut |
| Équipes | `EQUIPE` | équipe → chantier → fonction | code, libellé | filtres code, libellé |
| Fonctions | `FONCTION` | fonction → chantier → équipe | libellé | filtre libellé |
| Employés | aucune | chantier → équipe → fonction | aucun | nom, CIN, statut sur les fiches (nom et CIN aussi sur la paie) ; pas de lien « Voir les employés » |
| Paie | aucune | chantier → équipe → fonction | aucun | liste des mois en premier niveau ; suppression en groupe par carte (`PAIE_PURGE`) |

## Tests

`perimetre.spec.ts`, `perimetre-groupes.spec.ts`, `cartes-perimetre.component.spec.ts`, `analytique-perimetre.component.spec.ts`,
`graphiques-perimetre.spec.ts` ; un `<module>-module.spec.ts` par module ; `paie-cartes.component.spec.ts` (niveau « mois »,
suppression en groupe) ; E2E `chantiers.spec.ts`, `fonctions.spec.ts`, `employes.spec.ts`, `paie.spec.ts` et le parcours
`full-stack`.
