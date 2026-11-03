# Décisions, principes et sources de l'IA ERP-RH

Ce document garde ce qui ne se déduit pas du code : les **principes** du travail IA, les **fonctions exclues**, les
**décisions du propriétaire** et les **sources officielles**. Il ne suit aucun avancement : l'état des tâches vit dans Jira
(projet `KAN`, voir [`AGENTS.md`](../../AGENTS.md)) et l'état technique dans le code, les tests et [`../ia.md`](../ia.md).
Les identifiants `E*n*.*m*` cités ci-dessous sont les préfixes des titres des tâches Jira (par exemple « E12.4 — État
partagé agent ↔ interface ») : rechercher le préfixe dans Jira donne la tâche, son statut et sa preuve.

Les versions verrouillées et leurs limites connues sont dans [`scripts/ia/verrous.txt`](../../scripts/ia/verrous.txt),
vérifiées en CI contre le code.

**Numérotation des épopées (réorganisée le 2026-11-02).** Ordre de livraison : E1 Heures supplémentaires, puis E2 backend
FastAPI (un seul conteneur avec l'IA) et E3 frontend Next.js ; E4 exploitation et qualité des données en parallèle ; les épopées IA
E5 à E17 reprennent ensuite ; E18 documentation Mintlify (au départ de la migration vers le nouveau stack) ; E19 marque
« Staport Intelligence » et persona de l'agent. E0 (refonte du frontend Angular) est inchangée. Les titres Jira portent la nouvelle
numérotation ; ce tableau convertit les anciens numéros encore cités dans des commentaires ou des preuves.

| Ancien | Nouveau | Sujet |
|---|---|---|
| E1 | E5 | Socle de vérité (IA) |
| E2 | E6 | Fiabilité de l'agent |
| E3 | E2 | Migration du backend vers FastAPI |
| E4 | E7 | Rôles, départements, hiérarchie, sécurité par champ |
| E5 | E8 | Confidentialité, traces, conformité |
| E6 | E9 | Sécurité par fiche de poste |
| E7 | E10 | Résorption du code maison |
| E8 | E11 | Conversations et mémoire |
| E9 | E12 | Interface CopilotKit complète |
| E10 | E13 | Écritures et approbation humaine |
| E11 | E14 | RAG et assistant réglementaire |
| E12 | E15 | Agents spécialisés (Deep Agents) |
| E13 | E16 | Pilote réel, exploitation, extensions |
| E14 | E17 | IA interne (vLLM) et sortie de LiteLLM |
| E15 | E3 | Refonte du frontend en Next.js |
| E17 (provisoire) | E4 | Exploitation, qualité des données, domaines restants |

## 1. Principes

0. **Aucune supposition sur un framework** : une affirmation sur le comportement, la version ou la gratuité d'un framework
   ou d'une bibliothèque n'est écrite qu'après lecture **de la page officielle ou du code source**, en entier ; une lecture
   tronquée est poursuivie (par exemple avec `curl` sur le fichier brut) ; ce qui n'a pas pu être lu est noté « non
   vérifié ». Les connaissances de mémoire ne sont pas une source.
1. **Utiliser les fonctions que fournissent les frameworks** (CopilotKit, LangChain, LangGraph, Deep Agents) pour profiter
   de leur expérience éprouvée. Une fonction n'est écartée que par une décision écrite du propriétaire ou parce qu'elle
   enfreint un garde-fou ci-dessous ; celles qui exigent un service payant ou hébergé sont dans « Fonctions exclues ».
2. **Dernières versions stables seulement**, alignées à chaque revue ; les préversions sont suivies à part. **Une version
   publiée n'est pas réputée compatible sans vérification** (tests, migration documentée).
3. **Documentation officielle seule** comme source de vérité ; pas de recopie du comportement d'un framework en code
   ERP-RH (« zéro code IA fait maison »).
4. **Dépasser les limites par la mesure** : les plafonds du code sont des réglages, pas des principes ; chacun est rendu
   configurable, mesuré, puis relevé ou justifié.
5. Garde-fous qui ne bougent pas, pour **chaque** fonction adoptée :
   - **gratuit** : aucun abonnement ni service payant ;
   - **le backend métier reste l'autorité** des données, droits, filtres et calculs (Spring aujourd'hui, FastAPI domaine
     par domaine selon la migration E2) ; les droits sont revérifiés à chaque appel ;
   - **données RH** : minimisation, audit, loi 09-08 ; le masquage des champs sensibles est une règle métier appliquée
     côté backend (E7) ;
   - **auto-hébergé** : les services hébergés par l'éditeur (CopilotKit Intelligence, LangSmith) sont exclus.
6. **Définition de « terminé »** pour toute tâche : test automatisé vert, droits testés (cas négatifs), preuve au
   navigateur ou dans une trace Phoenix pour ce qui se voit, documentation à jour, preuve consignée en commentaire Jira.

### Fonctions exclues définitivement (Q3)

Rien de ceci n'est adopté ni planifié ; cette liste évite de le reproposer :

- **CopilotKit Intelligence** : AG-UI Streams, mémoires utilisateur (`injectMemories`), fils enrichis (`injectThreads`,
  `CopilotThreadsDrawer`, Rich Threads, `identifyUser`), apprentissage automatique, trajectoires, analyses produit,
  collecteur `@copilotkit/learning`, canaux Slack et Teams, import d'historique, `selfManagedAgents` en production,
  runtimes Python, Go, Ruby et .NET de CopilotKit. Offres relevées sur la page de prix le 2026-10-31 : *Free* (usage non
  productif auto-hébergé, licence renouvelable tous les 30 jours, ou hébergé jusqu'à 1 000 interactions par mois),
  *Pay-as-you-go* 49 $ par mois, *Annual* sur devis.
- **LangSmith** : Studio, observabilité et évaluations hébergées, déploiement géré (serveur d'agent, clé
  `LANGGRAPH_CLOUD_LICENSE_KEY`), Fleet, Managed Deep Agents.
- **`ProviderToolSearchMiddleware`** (réservé à Anthropic Claude 4+ et OpenAI gpt-5.5+, modèles payants).
- **Fournisseurs de bacs à sable hébergés** pour Deep Agents.
- **Tâches proactives et apprentissage automatique** des conversations.

## 2. Décisions du propriétaire

| Q | Décision |
|---|---|
| Q1 | Jira (projet `KAN`) et le code sont les seules sources de suivi ; aucun fichier markdown ne suit l'avancement (décision du 2026-11-02, remplace « le plan de travail est la référence »). |
| Q2 | Ordre de travail : le numéro des épopées (E0 à E19) ; E19 est la dernière. |
| Q3 | Services payants ou hébergés **exclus définitivement** (§ 1, « Fonctions exclues »). |
| Q4 | **Aucune écriture** pour l'instant : l'assistant reste en lecture seule jusqu'après le pilote réel ; E13 reste préparée et inactive. |
| Q5 | Masquage **uniquement sous contrôle du backend** (E7) ; `PIIMiddleware` reporté (E16.9b) ; données RH réelles **autorisées** vers les modèles externes de la passerelle, le backend décidant de ce qui sort ; mémoire longue = **préférences et faits métier**, avec consentement, consultation, correction, oubli, expiration (E11.3). |
| Q6 | État partagé : **filtres de vue pilotés par l'agent**, ajustables par l'utilisateur (E12.4). |
| Q7 | Interface générative ouverte **autorisée** (E12.9, `conventions/agent-ui.md`) ; MCP Apps abandonné ; WebMCP non adopté pour l'instant ; exécution de code : **QuickJS, puis conteneur Docker jetable** (E15.7). |
| Q8 | Latence **p95 ≤ 30 s** ; jeu de référence d'environ **200 cas** ; retard de version toléré **30 jours** ; conservation des conversations et traces **90 jours** ; **aucun plafond** appliqué par nous (E6.9). |
| Q9 | Jeu adverse avec **PyRIT** (Microsoft), documentation lue avant adoption, complété par des cas propres à l'ERP (E9.5). |
| Q10 | Liste des conversations par une **table de fils tenue par l'ERP** (E10.10). |
| Q11 | Pièces jointes **plus tard, cadrées** (E12.7) ; voix **en fin de parcours** (E16.8). |
| Q12 | **Tous** les corpus (aide métier de l'ERP, textes réglementaires, procédures internes) ; **tout le RAG est isolé dans E11**. |
| Q13 | Compétences : **contenu séparé** (les `SKILL.md` du dépôt restent pour les développeurs ; l'agent a les siennes, E15.4). |
| Q14 | Tables du point de reprise : **`setup()` officiel de LangGraph** au démarrage (E6.8). |
| Q15 | Migration vers FastAPI : **tout le backend, domaine par domaine**, transversal d'abord puis métier un par un ; ordre métier `function`, `equipe`, `chantier`, `employee`, `heuresupp`, `paie` ; motif : **outils IA natifs Python** (E2). |
| Q16 | Serveurs de documentation pour les assistants de développement : **CopilotKit** (avec ses compétences), **LangChain** (docs et référence), **Angular CLI** ; Context7 pour le reste (E5.7). |
| Q17 | Contrôle d'accès par **RBAC, permissions et droits par champ** ; départements et hiérarchie = **information** seulement ; champs sensibles : **rémunération, identité, banque et social, contact** (E7). |
| Q18 | Matériel de modèles internes **inconnu** : inventaire d'abord ; LiteLLM abandonné **dès que le premier modèle interne tient le jeu de référence** (E17). |
| Q19 | Dependabot activé pour les composants IA ; ses PR lancent la CI. |
| Q20 | Ticket CopilotKit (E5.8) et essai isolé de `@a2ui/angular` (E5.9, fait) ; protocole A2UI **v0.9 adopté, v1.0 quand stable**. |
| Q22 | **Sélection d'outils juste-à-temps bornée** (2026-11-03) : jamais de catalogue chargé globalement ; 5 à 7 schémas d'outils métier hydratés par tour, choisis hors modèle (filtre d'accès, puis recherche hybride BM25 + vectorielle), **aucun tour de modèle supplémentaire** pour le routage de base ; outil permanent `request_broader_tools` ; isolation par domaine avec sous-agents Deep Agents, sous-graphes LangGraph et `Command` seulement si nécessaire. Règle et protocole d'évaluation dans `conventions/agents-ia.md`. Conséquence : `LLMToolSelectorMiddleware` quitte le chemin systématique. Applicable à toute fonctionnalité qui utilise Deep Agents. |
| Q23 | **Pratiques actuelles du secteur de l'IA agentique** (2026-11-03) : tout agent est un Deep Agent et emploie les capacités documentées de Deep Agents, LangChain et LangGraph (délestage et résumé du contexte, backends à espace de noms par identité, permissions avec règle finale de refus, durabilité explicite, profils de harnais, compétences à divulgation progressive, sous-agents par domaine). **Règle stricte : toute fonctionnalité et capacité exposée par ces frameworks s'utilise** (registre des capacités tenu à jour, aucune écartée sans décision écrite du propriétaire ou interdiction documentée) ; les sous-agents asynchrones (bêta) sont à mettre en place avec version verrouillée. Appliquées **sans ticket dédié**, dans le travail courant ; règles dans `conventions/agents-ia.md` et état dans `docs/ia.md` § 10. |
| Q21 | **AG Grid Community** pour les tableaux et **`ng2-charts`** pour les graphiques, **dans toute l'application** (E10.11, réalisé par E0.4). |

## 3. Relecture d'entrée de chaque épopée

Avant la première tâche d'une épopée, lire **en entier** les pages officielles ci-dessous et le journal de modifications
des paquets concernés ; consigner dans le commit ou le commentaire Jira les versions, les nouveautés retenues et les pages
lues. Chaque épopée porte une tâche « E*n*.R » pour cette relecture.

| Épopée | Documentation à relire (index officiel de chacun) |
|---|---|
| E0 | angular.dev (signaux, formulaires, accessibilité, CDK, Aria) ; AG Grid Community ; `ng2-charts` et Chart.js ; WCAG 2.2 ; références d'Impeccable |
| E5, E6 | LangChain : agents, middlewares (vue d'ensemble et préconstruits), sortie structurée, runtime, tests ; LangGraph : persistance, durabilité, streaming ; Deep Agents : vue d'ensemble, personnalisation ; journaux de `langchain`, `langgraph`, `deepagents` |
| E2 | FastAPI, Pydantic, SQLAlchemy, SDK MCP Python |
| E7, E9 | Spring Security et Spring AI (serveur MCP) ; LangChain : runtime et contexte |
| E8 | LangChain : garde-fous, middleware PII, politique de traces ; LangGraph : persistance (chiffrement) ; Phoenix / OpenInference |
| E10 | CopilotKit : runtime, authentification, déploiement, `injectThreads` ; LangGraph : stores ; `ag-ui-langgraph` ; Spring Authorization Server |
| E11 | LangGraph : persistance, mémoire, stores ; LangChain : mémoire à long terme, join/rejoin ; Deep Agents : mémoire ; CopilotKit : fils |
| E12 | Toute la documentation CopilotKit Angular (guides, référence, exemples, production, dépannage) ; spécification AG-UI et A2UI |
| E13 | LangChain : human-in-the-loop ; LangGraph : interruptions ; CopilotKit : interactions humaines |
| E14 | pgvector, PostgreSQL (recherche plein texte), documentation du modèle d'embeddings choisi ; LangChain : retrieval |
| E15 | Deep Agents : toutes les pages ; LangChain : multi-agents ; LangGraph : sous-graphes |
| E16 | Documentation des fournisseurs de modèles de la passerelle ; ce qui a changé depuis la dernière relecture |
| E17 | vLLM (installation, serveur compatible OpenAI, quantification, parallélisme), LangChain (`langchain-openai`) |

## 4. Sources officielles lues (2026-10-31)

LangChain [middlewares préconstruits](https://docs.langchain.com/oss/python/langchain/middleware/built-in),
[MCP](https://docs.langchain.com/oss/python/langchain/mcp), [tests et évaluations](https://docs.langchain.com/oss/python/langchain/test/evals),
[join/rejoin](https://docs.langchain.com/oss/python/langchain/frontend/join-rejoin) ; LangGraph
[vue d'ensemble](https://docs.langchain.com/oss/python/langgraph/overview), [persistance](https://docs.langchain.com/oss/python/langgraph/persistence),
[interruptions](https://docs.langchain.com/oss/python/langgraph/interrupts), [mémoire](https://docs.langchain.com/oss/python/langgraph/add-memory),
[streaming](https://docs.langchain.com/oss/python/langgraph/streaming) ; Deep Agents
[vue d'ensemble](https://docs.langchain.com/oss/python/deepagents/overview), [sous-agents](https://docs.langchain.com/oss/python/deepagents/subagents),
[backends](https://docs.langchain.com/oss/python/deepagents/backends), [production](https://docs.langchain.com/oss/python/deepagents/going-to-production),
[AG-UI](https://docs.langchain.com/oss/python/deepagents/ag-ui) ; CopilotKit [Angular](https://docs.copilotkit.ai/angular),
[référence](https://docs.copilotkit.ai/reference/angular), [exemples](https://docs.copilotkit.ai/angular/features),
[WebMCP](https://docs.copilotkit.ai/angular/webmcp), [AG-UI Streams](https://docs.copilotkit.ai/AG-UI-Streams),
[choix des primitives](https://docs.copilotkit.ai/concepts/which-hook) ; registres PyPI et npm pour les versions.

Lues aussi : LangChain, LangGraph et Deep Agents, toutes les pages de l'index officiel (runtime, sortie structurée,
garde-fous, mémoire à long terme, multi-agents, tolérance aux pannes, exécution durable, checkpointers, stores, retour dans
le temps, sous-graphes, API fonctionnelle, agents asynchrones, compétences, mémoire, interpréteurs, bacs à sable,
permissions, profils, grilles d'évaluation, ACP). CopilotKit :
[outils frontend et interface générative](https://docs.copilotkit.ai/angular/guides/frontend-tools-generative-ui),
[fils, mémoire, pièces jointes, interface sans chat](https://docs.copilotkit.ai/angular/guides/threads-memory-attachments-headless),
[interactions humaines](https://docs.copilotkit.ai/angular/guides/human-in-the-loop), [état partagé](https://docs.copilotkit.ai/angular/guides/shared-state),
[interface de chat](https://docs.copilotkit.ai/angular/guides/chat-ui), [dépannage](https://docs.copilotkit.ai/angular/guides/troubleshooting),
[production et cycle de vie](https://docs.copilotkit.ai/reference/angular/production-lifecycle), [runtime](https://docs.copilotkit.ai/angular/backend/copilot-runtime),
[déploiement du runtime](https://docs.copilotkit.ai/runtime-server-adapter), [authentification](https://docs.copilotkit.ai/auth),
[agent AG-UI maison](https://docs.copilotkit.ai/backend/custom-ag-ui-agent), [agents autogérés](https://docs.copilotkit.ai/backend/self-managed-agents),
[agent personnalisé](https://docs.copilotkit.ai/backend/custom-agent), [inspecteur](https://docs.copilotkit.ai/angular/inspector),
[choix du modèle](https://docs.copilotkit.ai/angular/model-selection), [architecture](https://docs.copilotkit.ai/angular/concepts/architecture),
[construire avec des agents](https://docs.copilotkit.ai/angular/build-with-agents), [AG-UI](https://docs.copilotkit.ai/agentic-protocols/ag-ui),
[frameworks communautaires](https://docs.copilotkit.ai/angular/community-frameworks), Intelligence
([vue d'ensemble](https://docs.copilotkit.ai/intelligence/overview), [démarrage](https://docs.copilotkit.ai/intelligence/quickstart),
[mémoires](https://docs.copilotkit.ai/intelligence/memories), [analyses](https://docs.copilotkit.ai/intelligence/analytics),
[canaux](https://docs.copilotkit.ai/intelligence/channels), [trajectoires](https://docs.copilotkit.ai/intelligence/trajectories),
[collecteur autonome](https://docs.copilotkit.ai/intelligence/standalone-collector)) et la page des prix.

**Adresses introuvables (HTTP 404) à la date de lecture, donc non lues** : `/angular/guides/authentication`,
`/angular/multi-agent`, `/angular/sub-agents`, `/intelligence/learning`, ainsi que les anciens noms de guides
(`guides/tools`, `guides/interrupts`, `guides/threads`, `guides/attachments`). **Limites connues de la lecture** : la page
AG-UI de CopilotKit ne détaille pas le catalogue d'événements (renvoi vers ag-ui.com, à lire avant E11.4 et E12.5) et les
pages « Common Copilot issues », « Runtime debug mode » et « AG-UI Event Inspector » sont seulement citées par le dépannage.

## 5. Historique

Le plan de travail IA qui suivait l'avancement (états, tableaux de tâches, traçabilité des anciens plans) a été migré dans
Jira le 2026-11-02 puis supprimé du dépôt. Son contenu complet reste lisible dans l'historique Git :

```bash
git show 8c726d0f:docs/ia/plan-de-travail.md
```
