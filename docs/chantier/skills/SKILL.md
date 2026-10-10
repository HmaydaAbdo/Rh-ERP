---
name: erp-rh-chantier
description: Use when changing the ERP-RH Chantier domain, its ERP synchronization, API, UI, or tests.
---

# Skill — domaine Chantier

## Lire avant d'agir

- [README métier](../README.md)
- [Permissions et routes](../../rbac/chantier.md)
- `conventions/architecture.md`, `conventions/database.md` et `conventions/audit.md` selon le changement

## Périmètre

Référentiel des chantiers alimenté par l'ERP source. La synchronisation est un adaptateur du domaine
et la façade `IChantierService` est le point d'accès pour les autres domaines.

## Garde-fous

- Respecter la règle documentée de synchronisation : ajouter les chantiers manquants sans écraser
  les données modifiées dans ERP-RH.
- Ne pas supposer qu'un chantier absent de la source doit être désactivé ou supprimé.
- Distinguer le déclenchement planifié du déclenchement manuel et appliquer le RBAC documenté au
  déclenchement manuel.
- Toute modification des données, permissions, audit ou contrat externe met à jour les documents
  concernés dans le même changement.

## Vérification

Tester les cas source indisponible, code déjà connu, nouveau chantier et erreur partielle selon les
contrats existants ; vérifier les métriques, logs et permissions touchés.
