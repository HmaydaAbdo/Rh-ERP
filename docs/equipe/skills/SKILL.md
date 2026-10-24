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
de paie enregistré; l'utilisateur ne choisit pas de période pour ces vues. L'Analytique présente la répartition par équipe
sur ce mois et son évolution mensuelle pour une équipe sélectionnée. Les deux graphiques proposent Effectif (personnes),
Masse salariale (DH), STC (personnes) et STC (DH), avec des sélections d'indicateur indépendantes. Le filtre Chantier
s'applique à la répartition et à l'évolution et reste synchronisé dans l'URL. Elle ne présente pas les indicateurs génériques des
domaines Employé et Paie. Les tableaux de données restent repliés à l'écran jusqu'à l'action « Voir les données ».
Chaque graphique s'exporte séparément en PDF avec ses données complètes. Ne pas créer de version
propre au domaine ni permettre de changer librement l'ordre du parcours; suivre la
[convention frontend](../../../conventions/frontend.md) et la
[référence technique des vues partagées](../../frontend/vues-perimetre.md).

Les cartes mettent le **libellé** en titre et le code en repère secondaire. Chaque composant qui expose des données conserve
son export PDF séparé, borné au périmètre et aux permissions actifs. Les exports sont des documents métier partageables : titre
explicite, période, périmètre et date d'édition; leurs tableaux complets sont inclus même si ceux de l'écran sont repliés.
Les filtres sont conservés entre les vues; les onglets
remplacent les liens d'accès directs vers la liste et les employés.

## Garde-fous

- Utiliser le libellé comme clé sémantique pour les sélections et regroupements présentés aux utilisateurs. Le code sert aux échanges et imports; les relations persistées restent fondées sur l'identifiant interne.
- Le code est normalisé en majuscules et le code comme le libellé sont uniques sans casse ni espaces extérieurs.
- Ne pas introduire un état actif/inactif ni rendre obligatoire l'équipe sur les bulletins sans nouvelle décision métier.
- Refuser la suppression si un bulletin Paie ou une fiche Employé référence l'équipe; la contrainte de base est la protection finale.
- Les formulaires Paie peuvent exiger `EQUIPE_READ` en plus de leur permission Paie ; vérifier la
  matrice RBAC lorsque l'accès frontend ou les appels changent.
- Le référentiel s'importe depuis un classeur Excel; l'import est une création atomique et une seule ligne invalide rejette le fichier entier.
- Mettre à jour la section Autorisations de [../README.md](../README.md) et les documents transverses
  concernés (catalogue RBAC, modèle de données) avec tout changement correspondant.

## Vérification

Utiliser la matrice de scénarios et les fichiers de tests du [README Équipe](../README.md#scénarios-de-vérification-associés).
Elle associe à chaque règle un test ciblé : normalisation/unicité, équipe facultative, indicateurs par
période, code historique, suppression avec références Paie et Employé, import et droits. Exécuter
les tests d'intégration PostgreSQL dès qu'une relation, une contrainte ou une migration change.
