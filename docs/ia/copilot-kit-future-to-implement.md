# Copilot Kit Future to Implement

> Plan transversal d'inventaire des capacités de CopilotKit, LangChain, LangGraph et Deep Agents.
> Ce document est volontairement séparé des TODO généraux : il distingue ce qui est déjà utilisé,
> les capacités candidates à évaluer et les éléments qui ne doivent être développés qu'après validation
> d'un besoin métier. Il ne vaut pas autorisation d'ajouter une fonction payante ni de modifier les
> règles métier.

> L'analyse de comparaison des capacités IA du **backend** avec le code réel et la documentation officielle est dans
> [Analyse des écarts IA backend](backend-gap-analysis.md). L'interface frontend est hors périmètre de ce document.

Dernière revue : 2026-10-31.

## But et règles du plan

- Faire l'inventaire des concepts officiels que l'équipe peut ne pas connaître, et éviter de confondre
  une capacité de bibliothèque avec une fonction déjà présente dans ERP-RH.
- Vérifier chaque capacité contre les versions réellement verrouillées avant de la planifier :
  CopilotKit Angular `0.6.0`, runtime `1.83.0`, LangChain `1.4.7`, LangGraph `1.2.19` et
  `langgraph-checkpoint-postgres` `3.2.0`. Deep Agents n'est pas une dépendance verrouillée.
- **Politique de versions décidée par le propriétaire (2026-10-31)** : garder les dépendances IA
  frontend et backend alignées sur la dernière version officielle disponible. À chaque revue, établir
  l'inventaire des versions et adopter les mises à jour avec leurs migrations et contrôles de
  compatibilité; une version publiée n'est pas réputée compatible sans vérification. Les préversions
  majeures sont suivies séparément et ne remplacent pas le canal stable sans preuve de migration.
- Rester sur les frameworks et leurs points d'extension officiels. Ne pas recopier leur comportement
  en code ERP-RH.
- Ne pas adopter toutes les fonctions disponibles. Chaque adoption doit répondre à un parcours réel,
  respecter les permissions, l'audit, la confidentialité RH et le déploiement local/gratuit.
- Les capacités récentes de la documentation en ligne peuvent ne pas exister dans les versions
  installées. La compatibilité exacte doit être prouvée avant toute implémentation ou mise à niveau.

## CopilotKit

CopilotKit apporte l'interface et les primitives de connexion entre le produit et l'agent. Il ne
remplace pas les règles métier ni les autorisations Spring.

| Concept | État ERP-RH | Suite à donner |
|---|---|---|
| Chat, panneau latéral, streaming du texte et du raisonnement | ✅ Utilisés dans l'assistant Angular | Conserver et vérifier leur parité entre panneau et espace immersif. |
| Suggestions de questions | ✅ Suggestions avant le premier message, à partir des capacités autorisées | Vérifier qu'elles restent sans fil persistant et qu'elles ne divulguent aucune donnée RH. |
| Contexte de l'écran | ✅ `connectAgentContext` envoie domaine et filtres comme indice | Garder cette donnée en lecture seule et la faire revalider côté serveur. Ne pas l'appeler « état partagé ». |
| Question interactive de clarification | ✅ `registerHumanInTheLoop` avec `poser_question`, choix ou réponse libre | Conserver comme clarification. Ce n'est pas une approbation d'écriture. |
| Rendu des appels d'outils backend | ✅ Rendu personnalisé des appels MCP Spring | Réutiliser les renderers partagés avant d'ajouter un renderer métier. |
| A2UI / interface générative déclarative | ✅ Catalogue A2UI contrôlé par l'ERP, composants de tableau, indicateurs et graphique | Garder le catalogue fermé et contrôler les données présentées. Éviter les interfaces arbitraires. |
| Outils frontend pour agir sur l'interface | 🟨 Le mécanisme est utilisé pour la question, pas pour piloter des écrans métier | Évaluer uniquement pour un cas utile et réversible, par exemple ouvrir une vue ou préparer un filtre. Le serveur demeure l'autorité. |
| État agent ↔ interface bidirectionnel | ⬜ Non établi : le contexte d'écran est envoyé, mais aucun brouillon métier synchronisé n'a été identifié | Examiner le state AG-UI/CopilotKit sur un parcours concret; préciser propriété, validation, conflits et source d'autorité avant adoption. |
| Approbation avant un outil d'écriture | ⬜ Non implémentée; les outils MCP IA actuels sont en lecture seule | Lorsqu'une première écriture est autorisée, construire le parcours de proposition, approbation/refus et reprise; revérifier droits et données au moment de l'effet. Voir aussi la section LangGraph. |
| Composant applicatif rendu comme outil (Components as Tools) | ⬜ Non identifié dans l'application | Comparer à A2UI et aux renderers existants. Ne l'adopter que si un composant Angular précis doit être choisi/rendu par l'agent. |
| MCP Apps, UI fournie par un serveur MCP | ⬜ Candidate déjà notée en T23 | Faire un prototype isolé et vérifier compatibilité de la version Angular, isolation iframe, RBAC, accessibilité et provenance. Décider avant migration. |
| Historique, liste des anciens fils et titres | 🟨 Reprise/persistance présentes; liste et titres absents (T21) | Étudier une voie gratuite sur le runner local; ne pas dépendre de CopilotKit Intelligence. Définir suppression, rétention et isolement par utilisateur. |
| Reconnexion, rattrapage du flux, pièces jointes et voix | ⬜ Parcours non identifié | Vérifier d'abord si les versions verrouillées les supportent; prioriser avec les utilisateurs, puis cadrer consentement, types de fichiers, antivirus et données RH. |
| Tâches proactives / apprentissage automatique des conversations | ⬜ Non activés | Ne pas activer par défaut. Évaluer utilité, consentement, fuite de données, validation humaine et compatibilité gratuite/localisée. |
| Inspector et fonctions CopilotKit Intelligence | 🚫 Inspector désactivé; les fonctions payantes sont exclues par décision | Maintenir l'absence d'abonnement et ne pas inscrire une fonction payante comme tâche de réalisation. |

## LangChain

LangChain porte l'agent, les outils et les middlewares. Il s'exécute ici sur LangGraph.

| Concept | État ERP-RH | Suite à donner |
|---|---|---|
| `create_agent`, modèles ChatLiteLLM, outils MCP officiels | ✅ Utilisés | Garder les façades métier et Spring comme autorités; aucun accès agent direct aux repositories. |
| Context engineering et prompt dynamique | ✅ `dynamic_prompt` ajoute les capacités MCP accessibles; le contexte ERP maison restant est suivi en T24 | Terminer T24 avec une ressource/prompt officiel Spring AI si la capacité couvre les besoins, sans remettre de contexte non autorisé dans le modèle. |
| Middleware de planification, sélection d'outils, limites, résumé et CopilotKit | ✅ `TodoListMiddleware`, `LLMToolSelectorMiddleware`, limites de run, `SummarizationMiddleware`, `CopilotKitMiddleware` | Garder le jeu de référence pour vérifier que ces middlewares n'enlèvent aucun outil utile et ne dégradent pas les réponses. |
| Human-in-the-loop middleware (`HumanInTheLoopMiddleware`) | ⬜ Non installé dans le parcours actuel | Étudier `InterruptOnConfig` pour les outils d'écriture lorsqu'ils existeront; définir quels outils exigent un accord, le contenu approuvé et la reprise sécurisée. |
| Retries et gestion d'erreurs des outils/modèles | ⬜ `ToolErrorMiddleware`, `ToolRetryMiddleware`, `ModelRetryMiddleware` figurent en M1, non appliqués à ce jour | Vérifier leur comportement dans les versions installées, fixer des limites et éviter les retries en cascade avec LiteLLM/MCP. Jamais de retry aveugle d'une écriture. |
| Nettoyage du contexte d'outils | ⬜ `ContextEditingMiddleware` / `ClearToolUsesEdit` en M1 | Mesurer la croissance réelle des conversations et valider qu'un nettoyage ne retire pas un fait métier nécessaire. |
| Protection PII dans les messages du modèle | ⬜ `PIIMiddleware` et règles de trace sont en M2; masquages infra déjà configurés mais pas prouvés sur les spans actifs | Comparer la protection à la passerelle Presidio et au masquage OpenInference, puis tester CIN, IBAN, téléphone et courriel sur des cas synthétiques. Éviter les doubles transformations non maîtrisées. |
| Repli de modèle et recherche/émulation d'outils | ⬜ `ModelFallbackMiddleware`, `ProviderToolSearchMiddleware`, `LLMToolEmulator` suivis en M3 | Évaluer séparément selon les pannes et limites observées; comparaison sur jeu de référence avant adoption. Le routage LiteLLM actuel reste la première frontière de repli. |
| Sortie structurée et validation | 🟨 Utilisées par les schémas d'outils/sélecteur et les contrats Pydantic, avec pannes de format fournisseur déjà observées | Revoir les erreurs de JSON/schema (dont le sélecteur); valider compatibilité modèle par modèle, retries bornés et erreurs visibles, sans supposer que le mode JSON est fiable partout. |
| Évaluation | ✅ `openevals` et `agentevals` sur le jeu de référence local | Faire aboutir V1c (24/24 et objectif p95) avant d'étendre les agents ou changer les middlewares. Garder les données de test synthétiques. |
| LangChain mémoire à long terme | ⬜ Ne pas confondre avec le résumé/checkpointer actuels; le Store LangGraph est suivi en T25 | Évaluer mémoire explicite par utilisateur uniquement si elle apporte un bénéfice métier, avec consentement, inspection, correction, oubli et expiration. |

## LangGraph

LangGraph porte l'exécution, les états, le checkpoint et la reprise. Il ne rend pas les effets métier
« exactement une fois » à lui seul.

| Concept | État ERP-RH | Suite à donner |
|---|---|---|
| Graphe d'exécution de l'agent | ✅ `create_agent` s'appuie sur LangGraph; AG-UI expose le flux | Garder les graphes simples tant qu'un besoin de workflow explicite ne l'exige pas. |
| Checkpointing et reprise de conversation | ✅ Checkpointer PostgreSQL, fils isolés par sujet/utilisateur | Continuer les tests de reprise/redémarrage et la politique de purge; T25 suit Store/expiration. |
| État partagé entre étapes | ✅ L'état interne LangGraph existe | ⬜ Formaliser le schéma d'état et différencier état interne, contexte runtime immuable et état frontend fourni par l'utilisateur. Ne pas prendre le navigateur comme source fiable. |
| Interruptions `interrupt()` et reprise `Command(resume=...)` | ⬜ Aucun appel LangGraph identifié | Implémenter seulement avec un parcours humain réel : pause persistée, approbation/refus, reprise via le même thread, authentification et contrôle d'accès réévalués. |
| Effets métier et idempotence | ⬜ Les outils agent restent en lecture aujourd'hui | Avant toute écriture : identifiant de commande stable, déduplication dans le domaine, vérification de l'issue après timeout, audit et absence de retry automatique ambigu. |
| Retries, erreurs récupérables et compensation | ⬜ Politique transversale à préciser avec M1 | Définir les frontières de retry, nombre d'essais, budget/délai total, erreurs non rejouables et comportement de compensation. |
| Store longue durée / mémoire inter-fils | ⬜ T25, distinct du checkpointer | Décider quelles préférences peuvent être conservées; namespaces par utilisateur, TTL, consultation et suppression vérifiables. |
| Subgraphs et multi-agent | ⬜ Non utilisés dans le service courant | Introduire seulement si un domaine nécessite ses propres instructions/outils/budget ou une tâche longue mesurée; conserver des permissions minimales par sous-agent. |
| Runtime de déploiement LangGraph / LangSmith | 🚫 Pas dans l'architecture retenue actuellement | Garder le runtime CopilotKit + AG-UI + service FastAPI auto-hébergé, sauf décision nouvelle compatible avec l'exigence de gratuité et de maîtrise des données. |

## Deep Agents

Deep Agents est une couche optionnelle construite sur LangChain et LangGraph; elle n'est pas une
dépendance du projet et `create_deep_agent` n'est pas employé. L'adopter n'est pas un objectif en soi.

| Concept | État ERP-RH | Suite à donner |
|---|---|---|
| Décomposition et plan de tâches | ✅ Besoin de plan simple couvert aujourd'hui par `TodoListMiddleware` de LangChain | Ne pas ajouter Deep Agents uniquement pour obtenir une todo list. |
| Subagents spécialisés | ⬜ Non employés; candidats conditionnels dans la stratégie IA | Évaluer si un cas mesuré justifie instructions, outils, budget ou contexte isolés par domaine; vérifier que les droits sont appliqués à chaque outil. |
| Fichiers virtuels et délestage de contexte | ⬜ Non employés | Évaluer pour documents volumineux ou tâches longues, avec stockage éphémère et règles d'accès; pas de copie locale générale des dossiers RH. |
| Skills chargées à la demande | ⬜ Non employées | Évaluer pour procédures nombreuses; chaque skill doit avoir une source, version, périmètre et revue, sans remplacer RBAC ni politique système. |
| Backend/sandbox, shell et interpréteur | ⬜ Non employés | Pas d'accès shell libre à l'ERP. Toute expérimentation nécessite un sandbox conteneurisé, ressources bornées, réseau contrôlé et approbation de sécurité; probablement hors périmètre produit. |
| Mémoire inter-conversations | ⬜ Dépend du Store LangGraph (T25) | Traiter d'abord politique d'oubli et confidentialité; une mémoire longue n'est pas à activer par défaut pour les données RH. |
| HITL des sous-agents/outils | ⬜ Non implémenté | Réutiliser l'interruption LangGraph officielle et les contrôles serveur; ne pas traiter un clic frontend comme autorisation métier. |
| Profils de modèle/harness Deep Agents | ⬜ Bibliothèque absente et profils documentés comme évolutifs | Réexaminer seulement après décision d'adopter Deep Agents et validation des versions gratuites/locales. |

## Ordre de travail proposé

Cet ordre sert à l'analyse ultérieure; il ne démarre pas automatiquement une implémentation.

1. **P0 — Aligner les versions IA** : les manifests et lockfiles de ce checkout ont été relevés/actualisés pendant
   cette revue : runtime CopilotKit `1.83.0`, LangGraph verrouillé `1.2.19`; voir le [détail des versions backend](backend-gap-analysis.md#versions-observées-dans-le-backend).
   Réexaminer la préversion CopilotKit `2.0.0-rc.1` à part : elle n'est pas la version `latest` stable.
2. **P0 — Vérifier les fondations actuelles** : traces Phoenix bout en bout et masquage réel; qualification V1c;
   distinction contexte d'écran / état synchronisé; versions et API officielles effectivement installées.
3. **P1 — Préparer les futures écritures** : définir la politique d'approbation, le parcours CopilotKit,
   `interrupt()` LangGraph, réautorisation, validation à la reprise, idempotence et audit. À livrer avec
   le premier outil d'écriture, pas séparément comme confirmation décorative.
4. **P2 — Fiabiliser les appels** : tester les middlewares officiels de retries, d'erreurs et de gestion de
   contexte sur le jeu de référence; éviter les retries des effets incertains et les cascades de retries.
5. **P3 — Mémoire et fils** : décider Store/TTL, purge et historique local avec titres en restant gratuit et
   sans fuite entre utilisateurs.
6. **P4 — Évaluer les interfaces avancées** : prototype MCP Apps vs A2UI existant, puis état bidirectionnel,
   reconnexion et pièces jointes seulement sur demande utilisateur démontrée.
7. **P5 — Réexaminer Deep Agents** : uniquement quand un cas d'usage démontre la nécessité de subagents,
   fichiers virtuels, skills ou exécution isolée. N'ajouter ni shell ni interpréteur à l'agent ERP sans
   décision de sécurité explicite.

## Références officielles

Pour le détail des écarts backend LangChain, LangGraph et Deep Agents, voir [l'analyse dédiée](backend-gap-analysis.md).

- CopilotKit : [Angular](https://docs.copilotkit.ai/angular), [primitives de Generative UI](https://docs.copilotkit.ai/concepts/generative-ui-overview), [HITL Angular](https://docs.copilotkit.ai/angular/ag2/guides/human-in-the-loop), [`registerHumanInTheLoop`](https://docs.copilotkit.ai/reference/angular/functions/registerHumanInTheLoop).
- LangChain : [middleware](https://docs.langchain.com/oss/python/langchain/middleware), [agents](https://docs.langchain.com/oss/python/langchain/agents), [context engineering](https://docs.langchain.com/oss/python/langchain/context-engineering).
- LangGraph : [interruptions](https://docs.langchain.com/oss/python/langgraph/interrupts), [persistance/checkpoints](https://docs.langchain.com/oss/python/langgraph/persistence), [mémoire](https://docs.langchain.com/oss/python/langgraph/add-memory).
- Deep Agents : [vue d'ensemble](https://docs.langchain.com/oss/python/deepagents/overview), [subagents](https://docs.langchain.com/oss/python/deepagents/subagents), [backends et permissions](https://docs.langchain.com/oss/python/deepagents/backends).

