---
title: "Vue d'ensemble : objectif, décisions, architecture"
sidebar_position: 2
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions de Spring, de Java et des tâches T* décrivent l'état avant la bascule vers FastAPI : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## 1. Objectif

La migration Python prépare le serveur MCP dans l'image `staport-intelligence-api` et son export OTLP vers Phoenix. Le service IA
reste connecté à Spring jusqu'à la bascule de l'authentification : les jetons utilisateur Spring HS256 ne sont pas
acceptés par l'API Python RS256. La réception d'un span MCP par Phoenix est vérifiée dans un projet Compose isolé,
avec des données synthétiques. Voir la
migration MCP (`site/docs/migration/mcp.md`).
Pour les requêtes PostgreSQL de l'API Python, l'auto-instrumentation OpenTelemetry utilise le pilote officiel
`opentelemetry-instrumentation-psycopg` 0.66b2 : l'instrumentation SQLAlchemy publiée à cette version exclut SQLAlchemy
2.1. Une requête SQLAlchemy asynchrone `SELECT 1` a produit un span client SQL reçu dans Phoenix dans la même trace que
son parent (KAN-220). Le propriétaire a validé explicitement l'usage de la série OpenTelemetry 0.66b2 **bêta**, faute
de version stable de cette instrumentation ; la veille suit sa première stable. L'essai est local et isolé ; il ne
démontre pas encore une trace de question IA de bout en bout.
Le banc sur une copie isolée de la base ERP couvre les cinq outils Python portés : 15 réponses conformes sur 15 au
dernier passage, trois répétitions par cas avec juge. Le premier passage (13/15) a révélé une réponse de rôles erronée et
une erreur du critère d'horodatage, corrigée avant le nouveau passage. Les autres domaines et la bascule restent à faire.

**Staport Intelligence — la plateforme d'IA de Staport** sert tous les utilisateurs de Staport
(BTP, classe S, Maroc) : comprendre, retrouver, contrôler et préparer. L'assistant dans Staport Intelligence en
est la première interface métier ; les applications des autres départements pourront la rejoindre.
Le catalogue disponible est assemblé à chaque requête à partir des outils MCP autorisés pour
l'utilisateur. Il ne devient jamais la source
des chiffres, des droits ou des décisions métier, et ne
prend aucune décision sur une personne : elle explique et prépare, une personne habilitée décide
(usage responsable (`conventions/agents-ia.md`)).

## 2. Décisions

| Sujet | Décision |
|---|---|
| Méthode | Tranche verticale de bout en bout, puis durcissement. Une tâche à la fois, suivie au § 7. |
| Métier | Spring est propriétaire des données, transactions, règles, permissions et audits. Aucun framework LLM dans le monolithe. |
| Service IA | **Python** : LangGraph pour le graphe, Pydantic pour tous les contrats, `uv` (lockfile), `ruff`, `pyright` strict, `pytest`. Python est le langage unique de l'IA (graphe, ML, OCR, voix, évaluation). |
| Outils métier | **MCP** (Streamable HTTP) entre le service IA et Spring. Le service IA n'a ni accès aux tables ni client REST métier. |
| Interface ↔ agent | **AG-UI** entre Angular et le service IA, par le **runtime CopilotKit officiel** (service `copilot-runtime`, Node, `@copilotkit/runtime` 1.80) depuis T16 (décision du 2026-10-26) : il relaie l'agent AG-UI du service IA avec le jeton de l'utilisateur et lui applique le middleware A2UI officiel, que l'architecture de CopilotKit place côté serveur. Flux produit par l'**intégration LangGraph officielle** `ag-ui-langgraph` 0.0.47 ([ADR 0015](../decisions/0015-ag-ui-integration-langgraph-officielle.md)) ; le service n'y ajoute que l'identité et la session MCP. Télémétrie de CopilotKit coupée. |
| Modèles | **LiteLLM** : les groupes officiels `ai-gateway-{simple,medium,complex,code,ocr}`, sélectionnés par le champ `model`, bascule entre fournisseurs du même niveau, budgets par clé virtuelle. Le groupe `tool-selection` a été retiré le 2026-11-03 : le choix des outils se fait hors modèle (T32). Un modèle est retenu sur le jeu de référence (§ 4). |
| Identification des dialectes | **LIDstral Arabic est à évaluer, pas encore adopté.** Il peut identifier des dialectes arabes sur texte en alphabet arabe, mais ne couvre pas l'Arabizi selon les éléments publiés. Le jeu Darija doit tester les deux écritures ; l'intégration de LIDstral sera recommandée seulement si elle améliore effectivement le routage ou les réponses sans dégrader les messages Arabizi. |
| Veille des modèles | Revue mensuelle par Claude ou Codex selon la routine du § 4.1. Candidat de départ pour le modèle conversationnel Darija : **Jais 3 32B** ; comparateurs spécialisés : **Atlas-Chat-27B** et **GemMaroc-27B**. Cette shortlist reste ouverte aux modèles et familles plus récents. Aucun modèle ni paramètre LiteLLM ne change sans confirmation humaine. |
| Données exposées à l'IA | Les outils rendent les mêmes champs que les écrans, CIN, dates de naissance et montants compris (décision du 2026-10-25) ; seules les permissions RBAC filtrent, dont le salaire réservé à `PAIE_READ`. Les données réelles peuvent être envoyées aux modèles configurés, offres gratuites comprises : la règle « aucune donnée réelle vers un modèle » est retirée, risque accepté par le propriétaire (décision du 2026-10-26). Cible : **modèle local open source** servi derrière LiteLLM ; aucun outil, plugin ou service payant. Accord CNDP (loi 09-08) obtenu par le propriétaire. |
| Sécurité | Périmètres de données par **département et fiche de poste**, appliqués dans Spring pour REST et MCP ; jeton délégué court RS256 ; audit de chaque appel d'outil (§ 5). |
| Premier usage | **Questions/réponses + interface composée A2UI** : l'agent répond avec des chiffres Spring et, quand c'est plus lisible, compose dans la discussion une surface A2UI (tableau, liste, indicateurs). L'ouverture automatique des vues de l'ERP est retirée (décision du propriétaire du 2026-10-26 : A2UI suffit et supprime le code maison de pilotage des écrans). |
| Identité et capacités | **Staport Intelligence** est le nom de la plateforme, présentée comme « la plateforme d'IA de Staport » ; l'assistant Staport Intelligence en est la première interface métier. Le middleware officiel `dynamic_prompt` de LangChain ajoute à chaque run les descriptions des outils MCP réellement accessibles à cet utilisateur ; l'assistant décrit ses capacités depuis cette liste, sans catalogue de domaines recopié dans son prompt. L'accueil reste générique ; CopilotKit génère des suggestions initiales depuis l'agent et son catalogue autorisé, avec le jeton du compte et sans conserver de fil de suggestion. Les règles de sécurité, de provenance et de calcul restent des instructions versionnées et revues. |
| Interface immersive | **Espace IA** plein écran en plus du panneau latéral : conversation, surfaces **A2UI** composées depuis le catalogue Staport, vues pilotées et mascotte. Aucune génération de code d'interface. |
| Mascotte | Personnage animé **Rive** (State Machines), aux couleurs Staport et à l'univers du chantier, piloté par les événements AG-UI ; design final validé sur maquette (§ 6). |
| Orchestration | **Un Deep Agent** (`create_deep_agent`, décision du propriétaire du 2026-11-03 : Deep Agents est le point d'entrée de tout agent, il porte les middlewares LangChain et s'exécute sur LangGraph) ; les outils métier lui sont exposés par la sélection juste-à-temps bornée (T32), et non plus par `LLMToolSelectorMiddleware`. Les **sous-agents par domaine** du harnais sont ajoutés quand le jeu de référence montre qu'un domaine a besoin de ses propres instructions, outils ou budget, ou qu'une tâche est longue : contrôle de la paie (J5), assistant réglementaire (J7), documents RH (J6). Pas avant : chaque sous-agent ajoute des appels de modèle, donc de la latence et des quotas (les offres gratuites répondent déjà 429 parfois). Le service actuel est encore sur `create_agent` : sa migration est la tâche T33. Détail : conventions (`conventions/agents-ia.md`). |
| Fournisseurs gratuits | Cumul des **offres gratuites à quota renouvelable**, un compte par fournisseur, quotas respectés (`rpm`/`tpm`) ; un modèle sans clé est désactivé au démarrage. Un modèle n'entre dans un pool qu'après une sonde outils + JSON réussie à travers la passerelle. NVIDIA NIM (offre de prototypage) est dans les pools ; les préversions à sortie instable restent sous tags `eval`. |
| Inter-applications | **A2A** relie les capacités des applications des autres départements à Staport Intelligence ; Staport Intelligence demeure une application métier raccordée, pas le nom de l'assistant d'entreprise. |
| Frameworks d'abord | Décision du 2026-10-26 : tout le code IA s'appuie sur Deep Agents (`create_deep_agent`, qui porte les middlewares LangChain), LangGraph, le MCP intégré à LangChain (`langchain.mcp`), `ag-ui-langgraph` et CopilotKit (raisonnement, texte, A2UI, interface Angular), LiteLLM pour la passerelle et ses garde-fous ; côté Java, le serveur MCP de **Spring AI** et l'échange de jetons OAuth2 de **Spring Authorization Server** ; tout code maison qui duplique un composant officiel est retiré, et **le code maison restant est une dette suivie jusqu'à zéro, sans service payant** (§ 7, « Objectif : aucun code IA fait maison ») (règle et correspondances (`conventions/agents-ia.md`)). L'agent décide lui-même de sa forme de réponse : directe, raisonnée avec outils, ou planifiée et suivie étape par étape, comme Claude, ChatGPT, Gemini et Grok. Remplace, une fois T10 à T20 faites, le graphe explicite de T6 et le ciblage maison. |
| Cadre de référence | Les pratiques des cadres reconnus s'appliquent à tout le chantier (décision du 2026-10-26) : NIST AI RMF et son profil IA générative, ISO/IEC 42001, OWASP Top 10 LLM 2025 et menaces agentiques, conventions OpenTelemetry de l'IA générative, loi 09-08. Leur traduction en règles est dans les conventions (`conventions/agents-ia.md`) ; l'écart avec l'existant est suivi au § 10. |
| Images et secrets | Chaque service a **sa propre image** (`staport-intelligence-<service>`) construite par la CI. Les clés vivent uniquement dans le `.env` racine unique (non versionné) ; les fichiers versionnés ne contiennent que des références `os.environ/…`. |

## 3. Architecture

```text
Angular (CopilotKit Angular : discussion, raisonnement, surfaces A2UI)
   │  /ia/copilotkit (nginx)
   ▼
staport-intelligence-copilot-runtime (Node, runtime CopilotKit + middleware A2UI)
   │  AG-UI : entrées HTTP, événements SSE, jeton de l'utilisateur
   ▼
staport-intelligence-ia (Python, Deep Agents sur LangGraph, `create_deep_agent` depuis T33)
   │  outils → réponse (+ generate_a2ui) → vérification des chiffres de la réponse et de la surface
   ├── staport-intelligence-litellm → fournisseurs (groupes officiels par capacité)
   ├── A2A (plus tard) → agents des autres applications
   ▼  MCP + jeton délégué
staport-intelligence-api (Spring) : adaptateurs MCP → façades de domaine → périmètre fiche de poste → audit
   ▼
PostgreSQL ERP (métier) · base LiteLLM dédiée (clés virtuelles, budgets) · plus tard corpus/pgvector
```

Les services IA démarrent par défaut avec `docker compose up -d`, sans profil (depuis le 2026-10-26) ; la tâche
ponctuelle `litellm-cles` enregistre les clés virtuelles. La pile ERP n'en dépend pas : `IA_ENABLED=false` ou
`MCP_ENABLED=false` coupe l'assistant. Les checkpoints durables LangGraph arrivent avec les écritures (J6).

L'interface résout l'URL du runtime avec la base du document Angular : sous `/erp-rh/`, les appels passent par
`/erp-rh/ia/copilotkit`. Les fils utilisent UUID v4 (`uuid`), également disponible en HTTP via `crypto.getRandomValues`.
Le Nginx extérieur et le relais intérieur transmettent les événements SSE sans buffering avec un délai de lecture de
300 secondes entre deux événements ; configuration du proxy extérieur dans deployment.md ([exploitation/deploiement](../exploitation/deploiement.md)).
