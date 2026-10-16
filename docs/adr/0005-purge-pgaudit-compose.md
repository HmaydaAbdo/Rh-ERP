# ADR 0005 — Purge planifiée des journaux pgAudit dans Compose

- **Date** : 2026-10-16
- **Statut** : acceptée

## Contexte

La RH a fixé à 90 jours la conservation des journaux CSV PostgreSQL, distincte de la conservation
à vie de `audit_journal` et Envers. La rotation quotidienne configurée dans PostgreSQL ne supprime
pas les fichiers expirés. L'hôte de production est Windows ; aucun accès SSH ni déploiement
automatisé n'est souhaité. Le propriétaire a choisi un service planifié Compose.

## Décision

Ajouter `postgres-log-retention` au profil Compose `backup`, déjà activé en production. Le service
utilise l'image PostgreSQL ERP-RH construite par la CI, s'exécute en tant que `postgres`, n'a pas
d'accès réseau et monte le volume PostgreSQL. Il supprime uniquement les fichiers réguliers au
premier niveau nommés `postgresql-*.csv*` et âgés de plus de 90 jours, au démarrage puis chaque jour
à 03:00 UTC. `log_filename` ne porte plus l'extension `.csv`, ajoutée automatiquement par PostgreSQL
pour `csvlog`.

## Options examinées

1. **Tâche planifiée Windows** : dépend d'une tâche hôte distincte du cycle de vie Compose et de sa
   configuration dans Windows.
2. **Service planifié Compose** : versionné avec la configuration de déploiement et démarré par le
   même profil que la sauvegarde ; choisi par le propriétaire.

## Conséquences

- La purge est disponible après construction et publication de la nouvelle image PostgreSQL, puis
  démarrage de `docker compose up -d` avec le profil `backup`.
- Le service partage le volume PostgreSQL pour pouvoir supprimer les CSV ; il ne rejoint aucun réseau
  et cible seulement les fichiers CSV au premier niveau.
- Les droits effectifs, la santé et les journaux de purge doivent être contrôlés sur la production.
- Les alertes de capacité et les alertes des événements d'audit restent à configurer.
- La conservation des CSV n'altère pas `audit_journal`, Envers ou les archives de sauvegarde.
