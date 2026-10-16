# ADR 0004 — Déploiement manuel de production avec `latest`

- **Statut** : accepté
- **Date** : 2026-10-16
- **Décideur** : propriétaire du projet

## Contexte

Le serveur n'a pas d'environnement de staging. Le propriétaire veut déclencher lui-même les
déploiements quand une image lui semble stable et ne veut pas gérer des tags SHA à chaque mise à jour.
La CI publie les quatre images Docker Hub avec le SHA du commit et publie également `latest` sur `main`.

## Décision

Le déploiement reste manuel, sans pipeline SSH/GitHub Actions. L'opérateur attend la réussite de la CI
sur `main`, puis utilise `latest` pour PostgreSQL, backend, frontend et sauvegarde.

Les quatre tags restent configurés sur `latest` dans `.env`. Le `.env` de production définit également
`COMPOSE_PROFILES=backup`, afin que le service de sauvegarde soit inclus par défaut sans répéter
`--profile backup` aux commandes. Aucune publication ou mise à jour de production n'est déclenchée
directement par la CI.

Les commandes de mise à jour sont :

```sh
docker compose pull
docker compose up -d
```

## Conséquences et contrôles

- `latest` est mutable : le prochain déploiement récupère l'image à laquelle ce tag pointe alors.
- Sans garder les identifiants/digests déployés ou sélectionner explicitement un tag SHA, le retour
  exact à la version précédente est moins direct. Enregistrer les références déployées dans le registre
  d'exploitation ou utiliser les tags SHA publiés lors d'un incident.
- Avant le `pull`, vérifier la réussite CI sur `main` et la disponibilité d'une sauvegarde récente.
- Après le `up -d`, vérifier les healthchecks des quatre services et les parcours critiques.
- Ne jamais exécuter `docker compose down -v` pendant cette procédure.

Cette décision constitue une exception d'exploitation à la préférence normative pour des tags
immuables décrite dans [`conventions/deployment.md`](../../conventions/deployment.md).
