# Applicabilité des conventions IA, agentique et RAG

Contrôle revu le 2026-10-12 sur le code, la configuration, les migrations, les dépendances et les
skills métier du dépôt ERP-RH.

| Convention | Constat | Décision de périmètre | Preuve de contrôle |
|---|---|---|---|
| `agents-ia.md` | Aucun agent applicatif, orchestrateur ou appel à un modèle n'est livré. Les 8 skills métier documentent leur objectif/périmètre, leurs sources README/RBAC et leurs vérifications ; aucun exemple de donnée réelle n'a été relevé. | Conforme au périmètre actuel ; aucune fonctionnalité IA ne doit être ajoutée pour satisfaire la convention. Le premier cas reste à cadrer après l'instrumentation des KPI. | Recherche ciblée des dépendances, packages et configurations ; revue des 8 fichiers `docs/*/skills/SKILL.md`, de `docs/README.md`, de l'ADR 0001 et de `TODO.md`. |
| `agent-ui.md` | Aucun flux AG-UI/A2UI, événement d'agent ou rendu piloté par agent n'est exposé. L'ADR 0002 fixe les choix de référence mais indique que le pilote applicatif reste à choisir. | Non applicable à la version contrôlée ; aucun adaptateur ou renderer ne doit être ajouté avant le cadrage du pilote. | Recherche des contrats AG-UI/A2UI et des namespaces d'événements dans `frontend/` et le backend ; revue de l'ADR 0002. |
| `mcp.md` | Aucun serveur, outil ou transport MCP n'est configuré dans l'application. | Conforme au périmètre actuel ; le premier outil doit être cadré et rester en lecture seule avant toute extension. | Recherche des dépendances, routes et configurations MCP ; `TODO.md` suit le cadrage du premier outil RH. |
| `rag.md` | L'extension PostgreSQL `vector` est conservée, mais aucun embedding, index RAG ni recherche sémantique n'est livré. | Conforme au périmètre actuel ; `vector` est une capacité préparée et ne devient pas une source de vérité métier. | Recherche dans les migrations et le code ; l'exception de conservation `G6/C16` reste documentée dans la matrice de conformité. |

Cette décision de périmètre ne constitue pas une exemption de sécurité : elle interdit simplement
d'ajouter une capacité absente sans besoin, contrat, permissions, provenance et tests dédiés.
