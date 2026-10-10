---
name: erp-rh-equipe
description: Use when changing the ERP-RH Equipe reference domain or its consumption by Paie.
---

# Skill — domaine Équipe

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/equipe.md)
- [README Paie](../../paie/README.md) lorsque la consommation par la paie est concernée
- `conventions/architecture.md` et `conventions/database.md` selon le changement

## Périmètre

Référentiel partagé des équipes. Les autres domaines passent par `IEquipeService`. Paie conserve
une référence d'équipe dans son bulletin selon le modèle documenté.

## Garde-fous

- Respecter la distinction entre code métier et libellé d'affichage décrite dans le README.
- Ne pas introduire un état actif/inactif ni modifier les règles de suppression sans décision métier.
- Les formulaires Paie peuvent exiger `EQUIPE_READ` en plus de leur permission Paie ; vérifier la
  matrice RBAC lorsque l'accès frontend ou les appels changent.
- Mettre à jour les documents RBAC et modèle de données avec tout changement correspondant.

## Vérification

Tester normalisation et unicité du code, unicité du libellé, références Paie et refus d'accès ;
exécuter les tests d'intégration PostgreSQL si les contraintes ou migrations changent.
