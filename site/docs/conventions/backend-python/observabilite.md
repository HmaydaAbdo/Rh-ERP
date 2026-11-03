---
title: Observabilité et performance
sidebar_position: 9
---

# Observabilité et performance

Les exigences de `logging.md`, `metrics.md` et `performance.md` (journaux structurés sans donnée personnelle, catégories, métriques de domaine, mesures avant optimisation)
ne changent pas. Seule la mise en œuvre change.

## Journaux

* Format JSON, un événement par ligne, avec identifiant de corrélation, acteur, catégorie (`SECURITE`, `AUDIT`, `INTEGRATION`, `METIER`, `TECHNIQUE`), sans mot de passe,
  jeton ni donnée personnelle superflue.
* Bibliothèque standard `logging`, configurée une fois au démarrage ; rotation quotidienne, conservation de 30 jours (`TimedRotatingFileHandler`), ou sortie standard en
  conteneur selon `docs/deployment.md`.
* Le niveau se règle par configuration. `ERROR` signale une action requise, pas une validation refusée.

## Métriques et traces

* OpenTelemetry Python : instrumentation FastAPI (`FastAPIInstrumentor.instrument_app(app, excluded_urls=...)` pour exclure les sondes de santé) et SQLAlchemy
  (paquet d'instrumentation dédié). Export vers la pile existante.
* **Les noms de métriques actuels sont conservés** (tableaux de bord et alertes inchangés). Chaque domaine déclare ses métriques dans `metrics.py`.
* Aucune étiquette à cardinalité non bornée (identifiants, courriels).

## Performance

* Règle d'or conservée : mesurer avant d'optimiser. Chaque comparaison Spring/FastAPI se fait sur le même jeu de données et reporte p50 et p95, avec la commande
  exacte pour la reproduire (ADR 0016).
* Une boucle d'événements saturée par un appel bloquant est le défaut de performance propre à FastAPI : voir la règle `async def` / `def` dans [architecture](./architecture.md).
* Requêtes : plan d'exécution des requêtes critiques, index justifiés, pas de N+1 (voir [persistance](./persistance.md)).
* Tâches longues : hors de la requête (pool de threads ou tâche planifiée), idempotentes, avec reprise.

À confirmer à la relecture de KAN-47 : version exacte des paquets d'instrumentation et configuration de l'export.
