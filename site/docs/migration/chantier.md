---
sidebar_position: 6
---

# Migration du domaine chantier

Le domaine `chantier` est porté dans l'application FastAPI unique (`api/src/staport/domains/chantier/`). Le contrat
REST couvre la création, la modification avec version optimiste, le statut, la recherche, la carte et la suppression.
Les permissions Spring sont conservées (`CHANTIER_READ`, `CHANTIER_WRITE`, `CHANTIER_DELETE`, `CHANTIER_SYNC`,
`CARTE_READ`) et les écritures sont historisées par l'audit Python.

La synchronisation ERP ajoute uniquement les codes absents; elle ne modifie ni ne désactive les lignes existantes.
L'API attend `CHANTIER_SYNC_BASE_URL` pour le déclenchement manuel. Les lectures agentiques sont limitées aux outils MCP
`chantier_rechercher` et `chantier_fiche`, protégés par `CHANTIER_READ`.

Preuves locales : `ruff` et `pyright` passent sur le domaine et les tests de découverte des routes, d'audit déclaré et du
catalogue MCP passent. La parité complète de la synchronisation sur une copie de données reste à rejouer avant la clôture
de KAN-224.
