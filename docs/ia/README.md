# Intégration IA d’ERP-RH

État au **2026-10-23** : plan renforcé et prototype P1.1 testé sur `codex/integration-ia-mcp-rag`.
**Seul un serveur/client MCP synthétique existe dans les tests opt-in.** Aucun serveur métier,
agent, runtime d'orchestration Node, corpus RAG ou flux AG-UI n'est livré dans l'application.
P1.1 attend la validation du propriétaire ; P1.2 demeure non commencée.

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
| Comprendre la progression Classic → Chat → Controlled → A2UI → Open-ended | [Progression par domaine](progression-ui.md) |
| Vérifier la première tâche avant de passer à la suivante | [Preuve P1.1](validation-p1-1.md) · [commande du prototype](../../scripts/ia/mcp-compatibility/README.md) |
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
