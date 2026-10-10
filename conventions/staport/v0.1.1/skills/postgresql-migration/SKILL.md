---
name: staport-postgresql-migration
description: Conçoit et relit une migration Flyway PostgreSQL compatible avec le modèle d'audit Staport. Utiliser quand un changement touche tables, colonnes, index, contraintes, seeds ou données.
---

# Migration PostgreSQL Staport

1. Lire le dernier numéro Flyway, les conventions DB/audit et le modèle de données du domaine.
2. Identifier si la table est auditée, volumineuse, non vide ou utilisée par d'autres versions.
3. Demander les décisions métier manquantes (valeurs de repli, fusion, suppression) avant d'écrire
   du SQL qui les inventerait.
4. Ajouter un nouveau SQL versionné, idempotent lorsque pertinent, avec contraintes/noms explicites.
   Ne jamais modifier une migration déjà appliquée.
5. Modifier entité, table `_aud`, permissions/seed et documentation dans la même tranche.
6. Tester sur PostgreSQL réel : migration vierge, upgrade depuis fixture de version précédente,
   `ddl-auto=validate`, invariants et réversibilité/plan de restauration.
7. Résumer les risques de verrouillage, backfill, volume et déploiement.
