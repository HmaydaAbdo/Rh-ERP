# Applicabilité des conventions IA, agentique et RAG

Contrôle effectué le 2026-10-11 sur le code, la configuration, les migrations et les dépendances
du dépôt ERP-RH.

| Convention | Constat | Décision de périmètre | Preuve de contrôle |
|---|---|---|---|
| `agents-ia.md` | Aucun agent, orchestrateur ou appel à un modèle n'est livré par le backend ou le frontend. | Applicable uniquement si une capacité IA est introduite ; aucune fonctionnalité ne doit être ajoutée pour satisfaire la convention. | Recherche des packages, dépendances et configurations IA ; `docs/README.md` et `TODO.md` cadrent une extension future séparée. |
| `agent-ui.md` | Aucun flux AG-UI/A2UI, événement d'agent ou rendu piloté par agent n'est exposé. | Non applicable à la version contrôlée. Toute future intégration devra fournir son contrat et ses métadonnées propres. | Recherche des contrats AG-UI/A2UI et des namespaces d'événements dans `frontend/` et le backend. |
| `mcp.md` | Aucun serveur, outil ou transport MCP n'est configuré dans l'application. | Non applicable à la version contrôlée. Le premier outil MCP devra être ajouté après cadrage et limité à la lecture. | Recherche des dépendances, routes et configurations MCP ; extension future suivie dans `TODO.md`. |
| `rag.md` | L'extension PostgreSQL `vector` est conservée, mais aucun embedding, index RAG ou recherche sémantique n'est livré. | Non applicable à la version contrôlée ; `vector` est une capacité préparée et ne devient pas une source de vérité métier. | Migrations et code ne contiennent aucun modèle d'embedding ni pipeline d'indexation ; exception `G6/C16` documentée dans le rapport. |

Cette décision de périmètre ne constitue pas une exemption de sécurité : elle interdit simplement
d'ajouter une capacité absente sans besoin, contrat, permissions, provenance et tests dédiés.
