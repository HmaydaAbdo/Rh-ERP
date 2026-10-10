---
name: erp-rh-function
description: Use when changing the ERP-RH Function reference domain, its Excel import, API, UI, or tests.
---

# Skill — domaine Fonction

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/function.md)
- [Règles communes d'import](../../imports.md)
- `conventions/architecture.md` et `conventions/database.md` pour toute modification technique

## Périmètre

Référentiel des fonctions occupées. Le domaine expose sa façade `IFunctionService` aux autres
domaines ; ceux-ci ne consultent pas son repository directement. L'import Excel a son sous-module
`imports/`.

## Garde-fous

- Le README métier et les migrations Flyway sont les sources des règles et du schéma : ne pas
  déduire de comportement depuis cette skill.
- Garder uniques les libellés selon les règles documentées et respecter les blocages de suppression.
- L'import est régi par `docs/imports.md` et le RBAC détaillé ; ne pas transformer un import d'ajout
  en mise à jour implicite.
- Mettre à jour `docs/rbac/function.md` si une route, une permission ou un contrôle UI change ; mettre
  à jour `docs/data-model.md` si le schéma change.

## Vérification

Exécuter les tests unitaires et d'intégration concernés, y compris les cas de doublon, référence
existante, import atomique et accès refusé. Vérifier migration Flyway sur base vide si le schéma change.
