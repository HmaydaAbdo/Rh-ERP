---
name: erp-rh-equipe
description: Use when changing the ERP-RH Equipe reference domain or its consumption by Paie.
---

# Skill — domaine Équipe

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions](../README.md#permissions)
- [README Paie](../../paie/README.md) lorsque la consommation par la paie est concernée
- `conventions/architecture.md` et `conventions/database.md` selon le changement

## Périmètre

La fiche Employé porte l'équipe courante, facultative, alignée sur le dernier mois de paie importé.
Le référentiel partagé fournit les équipes sélectionnables et leur code/libellé. Le libellé est la
valeur sémantique utilisée dans les choix et regroupements; les codes servent aux imports et échanges.
Chaque bulletin
conserve séparément l'équipe de son mois : changer l'affectation de l'employé ne modifie pas les
bulletins antérieurs. Les bulletins gardent une référence au référentiel; renommer l'équipe change le
code/libellé affiché dans les bulletins qui la référencent. Dans le formulaire Paie, le choix d'équipe
met à jour la fiche Employé et le bulletin dans la même transaction; ces opérations demandent
`PAIE_WRITE` et `EMPLOYEE_WRITE`.

### Vues de collection

La coque, le Tabulaire, les Cartes et l'Analytique sont des composants configurables partagés. Le module Équipe déclare
le parcours fixe des Cartes **Équipe → Chantier → Fonction**. Les Cartes et l'Analytique lisent toujours le dernier mois
de paie enregistré; l'utilisateur ne choisit pas de période pour ces vues. Le résumé des Cartes donne le nombre d'équipes
référencées, l'effectif en personnes et la masse salariale en DH, sans chiffre provenant des fiches Employé. Le groupe « Orphelins » reste disponible dans les filtres et les graphiques analytiques; il ne constitue pas une carte du référentiel. Le graphique de qualité des rattachements est distinct des graphiques de répartition : il apparaît uniquement
dans une section dédiée de l'Analytique, sous forme d'anneau avec ses propres filtres Chantier et Fonction. Il n'apparaît ni
dans le Tabulaire ni dans Cartes et s'exporte seul en PDF.
Il est soumis à `PAIE_READ` : sans ce droit, les données de Paie ne sont ni demandées ni affichées.
L'Analytique inclut les bulletins orphelins dans son périmètre Paie, même si aucune équipe correspondante n'est présente au catalogue.
Tous les sélecteurs d'équipe de filtre proposent également l'option « Orphelins (sans équipe) » via l'identifiant de filtre `0`.
Dans un formulaire d'affectation, ce choix est converti en `null`; l'identifiant synthétique n'est jamais envoyé pour écriture.
Elle présente la répartition par équipe
sur ce mois et son évolution mensuelle pour une équipe sélectionnée. Chaque graphique propose un multisélecteur déroulant d'Effectif
(personnes), Masse salariale (DH), STC (personnes) et STC (DH); chaque indicateur coché s'affiche dans son propre graphique.
Tous ces multisélecteurs et filtres permettent la recherche et le chargement des options au défilement, conformément à la convention frontend commune.
Le filtre Chantier est présent dans chacune des deux cartes de graphique, s'applique aux deux et reste synchronisé dans l'URL.
Elle ne présente pas les indicateurs génériques des
domaines Employé et Paie. Les tableaux de données restent repliés à l'écran jusqu'à l'action « Voir les données ».
Chaque graphique s'exporte séparément en PDF avec ses données complètes. Ne pas créer de version
propre au domaine ni permettre de changer librement l'ordre du parcours; suivre la
[convention frontend](../../../conventions/frontend.md) et la
[référence technique des vues partagées](../../frontend/vues-perimetre.md).

Chaque carte affiche séparément Effectif (personnes), Masse salariale (DH), STC (personnes) et STC (DH), avec
le libellé et la valeur du dernier mois enregistré. La comparaison porte sur le mois calendaire précédent : écart
en personnes et pourcentage en DH. Un groupe sans ligne au mois précédent enregistré est comparé à zéro; si aucune
paie n'est enregistrée sur ce mois, ou si la lecture échoue, la comparaison reste indisponible. Ne pas afficher une
variation en pourcentage quand le montant précédent est nul.

Les cartes mettent le **libellé** en titre et le code en repère secondaire. Chaque composant qui expose des données conserve
son export PDF séparé, borné au périmètre et aux permissions actifs. Les exports sont des documents métier partageables : titre
explicite, période, périmètre et date d'édition; leurs tableaux complets sont inclus même si ceux de l'écran sont repliés.
Les filtres sont conservés entre les vues; les onglets
remplacent les liens d'accès directs vers la liste et les employés.

## Couches et points de contrôle

Le détail de chaque couche est dans le [README Équipe](../README.md#les-couches-du-domaine). Avant de modifier le domaine,
repérer la couche touchée et vérifier ses points de contrôle.

| Couche | Ce qu'elle contient | À vérifier quand on la modifie |
|---|---|---|
| **Application** | `EquipeController`, `EquipeImportController`, `EquipeService` / `IEquipeService`, `EquipeSpecification`, import atomique, audit (`EQUIPE_*`, `PerimetreImportEquipe`), migrations `V7`, `V8`, `V25`, `V32`, `V34` ; côté Angular `portail/equipe/` (routes gardées, liste, formulaire, détail, actions, filtres) | Normalisation du code et unicité (service **et** index `UPPER(BTRIM)`) ; `409` à la suppression par la clé étrangère ; version optimiste ; une permission par route ; entrée d'audit pour chaque écriture ; migration testée sur base vide |
| **Analytique** | `equipe-module.ts` (dimension `EQUIPE`, parcours Équipe → Chantier → Fonction, source `PAIE`), `POST /paie/analytique` (`parEquipe`, `evolution`, `qualite`), orphelins `equipeIds = 0` | Dernier mois de paie fixe ; effectif, masse et STC d'une seule source (les bulletins) ; comparaison indisponible plutôt que zéro ; « Orphelins » jamais enregistré ; sans `PAIE_READ` aucun appel ; mêmes définitions que le rapport PDF et l'assistant |
| **IA** | Outils MCP `equipe_rechercher`, `equipe_fiche`, `paie_repartition` (`EQUIPE`), filtres `equipeIds` des outils Paie et Employé ; suggestions et contexte de l'écran `/equipes` | Lecture seule ; permission `EQUIPE_READ` / `PAIE_READ` par outil ; description d'outil à jour (l'agent y lit comment filtrer) ; identifiant `0` = sans équipe ; chaque nombre vérifié contre les outils ; pas de périmètre par fiche de poste avant J2 |


## Garde-fous

- Utiliser le libellé comme clé sémantique pour les sélections et regroupements présentés aux utilisateurs. Le code sert aux échanges et imports; les relations persistées restent fondées sur l'identifiant interne.
- Le code est normalisé en majuscules et le code comme le libellé sont uniques sans casse ni espaces extérieurs.
- Ne pas introduire un état actif/inactif ni rendre obligatoire l'équipe sur les bulletins sans nouvelle décision métier.
- Refuser la suppression si un bulletin Paie ou une fiche Employé référence l'équipe; la contrainte de base est la protection finale.
- Les formulaires Paie peuvent exiger `EQUIPE_READ` en plus de leur permission Paie ; vérifier la
  matrice RBAC lorsque l'accès frontend ou les appels changent.
- Le référentiel s'importe depuis un classeur Excel; l'import est une création atomique et une seule ligne invalide rejette le fichier entier.
- L'Analytique lit le dernier mois de Paie pour l'indicateur de qualité des rattachements; le groupe « Orphelins » n'est visible que si son effectif est supérieur à zéro.
- La répartition analytique inclut la ligne « Orphelins » lorsque le dernier mois contient des bulletins sans équipe; le filtre de suivi `equipeIds=0` affiche leur évolution historique.
- Mettre à jour la section Autorisations de [../README.md](../README.md) et les documents transverses
  concernés (catalogue RBAC, modèle de données) avec tout changement correspondant.

## Vérification

Utiliser la matrice de scénarios et les fichiers de tests du [README Équipe](../README.md#scénarios-de-vérification-associés).
Elle associe à chaque règle un test ciblé : normalisation/unicité, équipe facultative, indicateurs par
période, code historique, suppression avec références Paie et Employé, import et droits. Pour la
cohérence des orphelins, vérifier `analytique-perimetre.component.spec.ts` et les tests des vues Équipe.
Exécuter les tests d'intégration
PostgreSQL dès qu'une relation, une contrainte ou une migration change.

## Sélecteurs et revue visuelle

Réutiliser exclusivement le contrôle partagé pour les listes simples et multiples, avec recherche et
options au défilement. Afficher Fonction par libellé, Équipe par code et libellé, Chantier par code et
nom (désignation si le nom est absent). Vérifier les trois vues dans les deux thèmes et sur téléphone,
le changement de source des options, les exports et les filtres conservés dans l'URL.
