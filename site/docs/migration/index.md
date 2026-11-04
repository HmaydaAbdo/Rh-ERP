---
title: Migration
sidebar_position: 8
---

# Migration du backend vers FastAPI (E2, KAN-19)

Décision : ADR 0016 (`docs/adr/0016-migration-backend-spring-vers-fastapi.md`). Suivi : Jira (KAN-19 et ses tâches). Cette
section garde la stratégie, l'inventaire de sortie, la parité de chaque domaine et les mesures ; l'avancement vit dans Jira.
Toute la documentation de la migration vit ici, jamais dans un dossier `docs/` parallèle.

| Page | Contenu | Tâche |
|---|---|---|
| [Inventaire de sortie](inventaire.md) | Liste de contrôle de sortie **générée** : routes, permissions, outils MCP, actions d'audit, entités, migrations, tests | KAN-45 |
| [Stratégie de bascule](strategie.md) | Ordre, définition de fin de domaine, parité, mesures, retour arrière | KAN-46 |
| [Prototype du domaine common](prototype-common.md) | Ce qui est prouvé et ce qui ne l'est pas, mesures de départ | KAN-47 |
| [Domaine auth](auth.md) | Organisation, décisions, écarts avec Spring, parité vérifiée | KAN-213 |
| [Domaine audit](audit.md) | Historique, journal, événements de sécurité, intégrité, décision « opérations seulement » | KAN-214 |
| [Domaine parametre](parametre.md) | Catalogue, lecteurs typés, validation du cron, écarts avec Spring, parité vérifiée | KAN-215 |

Régénérer l'inventaire : `python scripts/migration/inventaire-backend.py`.
