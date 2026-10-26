---
name: erp-rh-audit
description: Use when changing audit events, Envers history, audit access, retention, or audit tests in ERP-RH.
---

# Skill — domaine Audit

## Lire avant d'agir

- [README Audit](../README.md)
- [Permissions d'audit](../../rbac/audit.md)
- [Modèle de données](../../data-model.md)
- `conventions/audit.md` et `conventions/database.md`

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
- Les [contrats](../contrats.md) décrivent les types et contraintes de recherche et de lecture ;
  ne pas confondre une entrée de journal, une page de différences et l'historique d'un enregistrement.
- Les filtres reviennent à la première page ; une réponse tardive ne remplace pas une sélection récente.
  Un échec de page d'historique se réessaie avant d'avancer, sans perdre les versions déjà lues.
- Annoncer chargement, erreur et vide séparément. Les événements de sécurité ne demandent pas de
  différences Envers quand ils ne portent aucune opération métier réussie.

## Vérification

Tester commit/rollback, auteur et origine, échec métier/sécurité, accès non autorisé, historique
complet et droits SQL du compte applicatif avec PostgreSQL.
Vérifier aussi erreurs/réessais, pagination et changement d'enregistrement dans les composants de consultation.
