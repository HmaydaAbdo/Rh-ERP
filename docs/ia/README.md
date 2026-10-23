# Intégration IA d’ERP-RH

État au **2026-10-23** : cadrage documentaire sur `codex/integration-ia-mcp-rag`.
**Aucun agent, serveur MCP, runtime Node, corpus RAG ou flux AG-UI n’est implémenté par ce lot.**

La demande du propriétaire porte d’abord sur les conventions, une analyse critique, un plan
détaillé et une reprise fiable entre sessions. L’orientation demandée sépare le métier Java de
l’orchestration TypeScript ; les choix d’identité, de stockage et de bibliothèques encore ouverts
restent des propositions à valider dans l’[ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md).

## Parcours de lecture et suivi

| Besoin | Document faisant référence |
|---|---|
| Reprendre une session interrompue | [Handoff IA](../handoff/integration-ia.md) |
| Comprendre les choix et accords manquants | [ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md) |
| Évaluer la proposition initiale et ses neuf piliers | [Analyse critique](analyse-architecture.md) |
| Exécuter par lots avec critères de sortie | [Plan en quatre phases](plan-integration.md) |
| Concevoir ingestion, recherche, droits et citations | [Conception RAG](rag.md) |
| Choisir protocoles et pistes complémentaires | [Protocoles et innovations](protocoles-et-innovations.md) |

Les règles normatives restent dans les conventions [agents](../../conventions/agents-ia.md),
[MCP](../../conventions/mcp.md), [interface](../../conventions/agent-ui.md),
[RAG](../../conventions/rag.md) et [intégrations](../../conventions/integrations.md).
Les README et skills des domaines restent les sources métier. Ce dossier ne crée aucune permission
et ne change ni le schéma ni les contrats existants.

## Résultat recherché

Un assistant explique et retrouve des informations autorisées, cite ses sources, utilise les
indicateurs calculés par les domaines et prépare des actions vérifiables. Le premier pilote
recommandé combine une aide documentaire et un outil métier en lecture seule. Son périmètre
exact reste à choisir avec le propriétaire ; aucune donnée RH n’est envoyée à un fournisseur sur
la seule base de ce plan.

L’application reste utilisable quand l’IA est désactivée, indisponible ou hors budget. Le pointage,
le calcul futur de la paie et les corrections de référentiels gardent leurs décisions métier propres.
