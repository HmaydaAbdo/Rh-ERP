# Analyse des écarts IA backend

> Comparaison du service IA Python ERP-RH avec les capacités officielles LangChain, LangGraph et Deep Agents.
> Périmètre : backend IA (`ia/`), ses intégrations et son exploitation. L'interface Angular/CopilotKit est hors périmètre.

Revue documentaire : 2026-10-31. Les constats de code ci-dessous ont été établis par lecture des sources et manifests du dépôt; aucune compilation ni suite de tests n'a été lancée pour cette analyse.

## Résumé

ERP-RH dispose déjà d'un socle backend riche : un agent LangChain `create_agent` exécuté sur LangGraph, outils issus du catalogue MCP autorisé de Spring, sélection d'outils, contexte dynamique, planification, bornes de run, résumé, checkpoints PostgreSQL, streaming AG-UI, évaluation et télémétrie Phoenix.

Les écarts les plus concrets ne sont donc pas « installer un framework d'agent » : ils concernent surtout (1) une politique de reprise d'erreur fine et prouvée, (2) une mémoire inter-conversations gouvernée, (3) le parcours d'interruption/reprise qui sera nécessaire avant toute écriture, (4) une preuve active de masquage des données dans Phoenix et (5) une décision mesurée sur les sous-agents. Deep Agents ajoute des capacités de planification, fichiers virtuels et délégation; le besoin de planification est déjà couvert et le reste ne justifie pas son ajout sans cas métier explicite.

## État réel du backend

Sources principales : `ia/src/erp_rh_ia/agent.py`, `agui.py`, `memoire.py`, `contexte.py`, `outils.py`, `modeles.py`, `evaluation.py`, `surfaces.py`, `pyproject.toml` et `uv.lock`.

| Fondation | État relevé dans l'application | Conclusion |
|---|---|---|
| Agent LangChain | `create_agent`; LangChain `1.4.7` verrouillé | En place; pas de graphe de conversation maison à remplacer. |
| Orchestration LangGraph | Utilisée par `create_agent` et `LangGraphAGUIAgent`; `langgraph 1.2.19` verrouillé | En place; l'application n'emploie pas directement `StateGraph` pour ses parcours métier. |
| Outils | Adaptateur MCP LangChain → catalogue Spring, avec jeton délégué à l'utilisateur; aucun accès direct aux repositories | Bonne frontière de sécurité; permissions et données restent autorités du backend Spring. |
| Middlewares | `CopilotKitMiddleware`, surfaces, contexte ERP, `TodoListMiddleware`, limites appels modèle/outils, sélecteur LLM, prompt dynamique; résumé conditionnel | Couverture déjà substantielle; inventaire détaillé ci-dessous. |
| État et checkpoints | `AsyncPostgresSaver` dans base IA dédiée; fil namespacé par l'utilisateur; purge après inactivité; fallback mémoire processus si DB absente | Mémoire courte par fil présente. Le fallback mémoire processus n'est pas durable. |
| État externe AG-UI | `agui.py` diffuse les événements/outils/progression AG-UI, efface le `state` fourni par navigateur puis recalcule l'identité, le catalogue MCP et le fil | Protocole de streaming et état interne LangGraph présents; le state navigateur ne fait volontairement pas autorité. |
| Reprise après pause humaine | Aucun `interrupt()` / `Command(resume=...)` trouvé dans le backend; aucune écriture MCP IA n'est activée aujourd'hui | Écart réel, mais à traiter avec le premier outil d'écriture seulement. |
| Mémoire longue inter-fils | Checkpointer présent; aucun `Store`/`BaseStore` configuré | Non implémentée; ne pas enregistrer automatiquement des faits personnels RH. |
| Évaluation | `openevals`/`agentevals`, jeu de référence et trajectoires; cas simulés hors réseau | En place; les résultats doivent rester la porte avant de modifier agent, modèles ou middleware. |
| Traces | Instrumentation OpenTelemetry/OpenInference documentée avec Phoenix | La configuration est documentée, mais la preuve de masquage et l'usage opérationnel des traces restent explicitement ouverts dans `docs/ia.md` (T3.4). |
| Deep Agents | Aucune dépendance `deepagents`, aucun `create_deep_agent` | Non adopté. C'est cohérent tant que les cas métier longs/spécialisés ne démontrent pas un besoin. |

## Comparaison des capacités officielles

### LangChain : agent et middleware

La documentation officielle décrit `create_agent` comme un agent et son harness (prompt, outils, middleware). Le projet est déjà sur ce modèle. LangChain offre aussi des middlewares préconstruits pour erreurs, retries, fallback de modèle, résumé, HITL, limites, détection PII, sélection d'outils, filesystem, sous-agents et édition du contexte.

| Capacité officielle | Situation backend ERP-RH | Écart / décision recommandée |
|---|---|---|
| Création d'agent, outils, contexte et prompt dynamique | Utilisés par `agent.py`; les outils viennent du MCP Spring autorisé | Aucun chantier de remplacement. Continuer à faire porter calculs, droits et filtres par les domaines Spring. |
| Sélection d'outils | `LLMToolSelectorMiddleware` activé; en erreur d'analyse, comportement configuré pour rendre tous les outils disponibles | Pas un manque de capacité. Mesurer précision, latence et coût sur le jeu de référence; revoir le mode de secours seulement si une fuite de contexte ou une régression est observée. |
| Limites modèle/outils | `ModelCallLimitMiddleware` et `ToolCallLimitMiddleware` installés; limites d'infrastructure également configurées dans LiteLLM/proxy | Couverture présente. Le plan doit vérifier durée totale, tokens et limites par utilisateur sans inventer de quota payant ou de nouvelle règle. |
| Gestion des exceptions outil (`ToolErrorMiddleware`) | Non présent dans le middleware listé | Écart potentiel. La doc officielle permet des erreurs contrôlées et expurgées visibles par le modèle; définir avant adoption quelles erreurs métier peuvent être corrigées par le modèle et lesquelles doivent arrêter le run. |
| Retry outil (`ToolRetryMiddleware`) | Non présent; MCP utilise un timeout et les appels passent par Spring | Écart potentiel, pas à activer globalement. Classer les outils lecture/requête et ne retenter que les erreurs réseau transitoires; aucun retry aveugle après une mutation ou un timeout à résultat inconnu. |
| Retry modèle (`ModelRetryMiddleware`) | Pas installé dans `agent.py`; `ChatLiteLLM` a `max_retries=0`, la passerelle LiteLLM orchestre le fallback fournisseur | Décision à prendre à partir des traces d'erreur. Éviter d'empiler les retries LangChain, SDK et LiteLLM; garder une seule politique explicite et bornée. |
| Fallback de modèle LangChain | Non présent; le routage et fallback sont assurés par LiteLLM | La capacité est déjà couverte au niveau passerelle. Ne pas dupliquer sans démontrer un cas que LiteLLM ne couvre pas. |
| Résumé / compactage | `SummarizationMiddleware` installé avec seuil de 40 000 jetons et 12 messages conservés | Présent; réconcilier ce seuil avec les mentions historiques de 12 000 dans `docs/ia.md`, puis mesurer les pertes de faits et le coût. |
| Human-in-the-loop LangChain | `HumanInTheLoopMiddleware` absent; les outils IA exposés sont actuellement en lecture | À prévoir à la première mutation : règles d'approbation par outil, données résumées à l'approbateur, refus, expiration, identité et réautorisation. Le simple fait qu'une fonction existe dans LangChain ne justifie pas de l'activer aujourd'hui. |
| PII middleware | `PIIMiddleware` absent. Le projet a explicitement écarté Presidio sur données réelles; le masquage OpenInference reste à prouver | Écart de preuve et de décision, pas une permission d'ajouter un filtre. Tester des données synthétiques CIN/IBAN/téléphone/courriel sur les spans réels; demander validation avant de changer le traitement RH. |
| Context editing | Aucun `ContextEditingMiddleware` trouvé | Capacité disponible, mais aucun signal établi de croissance problématique hors stratégie de résumé. Priorité basse; mesurer d'abord. |
| Structured output / validation | Contrats structurés par outils et sélecteur; validation métier portée par Spring | Revoir les erreurs fournisseur et le format du sélecteur dans le jeu de référence. Ne pas déplacer les calculs/décisions métier au modèle. |
| Middleware maison ERP | `ContexteErp` et `SurfacesResultats` sont des middlewares utilisant des hooks officiels | Ils encapsulent des règles propres à l'ERP et la composition A2UI, pas une réimplémentation évidente d'un middleware LangChain. Garder ces extensions minimales et liées aux besoins métier. |

### LangGraph : exécution, mémoire et reprise

Les docs séparent les checkpoints (état à court terme d'un fil) et le Store (données durables entre fils). Elles décrivent aussi `interrupt()` comme une pause sauvegardée par checkpointer puis une reprise via `Command`, sur le même `thread_id`.

| Capacité officielle | Situation backend ERP-RH | Écart / décision recommandée |
|---|---|---|
| Checkpointing par fil | PostgreSQL via `AsyncPostgresSaver`; namespace utilisateur dans `espace_conversation` | Déjà implémenté. Maintenir l'isolation, la purge, et tester la configuration de production où `IA_DATABASE_URL` doit être présente. |
| Reprise d'exécution après interruption/erreur | Checkpointer en place; reprise de conversation possible, mais aucune interruption backend métier repérée | Ne pas confondre « reprendre une conversation » et « reprendre un nœud suspendu ». Le second nécessite `interrupt()` et une décision humaine associée. |
| HITL avec interruption dynamique | Non implémenté dans `ia/`; la clarification actuelle passe par un outil navigateur CopilotKit et le prochain run | Écart ciblé avant mutations. Le backend doit porter la demande d'approbation et reprendre le même thread; revérifier authentification, droit, périmètre et données au retour. |
| Store long terme | Aucun store fourni à l'agent | Écart fonctionnel, mais décision sensible. Définir consentement, faits permis, namespace par utilisateur, TTL, inspection, rectification, oubli et purge avant toute mémoire persistante cross-thread. |
| État runtime distinct du state | Identité et outils sont construits côté backend par requête; le state du navigateur est jeté | Modèle de confiance sain. Documenter quelles données doivent vivre dans état interne, runtime immuable ou message, sans accepter une identité ou un droit du navigateur. |
| Retries et exécution durable | Pas de politique retry dédiée dans `creer_agent`; limites et gestion d'erreur existent à plusieurs couches | Établir une matrice d'erreurs et un budget total. Pour toute mutation future, rendre l'effet idempotent côté domaine et vérifier l'issue avant reprise. |
| Graphes explicites, sous-graphes, multi-agent | Aucun graphe métier dédié; un agent général sélectionne ses outils autorisés | Pas d'écart actuel démontré. Garder le modèle un-agent jusqu'à preuve qu'un domaine a besoin d'instructions, d'outils ou budgets séparés. |
| Time travel / replay | Non repéré comme capacité produit | Priorité basse pour produit RH. Évaluer comme aide à incident seulement avec données synthétiques et politique de confidentialité. |

### Deep Agents : harness optionnel

La documentation officielle présente Deep Agents comme un harness LangChain/LangGraph pour travail complexe : `write_todos`, système de fichiers virtuel/backends, sous-agents, mémoire longue, permissions et approbation humaine. Les backends peuvent aussi exposer `execute`/interpréteur selon configuration. La documentation recommande un agent LangChain ou un graphe LangGraph plus simple quand ces capacités ne sont pas nécessaires.

| Capacité Deep Agents | Recouvrement ou écart ERP-RH | Décision proposée |
|---|---|---|
| Planification / `write_todos` | Le `TodoListMiddleware` LangChain couvre déjà le besoin simple | Aucun bénéfice démontré à remplacer l'agent courant. |
| Sous-agents synchrones/asynchrones | Absents du runtime; multi-agent seulement conditionnel dans l'architecture documentée | Étudier après cas mesuré (comparaison longue, dossier RH) et définir des outils/autorisations minimales par rôle. |
| Fichiers virtuels, recherche et délestage de contexte | Absents; les outils ERP renvoient des résultats paginés et des surfaces A2UI | Pertinent uniquement pour documents volumineux approuvés. Pas d'accès direct aux dossiers ou aux fichiers RH par défaut. |
| Skills chargées à la demande | Absentes | Peut organiser procédures et connaissances si elles deviennent nombreuses; chaque source doit être versionnée et autorisée. |
| Store long terme | Même écart que LangGraph Store | Ne pas activer une mémoire implicite; définir d'abord les règles de données et d'effacement. |
| Permissions filesystem | Pas de filesystem agent actuellement | Si un prototype est autorisé, partir des mécanismes officiels `backend`/permissions et d'un backend virtuel/isolé, pas d'un accès disque ERP-RH. |
| Shell / interpréteur | Absent et non nécessaire à l'assistant RH de consultation | Hors périmètre produit à ce stade. Toute expérimentation exigerait une décision sécurité et un sandbox isolé. |
| Harness profiles | Non utilisés | Beta/optionnel; n'apporte pas de besoin immédiat. Évaluer seulement si diversité réelle des modèles exige des configurations conditionnelles. |

## Ordre de traitement recommandé

| Priorité | Sujet | Pourquoi maintenant | Porte de sortie |
|---|---|---|---|
| P0 | Réconcilier les faits/version/status de la documentation IA | `docs/ia.md` contient des seuils de résumé et des statuts historiques différents de la configuration courante. | Table des versions verrouillées et configuration active concordantes; aucun écart doc/code silencieux. |
| P1 | Prouver la confidentialité des traces Phoenix sur un run réel | Le plan IA laisse le masquage réel ouvert; les traces peuvent contenir messages et résultats d'outils. | Trace synthétique inspectée de bout en bout, aucun CIN/autre donnée sensible visible, procédure d'annotation et rétention documentée. |
| P1 avant toute écriture | Concevoir interruption, approbation et reprise LangGraph | Checkpointer existe mais `interrupt()` n'est pas utilisé; outils IA sont en lecture aujourd'hui. | Cas métier autorisé, confirmation serveur, réautorisation à la reprise, idempotence métier et audit. |
| P2 | Politique erreur/retry entre LangChain, MCP et LiteLLM | Pas de retry LangChain; plusieurs couches peuvent sinon répéter ou cacher une erreur. | Matrice par type d'erreur et classe d'outil, budget maximal, messages expurgés, aucun replay ambigu de mutation. |
| P2 | Mémoire Store inter-fils | Non implémentée, risque RH important | Décision métier/privacy écrite avant implémentation : types de données, consentement, durée, contrôle et oubli. |
| P3 conditionnel | Sous-agents / Deep Agents | Non requis par le socle et potentiellement coûteux en appels, permissions et surface d'attaque | Benchmark démontrant qu'un cas long/spécialisé s'améliore sans régression d'accès, latence ni coût. |
| P4 | Context editing / autres middlewares optionnels | Aucun incident actuel démontré justifiant leur activation | Mesure de contexte ou d'erreur et benchmark avant activation. |

## Versions observées dans le backend

Versions du lockfile au moment de l'analyse : LangChain `1.4.7`, LangGraph `1.2.19`, `langchain-litellm` `0.11.2`, `ag-ui-langgraph` `0.0.47`, `langgraph-checkpoint-postgres` `3.2.0`. Aucune dépendance `deepagents` n'est déclarée. La borne minimale de LangGraph dans `pyproject.toml` est alignée sur `1.2.19`; cette analyse ne certifie pas la compatibilité d'une version future.

## Sources officielles

- [LangChain — Agents](https://docs.langchain.com/oss/python/langchain/agents)
- [LangChain — Vue d'ensemble des middlewares](https://docs.langchain.com/oss/python/langchain/middleware/overview)
- [LangChain — Middlewares préconstruits](https://docs.langchain.com/oss/python/langchain/middleware/built-in)
- [LangGraph — Interruption et reprise](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [LangGraph — Persistance, checkpoints et Store](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangGraph — Mémoire](https://docs.langchain.com/oss/python/langgraph/add-memory)
- [Deep Agents — Vue d'ensemble](https://docs.langchain.com/oss/python/deepagents/overview)
- [Deep Agents — Backends, filesystem et permissions](https://docs.langchain.com/oss/python/deepagents/backends)
- [Deep Agents — Sous-agents](https://docs.langchain.com/oss/python/deepagents/subagents)
