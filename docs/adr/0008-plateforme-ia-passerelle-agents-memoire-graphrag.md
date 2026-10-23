# ADR 0008 — Socle IA : passerelle de modèles, agents de domaine, mémoire et GraphRAG

- **Statut** : accepté historiquement (conventions), remplacé partiellement le 2026-10-23 pour
  l’orchestration Java et l’implémentation MCP par l’orientation de l’[ADR 0013](0013-integration-ia-mcp-langgraph-rag.md) ; aucune implémentation engagée
- **Date** : 2026-10-18
- **Décideur** : propriétaire du projet
- **Périmètre** : conventions réutilisables ; ERP-RH prépare le terrain, l'IA applicative n'est pas encore commencée

## Contexte

**Lecture actuelle :** les mentions Spring AI et données fictives ci-dessous décrivent le contexte
de la décision du 2026-10-18. Elles ne constituent ni la pile cible actuelle ni une qualification
des données de tous les environnements. La passerelle, la classification, les budgets et les
garde-fous restent applicables ; les choix détaillés du nouveau plan restent à valider.

Le projet prévoit une plateforme IA avec Spring AI, une passerelle LiteLLM vers plusieurs fournisseurs
(dont leurs offres gratuites), des agents spécialisés par domaine qui collaborent, une mémoire à trois
niveaux, un GraphRAG sur Neo4j et l'exposition de l'ensemble par MCP. Les conventions existantes
(`agents-ia.md`, `mcp.md`, `rag.md`, `database.md`) fixaient les règles de sécurité et d'évaluation mais
ne disaient rien de la passerelle, de l'orchestration multi-agents, de la mémoire ni du GraphRAG.

Constats de la revue :

- ERP-RH est en Spring Boot 4 : la ligne de Spring AI doit être celle qui le prend en charge, pas une
  ligne prévue pour Spring Boot 3.
- Les offres gratuites peuvent utiliser les requêtes pour entraîner leurs modèles, et leurs conditions
  interdisent de multiplier les comptes. Les données d'ERP-RH sont aujourd'hui fictives.
- Un cache sémantique partagé peut servir à un utilisateur la réponse calculée pour un autre.
- La chorégraphie pair-à-pair entre agents est difficile à borner et à auditer ; le consensus actuel est
  de commencer par le système le plus simple et d'ajouter des agents seulement quand l'isolation du
  contexte le justifie.
- MCP publie des outils et des ressources ; la délégation entre agents d'applications différentes relève
  du protocole A2A.
- Recopier les données transactionnelles dans un graphe créerait une seconde source de vérité, contraire
  à `architecture.md`.

## Décision

| Sujet | Décision | Convention |
|---|---|---|
| Passerelle | LiteLLM auto-hébergé, compatible OpenAI ; alias de modèles par rôle, bascule, répartition, clés et budgets dans la passerelle | `agents-ia.md` |
| Fournisseurs | Choisis selon la classe des données ; offres gratuites pour les données publiques ou synthétiques, toujours un repli | `agents-ia.md` |
| Cache | Interdit ou cloisonné par utilisateur dès qu'une requête dépend de l'utilisateur ; jamais sur les résultats d'outils | `agents-ia.md` |
| Orchestration | Superviseur ; agents de domaine exposés comme outils ; pas de chorégraphie pair-à-pair ; identité de l'utilisateur, bornes et corrélation à chaque délégation | `agents-ia.md` |
| Mémoire | Courte (fenêtre, PostgreSQL), compactée (résumé conservant consignes, permissions, confirmations, provenance), longue (préférences et faits validés, consultables et supprimables) | `agents-ia.md` |
| Inter-applications | A2A pour déléguer à un agent d'une autre application ; MCP pour les outils | `agents-ia.md`, `mcp.md` |
| RAG | pgvector d'abord ; GraphRAG (Neo4j Community) si l'évaluation le justifie, schéma de référence Source/Document/Passage/Entité, droits appliqués dans la requête | `rag.md`, `database.md` |
| MCP | Starter serveur MCP de Spring AI, Streamable HTTP, OAuth2, catalogue explicite par domaine, outils/ressources/prompts | `mcp.md` |
| Exploitation | OpenTelemetry et observation des LLM open source (Langfuse), budgets, interrupteur d'arrêt, validation des sorties | `agents-ia.md` |
| Tests | Routage, plafonds, délégation sans élévation, mémoire, bascule, cache, droits du GraphRAG | `testing.md` |

## Conséquences

- Aucune dépendance n'est ajoutée : les versions exactes (Spring AI, LiteLLM, Neo4j, Langfuse) seront
  vérifiées et verrouillées au premier cas d'usage, avec leur ADR d'implémentation.
- Le premier cas d'usage IA d'ERP-RH devra être décrit selon `agents-ia.md` (utilisateur, tâche,
  solution de référence sans IA, critères) avant tout code.
- Le passage à des données réelles impose de revoir les alias et fournisseurs selon la classification.
- Neo4j n'est pas déployé tant qu'une évaluation n'a pas montré que pgvector ne suffit pas.
