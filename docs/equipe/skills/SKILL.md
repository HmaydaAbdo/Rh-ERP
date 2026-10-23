---
name: erp-rh-equipe
description: Use when changing the ERP-RH Equipe reference domain or its consumption by Paie.
---

# Skill — domaine Équipe

## Lire avant d'agir

- [README métier](../README.md)
- [Autorisations et dépendances de droits](../README.md#autorisations-et-dépendances-de-droits)
- [README Paie](../../paie/README.md) lorsque la consommation par la paie est concernée
- `conventions/architecture.md` et `conventions/database.md` selon le changement

## Périmètre

La fiche Employé porte l'équipe courante, facultative, alignée sur le dernier mois de paie importé.
Le référentiel partagé fournit les équipes sélectionnables et leur code/libellé. Chaque bulletin
conserve séparément l'équipe de son mois : changer l'affectation de l'employé ne modifie pas les
bulletins antérieurs. Les bulletins gardent une référence au référentiel; renommer l'équipe change le
code/libellé affiché dans les bulletins qui la référencent. Dans le formulaire Paie, le choix d'équipe
met à jour la fiche Employé et le bulletin dans la même transaction; ces opérations demandent
`PAIE_WRITE` et `EMPLOYEE_WRITE`.

## Garde-fous

- Respecter la distinction entre code métier et libellé d'affichage décrite dans le README.
- Le code est normalisé en majuscules et le code comme le libellé sont uniques sans casse ni espaces extérieurs.
- Ne pas introduire un état actif/inactif ni rendre obligatoire l'équipe sur les bulletins sans nouvelle décision métier.
- Refuser la suppression si un bulletin Paie ou une fiche Employé référence l'équipe; la contrainte de base est la protection finale.
- Les formulaires Paie peuvent exiger `EQUIPE_READ` en plus de leur permission Paie ; vérifier la
  matrice RBAC lorsque l'accès frontend ou les appels changent.
- Le référentiel s'importe depuis un classeur Excel; l'import est une création atomique et une seule ligne invalide rejette le fichier entier.
- Mettre à jour la section Autorisations de [../README.md](../README.md) et les documents transverses
  concernés (catalogue RBAC, modèle de données) avec tout changement correspondant.

## Vérification

Utiliser la matrice de scénarios et les fichiers de tests du [README Équipe](../README.md#vérifications-et-tests).
Elle associe à chaque règle un test ciblé : normalisation/unicité, équipe facultative, indicateurs par
période, code historique, suppression avec références Paie et Employé, import et droits. Exécuter
les tests d'intégration PostgreSQL dès qu'une relation, une contrainte ou une migration change.
