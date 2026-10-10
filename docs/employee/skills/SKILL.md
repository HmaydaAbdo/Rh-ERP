---
name: erp-rh-employee
description: Use when changing employee records, import, assignment references, permissions, or UI in ERP-RH.
---

# Skill — domaine Employé

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/employee.md)
- [README Fonction](../../function/README.md) et [README Chantier](../../chantier/README.md) si les références changent
- [Règles d'import](../../imports.md), si l'import est concerné

## Périmètre

Fiche d'identité et affectation actuelle de l'employé. Ce domaine consomme Fonction et Chantier via
leurs façades de service ; il ne dépend pas de leurs repositories.

## Garde-fous

- CIN, champs obligatoires, statut, import d'ajout et restrictions de suppression suivent le README.
- Ne pas supprimer un employé lié à un bulletin ou à un compte utilisateur ; la désactivation
  conserve l'historique conformément aux règles métier.
- Le backend reste l'autorité des permissions ; le frontend masque les actions interdites sans
  remplacer les contrôles serveur.
- Toute modification de permission, schéma ou règle métier met à jour RBAC, modèle de données ou
  README dans le même changement.

## Vérification

Tester unicité CIN, validations, références, import atomique, blocage de suppression, audit et refus
RBAC. Utiliser des données synthétiques ; ne jamais copier des données personnelles en fixtures.
