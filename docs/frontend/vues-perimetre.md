# Vues Cartes et Analytique partagées (`portail/perimetre/`)

> Les vues **Cartes** et **Analytique** de tous les modules — Paie, Employés, Équipes, Fonctions, Chantiers — sont les deux
> mêmes composants. Ce document est la référence technique ; la règle est dans
> [`conventions/frontend.md`](../../conventions/frontend.md) (« Cartes par niveaux et Analytique graphique ») et les décisions
> dans l'[ADR 0011](../adr/0011-vues-cartes-analytique-par-perimetre.md) et l'[ADR 0014](../adr/0014-vues-partagees-parcours-metier-configurables.md).

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
| `chantierIds` | Identifiants ; `0` = fiches Employé sans chantier (inactives) |
| `periode` | Mois de paie `AAAA-MM` |
| Hiérarchie | Cartes suit l'ordre déclaré par le domaine; aucune valeur d'URL ne permet de le remplacer |

Une dimension portant **exactement une valeur** est une **étape** du fil. Plusieurs valeurs (barre de filtres multiple des
Employés et de la Paie) restreignent le périmètre sans être une étape. Les filtres propres au module (`code`, `designation`,
`actif`, `libelle`, `nom`, `cin`, `statut`…) s'ajoutent à ces paramètres.

## Cartes

**Niveau affiché** (`niveauAffiche`) : la première dimension de la hiérarchie du module qui n'est pas encore une étape ; puis
les employés (avec `EMPLOYEE_READ`). Paie commence par la liste des mois tant qu'aucun mois n'est choisi. Les anciens liens
avec `par` suivent désormais la hiérarchie déclarée.

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
qui ont des fiches ou des bulletins. Quand `PAIE_READ` est accordée, chaque carte présente séparément Effectif (personnes),
Masse salariale (DH), STC (personnes) et STC (DH), avec leur libellé et leur valeur. La comparaison porte sur le mois
calendaire contigu : écart pour les effectifs, pourcentage pour les montants. Si le mois précédent existe mais qu'un groupe
n'y figure pas, ses valeurs de comparaison sont zéro. Sans paie enregistrée sur ce mois, la carte indique que la comparaison
est indisponible; une base monétaire nulle n'est jamais divisée.

**Action** : ouvrir une carte pose l'étape (`<dimension>Ids=<id>`) et fait avancer à l'étape suivante ; ouvrir une carte de mois pose `periode`.

**Chargement et erreurs** : un changement de périmètre retire les résultats précédents pendant la
lecture et annule la requête en cours. Une erreur de référentiel, de première page Employé ou de
liste des mois affiche un message avec réessai; elle n'est jamais présentée comme un périmètre vide.
Une panne des fiches, de la paie du mois ou du mois de comparaison est identifiée séparément et
laisse visibles les autres sources disponibles. Une paie indisponible n'est pas remplacée par des
indicateurs à zéro; une comparaison indisponible n'est pas une variation nulle. Le réessai recharge
le même périmètre et relit les périodes si leur lecture a échoué.

Au niveau Employés, « Afficher plus » ne charge qu'une page à la fois. La page suivante est validée
uniquement après réception : après un échec, les fiches déjà chargées restent visibles et le réessai
demande la même page. Une suite appartenant à un ancien périmètre est annulée et ne peut pas
s'ajouter au nouveau résultat.

**Équipe** : Cartes fixe les chiffres Paie sur le dernier mois présent dans `GET /paie/periodes`; les agrégats de fiches Employé
ne sont pas chargés ni mélangés à l'effectif Paie. Le parcours s'arrête à Fonction, sans étape d'employés. Aucun sélecteur de période
n'est affiché. Les raccourcis vers la liste et les employés sont masqués car la coque fournit déjà les onglets des vues.
Le passage d'une vue à l'autre conserve les filtres et le périmètre métier, mais retire tout ancien paramètre `periode`.

**Extension** : un hôte projette un gabarit `#actionsCarte` (contexte : `groupe`, `niveau`, `periode`, `portee`) ; il recharge
le niveau avec `recharger()` (vue enfant `CartesPerimetreComponent`).

## Analytique

Même périmètre et même portée que les Cartes. L'ordre des sources est déclaré par chaque module dans `ordreAnalytique`.
Le chargement masque les chiffres du périmètre précédent. Une erreur de période, de source ou de répartition est
annoncée avec reprise; les autres sources disponibles restent consultables et une erreur ne devient pas un zéro métier.
Les projections restent indépendantes et chaque source conserve son bloc et ses permissions. Les référentiels mettent les
effectifs Employé en premier; le module Paie met ses indicateurs Paie en premier.

Tous les filtres et sélecteurs des vues utilisent `stp-select` ou `app-lazy-select`. La recherche est toujours disponible;
les longues listes métier sont recherchées et paginées côté serveur, tandis que les listes finies sont recherchables et
révélées par blocs lors du défilement dans le composant partagé.

Un module peut activer un panneau analytique dédié à sa dimension avec `vueEffectifParDimension`. Dans Équipe, ce panneau
utilise `PAIE_READ` et le dernier mois disponible pour la répartition des effectifs payés par équipe. Le sélecteur de période,
« Répartir par » et les panneaux génériques Employé/Paie sont masqués. Un sélecteur d'équipe pilote l'évolution historique
mensuelle de son effectif. Le mois courant reste celui qui est le plus récent dans la base; l'évolution conserve l'historique.
Chaque composant exportable capture tous ses graphiques et inclut le tableau complet associé dans le PDF, avec période,
filtres et périmètre lisibles. L'évolution mensuelle conserve toutes les colonnes de données, quel que soit l'indicateur
choisi à l'écran. Les exports individuels restent disponibles.

1. En-tête : titre, mois (sauf module à niveau « mois », dont la barre le porte), lien « Voir les cartes », fil d'étapes.
2. **Paie** (`PAIE_READ`) : chiffres du mois et variation sur le mois précédent ; **évolution mensuelle** (une mesure, un axe :
   masse, effectif, STC personnes, STC DH ; mois analysé agrandi) ; **répartition** en barres par la dimension choisie
   (« Répartir par », masse ou effectif, les 12 plus grands groupes, tableau complet avec STC et bouton « Approfondir ») ;
   qualité des données ; tranches de total ; mouvements mois par mois (`POST /paie/effectifs`), selon les mêmes dimensions,
   nom et CIN que les autres projections Paie. Le statut de la fiche Employé ne filtre que les fiches.
3. **Fiches Employé** (`EMPLOYEE_READ`) : chiffres clés, pyramide des âges, ancienneté, répartition en poste / sortis.

Un clic sur une barre ou sur « Approfondir » ajoute le groupe au périmètre. Un mois sans bulletin garde l'historique et
affiche des indicateurs à zéro. Le module à niveau « mois » (Paie) ouvre le mois le plus récent en l'inscrivant dans l'URL.

## Ce que chaque module apporte

| Module | Dimension | Hiérarchie Cartes | Priorité Analytique | Référentiel | Particularités |
|---|---|---|---|---|---|
| Chantiers | `CHANTIER` | chantier → équipe → fonction → employés | Employé puis Paie | code, nom/désignation, statut En cours / Clôturé | filtres code, désignation, statut |
| Équipes | `EQUIPE` | équipe → chantier → fonction | Effectif payé par équipe, mois le plus récent | code, libellé | filtres code/libellé conservés entre vues; pas de sélecteur de période; évolution historique de l'équipe choisie |
| Fonctions | `FONCTION` | fonction → chantier → équipe → employés | Employé puis Paie | libellé | filtre libellé |
| Employés | aucune | chantier → équipe → fonction → employés | Employé puis Paie | aucun | nom, CIN, statut sur les fiches (nom et CIN aussi sur la paie) ; pas de lien « Voir les employés » |
| Paie | aucune | mois → chantier → équipe → fonction → employés | Paie puis Employé | aucun | suppression en groupe par carte (`PAIE_PURGE`) |

## Tests

`perimetre.spec.ts`, `perimetre-groupes.spec.ts`, `cartes-perimetre.component.spec.ts`, `analytique-perimetre.component.spec.ts`,
`graphiques-perimetre.spec.ts` ; un `<module>-module.spec.ts` par module ; `paie-cartes.component.spec.ts` (niveau « mois »,
suppression en groupe) ; chaque coque de module vérifie que sa barre de filtres fusionne ses valeurs avec l'URL ; E2E `chantiers.spec.ts`,
`equipes.spec.ts`, `fonctions.spec.ts`, `employes.spec.ts`, `paie.spec.ts` et le parcours `full-stack`.
