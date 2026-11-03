# Migration du backend vers FastAPI (E2, KAN-19)

Décision : [ADR 0016](../adr/0016-migration-backend-spring-vers-fastapi.md). Suivi : Jira (KAN-19 et ses tâches).
Ce dossier garde la stratégie, l'inventaire de sortie et les mesures ; l'avancement vit dans Jira.

| Document | Contenu | Tâche |
|---|---|---|
| [inventaire.md](inventaire.md) | Liste de contrôle de sortie **générée** : routes, permissions, outils MCP, actions d'audit, entités, migrations, tests | KAN-45 |
| [strategie.md](strategie.md) | Bascule : ordre, définition de fin de domaine, parité, mesures, retour arrière | KAN-46 |
| [prototype-common.md](prototype-common.md) | Prototype du domaine `common` (`api/`), ce qui est prouvé et ce qui ne l'est pas, mesures de départ | KAN-47 |
| [auth.md](auth.md) | Domaine `auth` en Python : organisation, décisions, écarts avec Spring, parité vérifiée | KAN-213 |
| [audit.md](audit.md) | Domaine `audit` en Python : historique, journal, événements de sécurité, intégrité, décision « opérations seulement » | KAN-214 |

Régénérer l'inventaire : `python scripts/migration/inventaire-backend.py`.
