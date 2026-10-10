---
name: erp-rh-audit
description: Use when changing audit events, Envers history, audit access, retention, or audit tests in ERP-RH.
---

# Skill — domaine Audit

## Lire avant d'agir

- [README Audit](../README.md)
- [Permissions d'audit](../../rbac/audit.md)
- [Modèle de données](../../data-model.md)
- `conventions/audit.md`, `conventions/database.md` et le standard `standards/audit.md`

## Garde-fous

- Distinguer instantanés Envers, journal d'actions et garde-fous PostgreSQL ; ne pas écrire à la
  main dans les tables d'historique hors migrations documentées.
- Les écritures de succès restent cohérentes avec la transaction métier ; les échecs suivent le
  mécanisme séparé documenté.
- Le compte applicatif ne peut ni modifier ni supprimer l'historique. Aucune route d'écriture ou de
  suppression du journal ne doit être ajoutée.
- Limiter et protéger l'accès aux données personnelles, CIN, adresses IP et montants ; utiliser
  `AUDIT_READ` tel que décrit dans RBAC.
- Une migration qui change une entité auditée met à jour son schéma d'audit et la documentation.

## Vérification

Tester commit/rollback, auteur et origine, échec métier/sécurité, accès non autorisé, historique
complet et droits SQL du compte applicatif avec PostgreSQL.
