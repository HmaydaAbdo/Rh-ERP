# Plan de travail IA — document unique des tâches restantes

> **Document de référence du travail IA (validé en principe par le propriétaire le 2026-10-31).** Ce fichier regroupe, en
> un seul endroit, tout ce qui reste à faire pour l'IA d'ERP-RH : l'historique complet des anciens plans (y compris les
> documents supprimés le 2026-10-24), le plan actuel de `docs/ia.md`, l'inventaire des fonctions de CopilotKit, LangChain,
> LangGraph et Deep Agents, et l'analyse des écarts du backend. Chaque tâche a été **comparée au code du dépôt** : ce qui
> est déjà fait n'y figure pas (voir § 2). Les points que le code ne permet pas de trancher sont des **questions**
> (§ 6) : aucune n'est supposée résolue.
>
> Ce que ce document ne remplace pas : `docs/ia.md` garde les décisions, l'architecture, l'état technique et le journal.
> Il remplace en revanche son § 7 (tableaux de tâches), qui devient un renvoi ici, et les deux fichiers de Codex
> `copilot-kit-future-to-implement.md` et `backend-gap-analysis.md`, **supprimés le 2026-10-31** après vérification que
> chacune de leurs informations figure ici (relisibles avec `git show 0b2fd0da:docs/ia/<fichier>`).

## 0. Suivi d'avancement (le seul endroit où l'on marque l'état)

**Règle de travail** : l'assistant avance épopée par épopée dans l'ordre du § 4, ne marque une tâche « Terminé » que si sa
« preuve de terminé » est fournie, ne supprime ni fichier, ni branche, ni donnée hors du périmètre de la tâche en cours, et
met à jour ce tableau dans le même commit que le travail.

**Vocabulaire** (une tâche et une épopée n'ont qu'un état) :

| État | Sens |
|---|---|
| **Terminé** | Toutes les preuves de terminé sont fournies et le code est dans `main` ou prêt sur `dev/suivi`. |
| **Partiel** | Une partie est livrée et utilisable ; le reste est listé. |
| **Incomplet** | Commencé mais non utilisable en l'état, ou bloqué par une décision ; la cause est notée. |
| **Non touché** | Rien n'est commencé. |

Toute tâche est **Non touché** tant qu'elle ne figure pas dans la colonne « Exceptions ».

| Épopée | État | Exceptions (tâches non « Non touché ») |
|---|---|---|
| E0 Socle de vérité | Partiel | E0.1 **Partiel** (2026-10-31 : verrous Python et npm alignés, `@ag-ui/a2ui-middleware` 0.0.14 ; `@a2ui/web_core` 0.14.0 **testé et refusé** : le rendu de `@copilotkit/angular` 0.6.0 est écrit pour 0.10.4 et 3 tests du catalogue ERP échouent ; `openai` bloqué par `litellm`, E14) |
| E1 Fiabilité de l'agent | Non touché | — |
| E2 Confidentialité, traces, conformité | Non touché | — |
| E3 Sécurité par fiche de poste | Non touché | — |
| E4 Résorption du code maison | Non touché | — |
| E5 Conversations et mémoire | Non touché | — |
| E6 Interface CopilotKit complète | Non touché | — |
| E7 Écritures et approbation humaine | Non touché | Bloquée par Q4 |
| E8 RAG et assistant réglementaire | Non touché | — |
| E9 Agents spécialisés, Deep Agents | Non touché | — |
| E10 Pilote réel, exploitation | Non touché | — |
| E11 Rôles, départements, hiérarchie, champs | Non touché | — |
| E12 Migration Spring → Python FastAPI | Non touché | Bloquée par Q15 (ADR) |
| E13 Services payants ou hébergés | Non touché | Bloquée par Q3 |
| E14 IA interne : vLLM et sortie de LiteLLM (dernière) | Non touché | Bloquée par Q18 |

## 1. Principes

Décisions du propriétaire, dont celle du **2026-10-31** (en gras) :

0. **Aucune supposition sur un framework** (décision du 2026-10-31) : une affirmation sur le comportement, la version
   ou la gratuité d'un framework ou d'une bibliothèque n'est écrite qu'après lecture **de la page officielle ou du code
   source**, en entier ; une lecture tronquée est poursuivie (par exemple avec `curl` sur le fichier brut) ; ce qui n'a pas
   pu être lu est noté « non vérifié ». Les connaissances de mémoire ne sont pas une source.
1. **Utiliser toutes les fonctions que fournissent les frameworks** (CopilotKit, LangChain, LangGraph, Deep Agents) pour
   profiter de leur expérience éprouvée. Ce principe **remplace** la règle « ne pas adopter toutes les fonctions disponibles,
   chaque adoption doit répondre à un parcours réel » des anciens documents de Codex. Une fonction n'est écartée que par une décision écrite du propriétaire ou parce qu'elle
   enfreint un garde-fou ci-dessous ; celles qui exigent un service payant ou hébergé sont **regroupées dans la dernière
   épopée (E13)**.
2. **Dernières versions stables seulement**, alignées à chaque revue ; les préversions sont suivies à part. **Une version
   publiée n'est pas réputée compatible sans vérification** (tests, migration documentée).
3. **Documentation officielle seule** comme source de vérité ; pas de recopie du comportement d'un framework en code ERP-RH
   (« zéro code IA fait maison », décision du 2026-10-27).
4. **Dépasser les limites actuelles par la mesure** : les plafonds du code (§ 3) sont des réglages, pas des principes ;
   chacun est rendu configurable, mesuré, puis relevé ou justifié.
5. Garde-fous qui ne bougent pas, pour **chaque** fonction adoptée :
   - **gratuit** : aucun abonnement ni service payant (décision du 2026-10-27) ;
   - **Spring reste l'autorité** des données, droits, filtres et calculs ; les droits sont revérifiés à chaque appel ;
   - **données RH** : minimisation, audit, loi 09-08 ; aucune donnée réelle vers un modèle externe sans décision (Q5) ;
     **le masquage des champs sensibles est une règle métier appliquée côté Spring** (décision du 2026-10-31, E11) ;
   - **auto-hébergé** : les services hébergés par l'éditeur (CopilotKit Intelligence, LangSmith) sont exclus tant que
     E13 n'est pas décidée (Q3).
6. **Définition de « terminé »** pour toute tâche : test automatisé vert, droits testés (cas négatifs), preuve au navigateur
   ou dans une trace Phoenix pour ce qui se voit, documentation à jour.
7. **Une seule branche de suivi** (`dev/suivi`), un commit thématique par tâche, une PR à la fois et seulement sur demande.

## 2. Déjà fait (comparé au code le 2026-10-31) — donc absent du plan

- **Backend IA** : `create_agent` (LangChain 1.4.7) sur LangGraph 1.2.19 ; middlewares `TodoListMiddleware`,
  `ModelCallLimitMiddleware`, `ToolCallLimitMiddleware`, `SummarizationMiddleware` (40 000 jetons, résumé interne),
  `LLMToolSelectorMiddleware`, `CopilotKitMiddleware`, `dynamic_prompt` ; checkpointer `AsyncPostgresSaver` dans une base
  dédiée, fils isolés par utilisateur, purge après inactivité ; flux AG-UI (`ag-ui-langgraph`) ; évaluation `openevals` /
  `agentevals` ; traces OpenTelemetry vers Phoenix ; passerelle LiteLLM multi-fournisseurs gratuits avec garde-fou officiel
  `litellm_content_filter` ; vérificateur de chiffres **supprimé** (V1f).
- **Outils métier** : 30 outils MCP **en lecture seule** (Spring AI), dont `paie_comparer` (V1d, calculs côté Spring),
  Heures supplémentaires, Audit, Paramètres, Rôles ; jeton agent RS256 court ; aucune écriture.
- **Interface** : `CopilotChat`, `CopilotSidebar`, libellés (`provideCopilotChatLabels`), `injectAgentStore`,
  `connectAgentContext` (contexte d'écran), `registerHumanInTheLoop` (question de clarification), suggestions de départ,
  catalogue A2UI de l'ERP (tableau, indicateurs, graphique), runtime CopilotKit 1.83.0 avec `SqliteAgentRunner`.
- **Plan** : T1 à T8, T11 à T17, T19 (côté service), T22, V1a, V1d, V1f, J0. **Partiels, donc repris plus bas** : T9 et T20
  (démonstration J1 → E10.1), T10 (qualification → E0.3), T18 (observabilité → E2.2, E2.3), T19 (reprise du fil dans
  l'interface → E0.6, E5.1) ; J1 reste « en cours » tant que ces points ne sont pas clos.

## 3. État des versions et des plafonds (relevé du 2026-10-31)

Versions : `uv.lock` / `package-lock.json` contre PyPI et npm. Les écarts sont des tâches (E0.1).

| Composant | Verrouillé | Dernière stable | Remarque |
|---|---|---|---|
| `langchain`, `langgraph`, `langgraph-checkpoint-postgres`, `langchain-litellm`, `ag-ui-langgraph`, `ag-ui-protocol`, `copilotkit` (Py), `mcp`, `openevals`, `@copilotkit/angular`, `@copilotkit/runtime`, `@ag-ui/client` | à jour | identique | — |
| `langchain-core`, `langgraph-sdk`, `litellm`, `openinference-instrumentation-langchain`, `pydantic`, `pydantic-settings` | **alignés le 2026-10-31** (1.7.3, 0.4.11, 1.106.6, 0.1.81, 2.14.2, 2.16.2), 51 tests passés | identique | `litellm` 1.109.0.dev2 existe : préversion, non adoptée |
| `openai` | 2.54.0 | 3.42.0 | **bloqué par `litellm` 1.106.6, qui exige `openai<3.0.0`** (et `langchain-openai` 1.7.3 `>=2.45.0`) : limite **consignée** ; la 3.x sera adoptée dans **E14**, quand LiteLLM sera abandonné (ou s'il lève sa borne avant) |
| `agentevals` | 0.0.9 | 0.0.9 | **dernière publication le 2025-07-24** : bibliothèque dormante, conservée (décision du 2026-10-31), à surveiller |
| `@copilotkit/core`, `@copilotkit/shared`, `web-inspector`, `web-components`, `mcp-apps-renderer` (frontend) | **1.83.0 le 2026-10-31** | 1.83.0 | **Cause de l'écart** : ce sont des dépendances **transitives** de `@copilotkit/angular` 0.6.0 (`^1.79.1`) ; le verrou n'avait jamais été relevé. Corrigé par `npm update`, build, lint et 965 tests passés |
| `@a2ui/web_core` | 0.10.4 | 0.14.0 | **bloqué par le rendu** : `@copilotkit/angular` 0.6.0 (dernière stable) épingle 0.10.4 ; avec 0.14.0 forcé, 3 tests du catalogue ERP échouent (changements incompatibles du journal 0.11 à 0.14, dont le renommage des classes CSS). Le catalogue de base du service IA reste celui de 0.10.4. À relever avec la prochaine version de `@copilotkit/angular` qui épingle une version plus récente |
| `@ag-ui/a2ui-middleware` (surcharge) | **0.0.14 le 2026-10-31** | 0.0.14 | build, lint et 965 tests passés |
| `deepagents` | absent | 0.7.32 | non adopté |
| CopilotKit `next` | — | 2.0.0-rc.7 | préversion : suivie, non adoptée |

Plafonds actuels du code, relevés le 2026-10-31 (à mesurer puis relever, E1.9) : 8 appels de modèle et 8 appels d'outils par
run (`agent.py`) ; délai de modèle 120 s (`config.py`, réglable jusqu'à 600 s) ; résumé à 40 000 jetons en gardant 12 messages ;
`recursion_limit` 200 (`agui.py`) ; 20 lignes au plus par page d'outil MCP (backend). **Il n'existe plus de plafond de
génération de jetons** (l'ancien `max_tokens=1500` a été retiré) **ni de plafond de 12 000 caractères par résultat d'outil**
(cité à tort dans `docs/ia.md` ancien et dans un commentaire de `agent.py`, corrigé le 2026-10-31).

## 4. Épopées, dans l'ordre proposé

Ordre : on assoit d'abord ce qui rend tout le reste mesurable (versions, qualification), puis la fiabilité de l'agent, puis
la confidentialité et la sécurité **avant** toute donnée réelle (E11 d'abord, car E3 en dépend), puis on résorbe le code
maison, puis les conversations, puis l'interface complète, et seulement ensuite les écritures, le RAG, les agents
spécialisés et l'exploitation. La migration du backend (E12) est un chantier de cadrage séparé ; E13 regroupe les services
payants et **E14 (IA interne, vLLM) est la dernière épopée**. Le travail commence par l'agent (E1, dont E1.0 : Deep
Agents). Les dépendances sont indiquées par tâche ; l'ordre est à valider (Q2).

### 4.0 Relecture d'entrée de chaque épopée (décision du 2026-10-31)

Avant la première tâche d'une épopée, lire **en entier** les pages officielles ci-dessous et le journal de modifications des
paquets concernés, pour rattraper les nouveautés ; consigner dans le commit les versions, les nouveautés retenues et les
pages lues. Une épopée ne passe pas à « Partiel » sans cette relecture.

| Épopée | Documentation à relire (index officiel de chacun) |
|---|---|
| E0, E1 | LangChain : agents, middlewares (vue d'ensemble et préconstruits), sortie structurée, runtime, tests ; LangGraph : persistance, durabilité, streaming ; Deep Agents : vue d'ensemble, personnalisation ; journaux de `langchain`, `langgraph`, `deepagents` |
| E2 | LangChain : garde-fous, middleware PII, politique de traces ; LangGraph : persistance (chiffrement) ; Phoenix / OpenInference |
| E3, E11 | Spring Security et Spring AI (serveur MCP) ; LangChain : runtime et contexte |
| E4 | CopilotKit : runtime, authentification, déploiement, `injectThreads` ; LangGraph : stores ; `ag-ui-langgraph` ; Spring Authorization Server |
| E5 | LangGraph : persistance, mémoire, stores ; LangChain : mémoire à long terme, join/rejoin ; Deep Agents : mémoire ; CopilotKit : fils |
| E6 | Toute la documentation CopilotKit Angular (guides, référence, exemples, production, dépannage) ; spécification AG-UI et A2UI |
| E7 | LangChain : human-in-the-loop ; LangGraph : interruptions ; CopilotKit : interactions humaines |
| E8 | pgvector, PostgreSQL (recherche plein texte), documentation du modèle d'embeddings choisi ; LangChain : retrieval |
| E9 | Deep Agents : toutes les pages ; LangChain : multi-agents ; LangGraph : sous-graphes |
| E10 | Documentation des fournisseurs de modèles de la passerelle ; ce qui a changé depuis la dernière relecture |
| E12 | FastAPI, Pydantic, SQLAlchemy, SDK MCP Python |
| E13 | Pages de prix et de licence de chaque éditeur, relues à la date de la décision |
| E14 | vLLM (installation, serveur compatible OpenAI, quantification, parallélisme), LangChain (`langchain-openai`) |

Chaque ligne est une tâche « E*n*.R » de son épopée.

### E0 — Socle de vérité : versions, qualification, démarrage

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E0.1 | Aligner toutes les dépendances IA sur la dernière stable (tableau du § 3), une montée à la fois ; **reste** : `@a2ui/web_core` 0.14.0 (attend une version de `@copilotkit/angular` qui l'épingle), `openai` 3.x (E14). Fait le 2026-10-31 : verrous Python et npm relevés (`core`/`shared` 1.83.0, `a2ui-middleware` 0.0.14) | Verrous à jour, tests et CI verts, note de migration par montée de version majeure | Politique de versions du 2026-10-31 |
| E0.2 | **Veille de versions**, quatre couches complémentaires et gratuites : (1) à l'**ouverture de chaque tâche IA** et au moins une fois par mois, un relevé « verrouillé / dernière stable / préversion » du service IA (PyPI) et de `frontend/` et `copilot-runtime/` (npm), rejoué par un script local du dépôt (modèle : le relevé du § 3) ; (2) **abonnement aux publications** (« Watch → Releases ») des dépôts `langchain-ai/langchain`, `langchain-ai/langgraph`, `langchain-ai/deepagents`, `CopilotKit/CopilotKit`, `ag-ui-protocol/ag-ui`, `a2ui-project/a2ui`, `BerriAI/litellm`, `Arize-ai/openinference`, ainsi que de leurs journaux de modifications ; (3) **Dependabot** : `.github/dependabot.yml` ne couvre que Maven, `frontend/` (npm), Docker et Actions, par trimestre ; y ajouter `ia/` (écosystème `uv`), `copilot-runtime/` (npm) et les images `ia/` et `copilot-runtime/`, mensuel pour les composants IA. **Attention** : une PR Dependabot déclenche la CI automatiquement, ce qui contredit la règle « CI seulement sur demande » (Q19) ; (4) **relecture complète de la documentation officielle à l'entrée de chaque épopée** (§ 4.0) | Script et relevé mensuel consigné au § 3 ; abonnements faits ; Q19 tranchée et appliquée | Politique de versions du 2026-10-31 |
| E0.3 | **V1c — qualification** : jeu de référence 24 sur 24 (dernier relevé exploitable 19/24, p50 9,09 s, p95 39,5 s), puis porté à environ 100 cas avec cas complexes, tri, questions à l'utilisateur, abstentions, refus et comparaisons ; objectif de latence (Q8) | Rapport reproductible, seuils tenus, jeu versionné | V1c, § 4 de l'ancien `docs/ia.md` |
| E0.4 | **V1e — CPU au démarrage** du service `ia` : l'import de `erp_rh_ia.app` coûte 14 s de calcul (dont 7 s `litellm`, 3 s `fastmcp.client`) ; premier démarrage à froid 110 s, puis 27 s. Pistes à lire dans la documentation de LiteLLM et de `langchain-litellm` : barème de coûts local (`LITELLM_LOCAL_MODEL_COST_MAP`), imports différés, client plus léger **à condition que `reasoning_content` reste transmis** | Mesure avant/après, une modification à la fois, raisonnement affiché inchangé | V1e |
| E0.5 | Contrôle documentation ↔ code en CI (versions, seuils, listes d'outils) ; supprimer les mentions périmées (12 000 jetons de résumé, « vérificateur ») | Contrôle vert, plus d'écart connu | « Transverse » de la vision longue ; analyse P0 |
| E0.6 | Écran d'accueil propre de l'assistant (CopilotKit masque l'accueil sur un fil fourni par l'application) ; lenteur ponctuelle à la reprise d'un fil (réponse arrivée côté serveur, affichée seulement au rechargement) | Accueil visible sur fil repris ; cause de la lenteur isolée et corrigée | V1b |
| E0.7 | Outillage des assistants de développement, gratuit : compétences CopilotKit (`npx skills add CopilotKit/CopilotKit/skills`, dont `copilotkit-cli` et `copilotkit verify`) et **serveur MCP de documentation** `https://mcp.copilotkit.ai/mcp` (`claude mcp add --scope project`) pour que Claude lise la documentation à jour au lieu de se souvenir d'API périmées ; modifie la configuration du projet : à valider (Q16) | Serveur listé par `claude mcp list` | « Build with agents » (page lue) |

### E1 — Fiabilité de l'agent : middlewares LangChain et exécution LangGraph

Source : [middlewares préconstruits](https://docs.langchain.com/oss/python/langchain/middleware/built-in) (lue).

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E1.0 | **Passer l'agent sur `create_deep_agent` dès le début** (décision du 2026-10-31 : Deep Agents est un sur-ensemble de `create_agent`). Faits relevés dans la documentation officielle : il accepte `model`, `tools`, `system_prompt`, `middleware`, `subagents`, `skills`, `memory`, `permissions`, `backend`, `interrupt_on`, `response_format`, `state_schema`, `context_schema`, `checkpointer`, `store`, `cache`, `name` et **renvoie un `CompiledStateGraph`** ; il ajoute toujours `FilesystemMiddleware`, `SubAgentMiddleware` (sous-agent généraliste), `SummarizationMiddleware`, `PatchToolCallsMiddleware` et la mise en cache de prompts ; `TodoListMiddleware` reste opt-in (déjà présent chez nous). **Points à prouver avant de fusionner** : (a) aucun interrupteur général n'existe : les outils de fichiers et l'outil `task` sont exposés au modèle ; les restreindre en remplaçant `FilesystemMiddleware` par une instance de même nom avec une liste `tools` autorisée, son propre `backend` (`StateBackend`, jamais `FilesystemBackend`) et ses `permissions` (`deepagents>=0.7`) ; (b) notre `SummarizationMiddleware` (40 000 jetons) remplace celui par défaut s'il porte le même nom ; (c) compatibilité avec `CopilotKitMiddleware`, `ag-ui-langgraph` et `LLMToolSelectorMiddleware` (30 outils MCP + outils du harnais) ; (d) jeu de référence sans régression de justesse, de latence ni de coût. La documentation recommande `create_agent` quand on ne veut pas ces capacités : le gain est de disposer d'emblée des sous-agents, des fichiers virtuels, des compétences et de la mémoire sans seconde migration | Agent migré, jeu de référence ≥ ancien, outils exposés au modèle listés et restreints, tests AG-UI verts | Décision 2026-10-31, E9.0 |
| E1.1 | `ToolErrorMiddleware` (`on_error`, `tools` ; exige `langchain>=1.3.14`) : une exception d'outil devient un message d'erreur **expurgé** que le modèle peut corriger ou qui arrête le run selon une matrice des erreurs métier | Matrice écrite, test : erreur métier, 403, délai, 500 | M1 |
| E1.2 | `ToolRetryMiddleware` et `ModelRetryMiddleware` (`max_retries`, `retry_on`, `on_failure`, `backoff_factor`, `jitter` ; comportement par défaut modifié en `langchain>=1.3.16`) : une **seule** politique de reprise avec LiteLLM (`max_retries=0` côté client) et MCP ; lecture seule rejouable, jamais une écriture | Budget total borné, test sans cascade de reprises | M1 |
| E1.3 | `ContextEditingMiddleware` + `ClearToolUsesEdit` (`trigger`, `keep`, `exclude_tools`, `placeholder`) : effacer les vieux résultats d'outils **sans toucher aux résultats du tour en cours** (cause de l'incident du résumé tronqué du 2026-10-27) | Jeu de référence sans régression, gain de jetons mesuré | M1 |
| E1.4 | `ModelFallbackMiddleware` : second filet sur un autre groupe de modèles, **en plus** du routage LiteLLM (première frontière) | Panne simulée du modèle principal : réponse rendue par le repli | M3 |
| E1.5 | `LLMToolEmulator` : outils simulés dans le banc d'évaluation, en remplacement des doubles de test maison ; modèles factices officiels (`GenericFakeChatModel`) et enregistrement de réponses (VCR) pour les tests sans réseau | Banc sans double maison | M3 |
| E1.6 | `ProviderToolSearchMiddleware` : **non applicable aujourd'hui** (réservé à Anthropic Claude 4+ et OpenAI gpt-5.5+, erreur sinon) ; déplacée en **E13** | Décision en E13 | M3 |
| E1.7 | Sortie structurée officielle : `response_format` avec `ToolStrategy` / `ProviderStrategy` pour le sélecteur d'outils, les surfaces et les réponses structurées ; revoir les pannes de format JSON observées par fournisseur ; revoir le mode de secours du sélecteur (en cas d'erreur d'analyse, tous les outils autorisés sont rendus : à garder seulement si aucune fuite de contexte ni régression n'est mesurée) | Cas de panne couvert, erreurs visibles, reprises bornées | T10, analyse « sortie structurée » |
| E1.8 | Exécution durable LangGraph ([tolérance aux pannes](https://docs.langchain.com/oss/python/langgraph/fault-tolerance), [exécution durable](https://docs.langchain.com/oss/python/langgraph/durable-execution)) : mode de durabilité, `RetryPolicy` par nœud, `timeout` de nœud, gestionnaire d'erreur de nœud, arrêt en douceur d'un run (`RunControl` : terminer le super-pas en cours puis sauvegarder) pour les redémarrages du service, cache de nœuds ; supprimer le **repli sur une mémoire de processus** quand la base IA est absente (non durable, il masque une panne de production) | Reprise après arrêt du processus, test sur PostgreSQL réel | P2.4–P2.6, porte G2 |
| E1.9 | **Relever les plafonds** du § 3 : rendre chacun configurable (variable d'environnement documentée), mesurer le coût en latence et en jetons, fixer les cibles (Q8) ; ajouter un plafond de **durée totale et de jetons par run**, absent aujourd'hui (`docs/ia.md`, T2.5) | Tableau avant/après, cibles tenues, aucune réponse tronquée | Principe 4 |
| E1.10 | Flux d'événements de LangGraph : la documentation recommande la version 3 (`stream_events(version="v3")`, projections `messages`, `values`, `subgraphs`, `output`, introduite en 1.2) ; `ag-ui-langgraph` 0.0.47 appelle encore `astream_events` en version 2. Suivre ses mises à jour **sans réimplémenter le flux** ; flux personnalisé `get_stream_writer` pour l'avancement | Version de `ag-ui-langgraph` qui adopte la v3 identifiée, ou question posée à l'éditeur | Streaming (page lue) |
| E1.11 | Retour dans le temps et reprise (`get_state_history`, `update_state`, [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel)) comme **aide à l'analyse d'incident**, sur données synthétiques | Procédure d'incident testée | Analyse « time travel » |

### E2 — Confidentialité, traces et conformité (avant toute donnée réelle)

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E2.1 | **Masquage : décision du 2026-10-31, il est appliqué côté métier (Spring, projections par champ, E11)**, de sorte que ni le service IA ni le modèle ne reçoivent les champs interdits. Côté IA, il reste à décider si `PIIMiddleware` (`strategy` : `block`, `redact`, `mask`, `hash` ; `apply_to_input`, `apply_to_output`, `apply_to_tool_results`) sert de **second filet** pour la saisie libre de l'utilisateur et pour les traces ; types natifs `email`, `credit_card`, `ip`, `mac_address`, `url`, donc CIN, RIB/IBAN marocains et téléphones demandent un `detector` personnalisé ; comparer avec le masquage par Presidio de la passerelle (écarté sur données réelles) et le masquage OpenInference des traces, et éviter les doubles transformations (Q5) | Cas synthétiques CIN, RIB, téléphone, courriel : jamais vus du modèle ni des traces | M2 |
| E2.2 | Politique de traces LangChain (`configure_trace_policy`, `omit_payload`) + masquage OpenInference + **preuve sur une trace Phoenix réelle** qu'aucune donnée sensible n'apparaît ; rétention 30 jours, annotation | Trace synthétique inspectée de bout en bout | M2, T3.4, analyse P1 |
| E2.3 | Observabilité complète (T3.4) : traces du clic à la base, alertes, corrélation `requestId`/`threadId`/`runId`/`toolCallId` dans l'audit (sans les mettre en étiquettes de métriques), évaluation des coûts par run | Tableau de bord et alertes, audit corrélé | T3.4, analyse « neuf piliers » |
| E2.4 | Conformité (T3.6) : registre des systèmes, fiche du système, analyse d'impact, notice, durées de conservation (loi 09-08, NIST AI RMF, ISO/IEC 42001, OWASP LLM) | Documents approuvés | T3.6 |
| E2.5 | Exploitation (T3.7) : procédure d'incident, changement de modèle, prompts versionnés, SBOM et analyse de vulnérabilités du service IA, interrupteur d'arrêt, sauvegarde et restauration des bases IA (`ia-db`, `litellm-db`, Phoenix, SQLite du runtime) | Exercice de restauration réussi | T3.7, analyse « exploitation » |
| E2.6 | Conservation dans la passerelle (T2.8) : le contenu des messages n'est pas conservé par LiteLLM (vérifier journaux de dépense et rétention) | Contrôle automatisé | T2.8 |
| E2.7 | Chiffrement des points de reprise : `EncryptedSerializer` (AES) du checkpointer LangGraph, clé hors dépôt, rotation documentée ; purge fine des anciens points avec `aprune` | Base `ia-db` illisible sans clé, purge testée | LangGraph persistance (page lue) |

### E3 — Sécurité par fiche de poste (jalon J2)

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E3.1 | Modèle de périmètres (T2.1) et périmètres appliqués aux outils MCP et aux vues (T2.2) | Tests négatifs par poste | T2.1, T2.2 |
| E3.2 | Projection du salaire (T2.3) : `EMPLOYEE_READ` sans `PAIE_READ` ne révèle ni salaire, ni tri, ni agrégat, ni message d'erreur | Tests d'appel direct sans permission | T2.3, analyse « identité » |
| E3.3 | Catalogue d'outils filtré par fiche de poste (T2.4) | Un utilisateur ne voit que ses outils | T2.4 |
| E3.4 | Budgets et quotas par utilisateur et par poste avec les **budgets natifs de LiteLLM** (T2.5) ; plafonds par run | Dépassement refusé et audité | T2.5 |
| E3.5 | Jeu adversarial (T2.6) : injections directes et indirectes (champs de données piégés), exfiltration par lien ou image, contournement de périmètre, texte du modèle rendu comme texte ; outil officiel à choisir dans la documentation (Q9) | Issue attendue déterministe par cas, rejoué à chaque changement | T2.6, OWASP LLM01 |
| E3.6 | Affichage de la période, du périmètre et de la définition avec chaque chiffre principal (reste de T2.7, sans vérificateur) : les outils fournissent déjà `definitions`, l'interface doit les montrer | Capture et test | T2.7 |
| E3.7 | Contrat de vue unique entre Spring, service IA et Angular, généré (T2.9) | Un seul schéma source | T2.9 |

### E4 — Résorption du code maison (tâches T21 à T31 ; T22 est faite)

Chaque ligne remplace une pièce maison par la fonction officielle ; la pièce maison est supprimée dans la même tâche.

| ID | Pièce maison → fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E4.1 | `contexte.py` → `dynamic_prompt` + invite ou ressource MCP de Spring AI (`@McpPrompt`) lue par l'adaptateur MCP ; contexte d'exécution immuable par `context_schema` / `ToolRuntime` (page [runtime](https://docs.langchain.com/oss/python/langchain/runtime)) | `contexte.py` supprimé, droits non élargis | T24 |
| E4.2 | `memoire.py` (préfixe de fil, purge) → espaces de noms du `Store` LangGraph (`AsyncPostgresStore`) ; **l'expiration (TTL) n'est pas documentée** pour le `Store` : tâche `pg_cron` ou équivalent gratuit | Isolation testée, expiration prouvée | T25 |
| E4.3 | `jeton_agent` et encodeur JWT → échange de jetons RFC 8693 (Spring Authorization Server, client OAuth2) | Anciens chemins supprimés, audience et expiration testées | T26 |
| E4.4 | `agui.py` (authentification, validation, flux SSE) → `add_langgraph_fastapi_endpoint` d'`ag-ui-langgraph` (présent en 0.0.47) avec dépendances FastAPI ; outils par requête par les crochets dynamiques | `agui.py` réduit aux dépendances | T27 |
| E4.5 | `evaluation.py` (rejoueur) → `openevals` (évaluateurs de réponses : juge LLM, comparaison JSON, similarité, exactitude) et `agentevals` (trajectoires : `trajectory_match_mode` strict, unordered, subset, superset ; juge de trajectoire ; graphes LangGraph) en appels directs sous pytest. **Vérifié dans leurs README** : les deux évaluateurs fonctionnent sans LangSmith, qui n'est requis que pour leurs intégrations pytest/Vitest et `evaluate` (suivi d'expériences) ; les juges LLM utilisent par défaut `langchain_openai`. **Risque** : `agentevals` est dormant (E0.1) | Rejoueur supprimé, jeu de référence rejoué par pytest | T28 |
| E4.6 | `filtrer_config.py`, `enregistrer_cles.py`, `test_providers.py` → `include` de fichiers de configuration LiteLLM par fournisseur, sondes natives, clés virtuelles par l'API gérée | Scripts supprimés | T29 |
| E4.7 | Composants maison (`DataTable`, `KpiGrid`, `Chart`, `QuestionUtilisateur`, `FilAssistant`) → AG Grid Community ou TanStack Table, `ng2-charts`, interruptions natives CopilotKit (`registerHumanInTheLoop`, `injectInterrupt`) | Composants maison supprimés, accessibilité conservée | T30 |
| E4.8 | `serveur.mjs` (authentification `/auth/me`, routes, propriété du fil) → gestionnaire officiel `createCopilotExpressHandler` (`@copilotkit/runtime/v2/express`) avec crochets `hooks.onRequest` (vérifier le jeton, répondre 401), `onBeforeHandler` (propriété du fil), `onError`, `cors`, `forwardHeaders`. **Règle officielle** : sans Intelligence, rien ne lie un fil à un utilisateur ; il faut une table de propriété (`thread_id`, `user_id`) vérifiée sur toute route portant un `threadId` et sur `agent/run` / `agent/connect` ; `threads/list` filtré côté serveur ; `SqliteAgentRunner` répond 422 sur les routes de lecture et n'offre aucune autorisation ; `identifyUser` est réservé à Intelligence | Fils réservés à leur propriétaire, testé (accès croisé refusé) | T31 |
| E4.9 | `surfaces.py` (liste → tableau ou graphique) → motif A2UI à schéma fixe (`a2ui-fixed-schema`) ; évaluer MCP Apps (`provideMCPApps`, `@copilotkit/angular/mcp-apps`) pour que l'interface vienne du serveur MCP | Décision mesurée puis migration | T23 |
| E4.10 | Liste titrée des anciennes conversations : `injectThreads` (`threads`, `isLoading`, `listError`, `startNewThread`, renommer, archiver, supprimer) et `CopilotThreadsDrawer` **dépendent d'Intelligence** (le tiroir est verrouillé sans la fonction `threads` de la licence) ; voie gratuite à instruire : liste de fils tenue par ERP-RH (table de propriété de E4.8) (Q10) | Liste, titre, suppression, isolation par utilisateur | T21 |

### E5 — Conversations et mémoire

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E5.1 | Conversations multi-tours (T3.2) : isolation, **suppression par l'utilisateur**, reprise après redémarrage, expiration de l'historique SQLite du runtime (aucune aujourd'hui) | Tests de suppression et d'expiration | T3.2, V1b |
| E5.2 | Contexte d'écran (T3.3) : conserver `connectAgentContext` en lecture seule et **revalider côté serveur** ; ne jamais le présenter comme un état partagé | Test : filtre falsifié refusé | T3.3 |
| E5.3 | Mémoire longue explicite (P4.6) : préférences uniquement, consultable, corrigeable, supprimable, avec expiration ; pas de faits personnels RH promus automatiquement ; mémoire du fichier `AGENTS.md` de Deep Agents (E9.5) à rapprocher | Politique écrite (Q5) puis tests d'oubli | P4.6, analyse des écarts de Codex |
| E5.4 | Reconnexion du flux et rattrapage (P3.4) : `AG-UI Streams` est une fonction de **CopilotKit Intelligence** (E13) ; `join` / `rejoin` de LangChain suppose le serveur d'agent LangGraph (`langgraph dev` en local, sinon déploiement LangSmith, E13) et n'est pas documenté pour un service FastAPI maison ; voie gratuite à instruire (Q10) | Pas de double exécution au retour du réseau | P3.4 |
| E5.5 | Séparation des trois mémoires : état de fil (checkpointer), mémoire inter-fils (`Store`), contexte immuable d'exécution ; documenter la frontière | Schéma d'état formalisé | Analyse LangGraph |

### E6 — Interface CopilotKit complète (Angular)

Source : [exemples Angular](https://docs.copilotkit.ai/angular/features) (41 entrées, lue) et [référence](https://docs.copilotkit.ai/reference/angular) (lue). Aucune n'est libellée bêta ; aucune n'indique si elle exige Intelligence.

| ID | Fonction CopilotKit | Preuve de terminé | Origine |
|---|---|---|---|
| E6.1 | Rendu des appels d'outils : `registerRenderToolCall` pour les 30 outils MCP (renderers partagés par domaine) + renderer universel de repli (« Tool Rendering ») ; chaîne de raisonnement et d'outils (`tool-rendering-reasoning-chain`) | Chaque outil a un rendu lisible, accessible | Copilot future |
| E6.2 | Raisonnement : composant de message de raisonnement personnalisé (`reasoning-custom`) aux couleurs Staport | Rendu et test | Copilot future |
| E6.3 | Outils frontend : `registerFrontendTool` (synchrone et asynchrone) pour ouvrir une vue ou préparer un filtre, **réversibles** ; `registerComponent` (l'agent affiche un composant Angular précis) ; le serveur reste l'autorité | Parcours « ouvrir la vue filtrée » testé, droits revérifiés | P3.3, Copilot future |
| E6.4 | État partagé agent ↔ interface : lecture seule, lecture-écriture, flux de deltas (`agent.setState`, `shared-state-*`) sur **un** parcours concret ; propriété et source d'autorité à fixer (Q6) | Conflit et validation testés | Copilot future |
| E6.5 | Interface sans chat (« headless ») pour l'espace plein écran : `injectAgentStore`, `registerRenderToolCall`, messages et surfaces (J4, T8) ; `CopilotActivity` + `registerRenderActivityMessage` pour les cartes d'activité ; **parité** de rendu entre le panneau latéral et l'espace immersif ; les suggestions de départ ne divulguent aucune donnée RH et n'ouvrent aucun fil persistant | Espace immersif livré | J4 |
| E6.6 | Interruptions : `injectInterrupt` (dans le chat et hors chat) et `registerHumanInTheLoop` (par outil) ; dépend de E7 | Voir E7 | Copilot future |
| E6.7 | Pièces jointes : `[attachments]` de `<copilot-chat>` (`enabled`, `accept`, `maxSize`, `onUploadFailed`, `onUpload`) ; **par défaut les fichiers partent en base64** (inadapté aux gros fichiers sans `onUpload`) et le modèle comme le backend doivent accepter chaque type ; voix en temps réel (capture audio, navigateur seulement après hydratation) ; **cadrer consentement, types de fichiers, antivirus, données RH** (Q11) | Cadre écrit puis prototype | Copilot future, J9 |
| E6.8 | MCP Apps (`provideMCPApps`) : prototype isolé (isolation iframe, droits, accessibilité, provenance) ; WebMCP (`webmcp` sur `registerFrontendTool`) : **expérimental**, exige Chrome 149 et le brouillon d'un groupe communautaire du W3C ; ses annotations ne sont pas des contrôles de sécurité | Décision écrite pour chacun (Q7) | T23, Copilot future |
| E6.9 | Interface générative ouverte (HTML/CSS/JS agent-généré, iframe) : **interdite** par `conventions/agent-ui.md` ; toute étude exige un ADR et une évolution normative (Q7) | ADR ou refus écrit | M4, `progression-ui` |
| E6.10 | Récupération des surfaces A2UI invalides (`a2ui-recovery` : boucle de validation et reprise avant repli) ; catalogue fermé versionné | Surface invalide : reprise puis repli, testé | T16 |
| E6.11 | Capacités de la bibliothèque : `injectCapabilities`, `injectCopilotKitConfig`, directive `CopilotKitAgentContext`, `selfManagedAgents` ; contrat de production (zoneless, hydratation, SSR, nettoyage) de la page « production-lifecycle » ; budget de taille du paquet (peut dépasser 1 Mo) | Contrat appliqué, budget réglé | Copilot future |
| E6.12 | Inspecteur CopilotKit : monté automatiquement par `@copilotkit/angular` ; `enableInspector: false` dans `provideCopilotKit` le coupe (import dynamique, absent des constructions de production d'après la documentation : à vérifier dans le paquet construit) ; ses « Rich Threads » exigent Intelligence (E13) ; débogage de la connexion : `GET {runtimeUrl}/info`, signal `runtimeConnectionStatus` | Désactivé en production, vérifié | Copilot future |
| E6.13 | Accessibilité et appareils (P3.5) : clavier, focus, lecteur d'écran, mobile, thèmes, mouvement réduit, repli texte, IA indisponible ; parcours Playwright + axe | Rapports verts, revue visuelle | P3.5 |
| E6.14 | Mascotte Rive (décision déjà prise, jamais livrée) : états abstraits liés à `threadId`/`runId`, masquable, remplaçable par un état statique | Adaptateur et tests ; poids mesuré | ADR 0002, J4 |
| E6.15 | Déploiement des modes par domaine (matrice M0 à M3 de l'ancien `progression-ui.md`) : Chantier, Employé, Paie, Équipe, Fonction, Rapport, **Heures supplémentaires**, Administration, avec la porte d'activation à six preuves (utilité, droits, continuité, interface, robustesse et coût, revue) | Une revue par domaine et par mode | Progression UI |
| E6.16 | Personnalisation : styles CSS et emplacements (« slots ») pour le thème Staport (déjà en partie) ; fenêtre flottante `CopilotPopup` si utile | Thème complet | Copilot future |

### E7 — Écritures et approbation humaine

**Sans réponse à Q4, cette épopée reste préparée et non activée** : aucune écriture n'existe aujourd'hui.

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E7.1 | Choisir le **premier outil d'écriture** et la politique d'approbation (qui approuve, quoi, pour combien de temps) | Décision écrite (Q4) | J6 |
| E7.2 | `HumanInTheLoopMiddleware` (`interrupt_on`, `interrupt_mode` ; exige un checkpointer, présent) : approuver, modifier ou refuser un appel d'outil ; **incompatible avec `ShellToolMiddleware`** | Parcours approuver / modifier / refuser testé | M4 |
| E7.3 | `interrupt()` de LangGraph avec `response_schema` (exige `langgraph>=1.2.12`) et `Command(resume=...)` sur le même `thread_id` ; règles officielles : le nœud est **rejoué depuis le début** à la reprise, effets antérieurs idempotents, jamais d'`interrupt()` dans un `try/except` générique | Pause persistée, reprise après redémarrage | M4, analyse LangGraph |
| E7.4 | Côté Spring : identifiant de commande stable, déduplication dans le domaine, vérification de l'issue après délai, audit, approbation **liée** à acteur, action, arguments, version et expiration ; revérification des droits à la reprise | Crash avant et après validation, deux reprises concurrentes, approbation expirée | P2.5, analyse « checkpoints » |
| E7.5 | Tâches longues et artefacts : l'outil rend un `jobId`, un état et une référence d'artefact (jamais le binaire) ; téléchargement réautorisé, expiré, purgé ; motif « outbox » si la fraîcheur d'un index l'exige | Rapport PDF asynchrone de bout en bout | Analyse « latence », innovations P2 |
| E7.6 | Documents RH avec différence prévisualisée et approbation humaine (J6) | Diff approuvé avant effet | J6 |

### E8 — Connaissances documentaires (RAG) et assistant réglementaire (J6, J7)

Rien n'existe dans le code : seule l'extension pgvector est installée. Les chiffres et effectifs restent servis par les outils
métier ; le RAG ne sert que des documents publiés et autorisés.

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E8.1 | Gouvernance du corpus : responsable, public autorisé, finalité, classification, ACL, droits d'usage, version, dates d'effet, retrait ; **choix du premier corpus par le propriétaire** (Q12) ; exclusions par défaut (secrets, exports, données nominatives, prompts, brouillons) | Liste approuvée | P4.1, D1 |
| E8.2 | Référence sans génération : recherche plein texte et par code métier, jeu de questions annotées (français, arabe, darija, Arabizi ; ambiguïtés, sans réponse, sources périmées, interdites) | Rappel@k et MRR mesurés | P4.2 |
| E8.3 | Migrations Flyway (sources, génération, passages, droits, tâches d'ingestion), ingestion idempotente, extraction bornée, quarantaine, publication atomique ; OCR isolé (Tesseract) seulement si le texte manque | Base vierge et mise à niveau, reconstruction d'index | P4.3 |
| E8.4 | Embeddings (modèle gratuit et local à choisir), recherche **côté Spring** filtrée par droits **avant** le modèle, hybride lexical + vecteur (fusion de rangs RRF), reranking si le gain est mesuré ; index ANN testé avec les vrais filtres ; RLS PostgreSQL comme défense en plus | Aucune fuite déterministe | P4.4, `rag.md` |
| E8.5 | Réponse citée : validation des identifiants et extraits, liens protégés, abstention si sources insuffisantes, date d'effet affichée ; sources traitées comme données non fiables | Citations inventées rejetées | P4.5 |
| E8.6 | Retrait d'une source ou d'un droit : propagation aux caches, passages, résumés et checkpoints ; restauration d'une sauvegarde réappliquant les retraits | Test de retrait de bout en bout | P4.6, `rag.md` |
| E8.7 | Comparatif référence / hybride / reranking, charge et coût ; **GraphRAG / Neo4j seulement** si des questions multi-sauts échouent malgré la recherche hybride et qu'un ADR le justifie | Décision mesurée | P4.7, G4 |
| E8.8 | Assistant réglementaire (J7) : corpus versionné (Code du travail, CNSS) avec provenance officielle, juridiction et date d'effet ; jamais un avis juridique | Corpus approuvé et évalué | J7 |
| E8.9 | Explication d'un rejet d'import de paie : outil en lecture sur `PaieImportService.analyser`, même résultat que l'assistant d'import existant | Même verdict que l'assistant d'import | Innovations P1 |
| E8.10 | Quasi-doublons de fonctions et de référentiels : normalisation + `pg_trgm` avant comparaison par embeddings ; candidats seulement, jamais de fusion automatique | Précision mesurée sur libellés validés | Innovations P2 |

### E9 — Agents spécialisés et fonctions de Deep Agents

Sources : toutes les pages Deep Agents de l'index officiel (voir § 7).

**Agent ou agent profond ?** Un agent LangChain (`create_agent`, ce que le service fait aujourd'hui) est une boucle
modèle ↔ outils avec des middlewares. Un agent profond (`create_deep_agent`) est le **même moteur** préconfiguré avec un
« harnais » : liste de tâches, fichiers virtuels pour délester le contexte, sous-agents isolés (outil `task`), compétences,
mémoire `AGENTS.md`, résumé automatique. Le harnais s'obtient aussi en ajoutant ses middlewares à `create_agent` (E9.0).

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E9.0 | **Décidée le 2026-10-31 : `create_deep_agent`, réalisé en E1.0.** Reste ici d'activer, une à une, les fonctions du harnais déjà présent (sous-agents, fichiers, compétences, mémoire, rubrique) selon les tâches ci-dessous | Voir E1.0 | J5–J7 |
| E9.1 | `SubAgentMiddleware` (outil `task`) : sous-agents par domaine (Paie, Employés, Chantiers, Heures supplémentaires, Audit) avec instructions, outils, modèle et budget propres ; **isolation du contexte** ; `tools` d'un sous-agent **remplace** ceux du parent (droits minimaux) ; `response_format` pour des résultats structurés ; mode `fork` (bêta, `deepagents>=0.7.13`) à part | Aucune élévation de droits, latence et coût mesurés | J5, P3 « conditionnel » |
| E9.2 | Sous-agents asynchrones (lancer, vérifier, modifier, annuler) pour les analyses longues ; flux par sous-agent (`stream.subagents`) ; **exige un serveur « Agent Protocol »** : le service FastAPI actuel n'en est pas un, et la voie officielle documentée est le serveur LangGraph (`langgraph dev` en local ; déploiement géré = E13) ; voie gratuite à instruire (Q10) | Analyse longue en parallèle, annulable | Copilot future |
| E9.3 | Fichiers virtuels pour délester le contexte : `FilesystemMiddleware`, `StateBackend`, `StoreBackend` (**fournir une fabrique d'espaces de noms par utilisateur** : par défaut l'espace est celui de l'assistant, donc partagé), `CompositeBackend` ; **jamais** `FilesystemBackend` ni `LocalShellBackend` sur un serveur ; règles `permissions` (première règle gagnante, non applicables aux bacs à sable) | Gros résultats délestés, isolation par utilisateur testée | Copilot future |
| E9.4 | Compétences chargées à la demande (`SKILL.md`, norme Agent Skills) : source, version, périmètre et revue par compétence ; ne remplacent ni RBAC ni politique système (Q13) | Compétence chargée progressivement, testée | Copilot future |
| E9.5 | Mémoire `AGENTS.md` (toujours chargée, modifiable par l'agent) : **risque d'injection si partagée** ; limiter à l'espace utilisateur, écriture contrôlée | Politique écrite, test d'injection | Copilot future, production |
| E9.6 | `RubricMiddleware` (bêta, `deepagents>=0.6.5`) : auto-évaluation par grille sur les rapports et analyses (J5) | Grille et seuil évalués sur le jeu | J5 |
| E9.7 | Exécution : interpréteur `eval` (QuickJS, **sans shell, réseau ni fichiers**) en premier pour les calculs ponctuels ; `ShellToolMiddleware` avec `DockerExecutionPolicy` seulement dans un conteneur jetable **sans réseau, sans secret, sans accès à l'ERP** ; `HostExecutionPolicy` interdite ; fournisseurs de bacs à sable hébergés → E13 | **Décision de sécurité préalable** (Q7) | M6 |
| E9.8 | Recherche de fichiers : `FilesystemFileSearchMiddleware` (`root_path`, ripgrep) sur des documents RH locaux, racine en lecture seule, sans secrets | Périmètre étroit testé | M5 |
| E9.9 | Contrôle de la paie (J5) : contrôles déterministes d'abord (règles approuvées), puis détection de données atypiques ; « atypique » n'est pas « erroné » ; aucun salaire modifié automatiquement | Règles approuvées, faux positifs mesurés | J5, innovations P2 |
| E9.10 | Profils de harnais, page des modèles, protocole ACP, intégration AG-UI de Deep Agents (todos, état des sous-agents) | Décision par élément | Copilot future |
| E9.11 | Autres motifs multi-agents de LangChain (sous-agents, transferts, compétences, routeur, flux personnalisé), mode de point de reprise des sous-graphes (hérité, par appel, par thread) et choix entre API de graphe et API fonctionnelle de LangGraph : ne retenir que ce qui apporte un gain mesuré | Comparatif | Analyse « multi-agents » |

### E10 — Pilote réel, exploitation et extensions

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E10.1 | Démonstration J1 sur la base actuelle : images reconstruites, banc réel, flux réels | Démonstration présentée | T20 |
| E10.2 | Modèle local (T3.1) : licence, provenance des poids, matériel limité ; pseudonymisation tant qu'un modèle sort de l'infrastructure ; décision du propriétaire sur le modèle (Q5) | Modèle évalué sur le jeu de référence | T3.1 |
| E10.3 | Langues arabe et darija (T3.9) : jeu Darija en alphabet arabe **et** Arabizi ; **LIDstral Arabic reste « à évaluer avant toute adoption »** (confirmé le 2026-10-31) ; veille mensuelle des modèles déjà en place | Jeu Darija et rapport d'évaluation | T3.9, § 4.1 |
| E10.4 | Objectifs de service (T3.5) : p50 et p95 par type de question, profils de **charge de 1, 5 et 20 exécutions simultanées**, corpus croissants, client lent, fournisseur indisponible, base saturée ; seuils à approuver (Q8) | Rapport de charge et de panne | T3.5, analyse « latence » |
| E10.5 | Retours et évaluation continue (T3.8) : pouce haut/bas, relecture d'échantillons, évaluation hors ligne en CI | Boucle de retour active | T3.8 |
| E10.6 | **Pilote réel (J3, T3.10)** : utilisateur et périmètre choisis, données réelles seulement après E2 et E3, retours consignés | Pilote clos avec bilan | J3, T3.10 |
| E10.7 | Autres départements et A2A (J8) : mêmes portes que J1 à J3 par département ; A2A seulement pour une application tierce réelle | Un département pilote | J8 |
| E10.8 | Terrain et voix (J9) : mobile chef de chantier, voix ; PWA hors ligne pour un futur Pointage (ADR métier d'abord) ; MQTT pour des capteurs ; QUIC/HTTP3 au niveau infrastructure ; **WebSocket** pour la voix continue ; chacune avec son déclencheur mesuré | ADR ou décision de non-adoption par élément | J9, innovations P3 |
| E10.9 | Travailleurs distants OCR, inférence ou analytique par gRPC (comparé à HTTP) ; justificatifs scannés par OCR isolé | Besoin mesuré, comparatif | Innovations P2 |

### E11 — Rôles, départements, hiérarchie et sécurité par champ (demande du 2026-10-31)

**À exécuter avant E3** malgré son numéro : E3 (sécurité par fiche de poste) consomme le modèle qu'E11 établit, et le
masquage est une règle métier côté Spring (principe 5). Le code actuel contient des rôles, des permissions et un résolveur de
permissions effectives (`auth/`) avec refus de permissions ; aucune entité de département ni de hiérarchie n'a été trouvée
par nom de fichier (à confirmer par E11.1).

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E11.1 | Inventaire du modèle actuel (rôles, permissions, `EffectivePermissionResolver`, rôles système) face au besoin ; liste des champs sensibles par entité (Q17) | Document d'écart signé | Demande 2026-10-31 |
| E11.2 | Départements et hiérarchie (qui voit qui, chaîne de responsables, équipes) : modèle de données, migrations Flyway, requêtes récursives PostgreSQL | Migration sur base vierge et mise à niveau ; arbre testé | Idem |
| E11.3 | Périmètre par rôle et par département dans les services Spring (liste, détail, agrégat, export) | Tests négatifs : un responsable ne voit pas un autre département | Idem, T2.1–T2.2 |
| E11.4 | **Sécurité par champ** : déclaration, par rôle, de chaque champ (visible, masqué, écriture refusée), appliquée **dans les projections Spring** et donc à l'interface, aux exports et aux outils MCP ; le champ interdit est absent (jamais remplacé par une valeur factice qui tromperait un agent), y compris dans tri, filtre, agrégat et message d'erreur | Appel direct sans permission : aucune fuite, tri et agrégat compris | T2.3 |
| E11.5 | Écran d'administration des rôles, départements et champs ; journal d'audit des changements et des accès aux champs sensibles | Parcours testé, audit lisible | Idem |
| E11.6 | Raccordement de l'IA : E3.1 à E3.3 s'appuient sur ce modèle ; l'agent n'obtient que ce que l'utilisateur peut voir | Jeu adversarial E3.5 vert | E3 |

### E12 — Migration du backend Java Spring vers Python FastAPI (demande du 2026-10-31)

**Épopée de cadrage : aucune tâche d'exécution n'est lancée avant l'ADR (Q15).** Elle contredit trois décisions en vigueur
(« Spring reste l'autorité » ; serveur MCP en Spring AI ; migrations Flyway) : l'ADR doit les remplacer explicitement. Les
tâches suivantes sont des intitulés à instruire dans la documentation officielle de FastAPI, pas des choix.

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E12.1 | **ADR** : motif, périmètre (tout ou domaine par domaine), coût, risques, ce qui est conservé (Flyway ou Alembic, JWT RS256, audit) ; mise à jour des principes du § 1 | ADR approuvé (Q15) | Demande 2026-10-31 |
| E12.2 | Inventaire exhaustif : endpoints, entités, règles de calcul de la paie, permissions, tâches planifiées, tests existants (couverture à égaler) | Inventaire versionné | Idem |
| E12.3 | Stratégie de bascule progressive (domaine par domaine derrière le proxy, tests de contrat identiques des deux côtés) ; critère de parité chiffré, notamment pour la paie | Plan de bascule approuvé | Idem |
| E12.4 | Cible technique : FastAPI, accès aux données, migrations, authentification, serveur MCP (SDK MCP Python officiel au lieu de Spring AI), observabilité, CI | Prototype d'un domaine à faible risque | Idem |
| E12.5 | Exécution domaine par domaine, retrait de chaque domaine Java après parité prouvée ; retrait final de Spring | Domaine servi par FastAPI, tests de parité verts | Idem |

### E13 — Services payants ou hébergés (rien n'est adopté sans décision de Q3)

Regroupe tout ce qui exige un abonnement ou un service hébergé par l'éditeur. **Offres relevées sur la page de prix de
CopilotKit le 2026-10-31** : *Free* (usage **non productif** auto-hébergé avec licence renouvelable tous les 30 jours, **ou**
hébergé jusqu'à 1 000 interactions par mois), *Pay-as-you-go* 49 $ par mois, *Annual* sur devis. Une instance auto-hébergée
en production n'est donc pas gratuite.

| ID | Fonction et exigence | Remarque | Origine |
|---|---|---|---|
| E13.1 | CopilotKit **AG-UI Streams** (reconnexion et rattrapage entre onglets et appareils) | Intelligence ; voie gratuite en E5.4 | Copilot future |
| E13.2 | CopilotKit **mémoires utilisateur** (`injectMemories`, outils `save_memory` / `recall_memory` / `forget_memory`) | Licence « memory » (offre entreprise), pgvector, modèle d'embeddings 1024 dimensions ; voie gratuite : `Store` LangGraph (E4.2, E5.3) | Idem |
| E13.3 | CopilotKit **fils enrichis** (`injectThreads`, `CopilotThreadsDrawer`, Rich Threads de l'inspecteur, `identifyUser`, `CopilotKitIntelligence`) | Voie gratuite en E4.8 et E4.10 | Idem |
| E13.4 | **Apprentissage automatique**, **trajectoires** (accès anticipé), **analyses produit** (offre entreprise, TimescaleDB, 90 jours de conservation), **collecteur autonome** `@copilotkit/learning` (expérimental, auto-hébergeable) | Voie gratuite : Phoenix (E2.3) | Idem |
| E13.5 | **Canaux** Slack et Teams (Intelligence hébergé), import d'historique | Hors besoin actuel | Idem |
| E13.6 | `selfManagedAgents` en production (offre entreprise) ; runtimes Python, Go, Ruby, .NET de CopilotKit (exigent Intelligence) | Le runtime TypeScript actuel suffit | Idem |
| E13.7 | **LangSmith** : Studio, observabilité hébergée, évaluations hébergées, déploiement géré (Agent Server), Fleet, Managed Deep Agents | Voie gratuite : Phoenix, pytest, `langgraph dev` local | Plans LangChain |
| E13.8 | `ProviderToolSearchMiddleware` (Anthropic Claude 4+ ou OpenAI gpt-5.5+ : modèles payants) | Non applicable à la passerelle gratuite | E1.6 |
| E13.9 | Fournisseurs de bacs à sable hébergés pour Deep Agents | Alternative gratuite : conteneur jetable (E9.7) | E9.7 |
| E13.10 | Tâches proactives et apprentissage automatique des conversations (jamais activés par défaut : utilité, consentement, fuite de données, validation humaine) | Voir E13.4 | Copilot future |

### E14 — IA interne : vLLM et sortie de LiteLLM (dernière épopée)

Objectif du propriétaire (2026-10-31) : une IA **interne**, donc des modèles servis dans l'entreprise. **Limite consignée** :
LiteLLM 1.106.6 exige `openai<3.0.0`, ce qui retient `openai` en 2.x (§ 3) ; la montée en 3.x se fait ici, une fois LiteLLM
abandonné. Les exigences de `conventions/agents-ia.md` (« Modèles auto-hébergés ») s'appliquent : licence et provenance des
poids, conteneur sans réseau sortant, ressources mesurées, achat de matériel = décision du propriétaire.

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E14.R | Relecture d'entrée (§ 4.0) | Pages lues consignées | Décision 2026-10-31 |
| E14.1 | Choix et évaluation des modèles servis par vLLM sur le jeu de référence (justesse, outils, JSON, raisonnement, arabe et darija) ; matériel nécessaire chiffré (Q18) | Rapport comparatif signé | E10.2, T3.1 |
| E14.2 | Service vLLM (serveur compatible OpenAI) dans `docker-compose.yml`, sans réseau sortant, ressources fixées | `docker compose up -d` suffit | Règle du `docker compose` unique |
| E14.3 | Remplacer LiteLLM : ce qu'il apporte aujourd'hui (routage et repli entre fournisseurs gratuits, budgets par utilisateur, garde-fou de contenu, transmission de `reasoning_content`, journaux de dépense) est à rattacher à un composant officiel de remplacement ou à abandonner ; lire la documentation de `langchain-openai` / vLLM avant de choisir | Chaque fonction a un remplaçant ou une décision d'abandon écrite | E4.6, E3.4, E2.6 |
| E14.4 | Passer `openai` en 3.x et retirer la borne de `litellm`, tests et jeu de référence verts | Verrous à jour | § 3 |

## 5. Traçabilité : où est passé chaque ancien élément

| Ancien élément | Source | Devenu |
|---|---|---|
| P0.1–P0.4, G1 (MCP, identité) | `plan-integration.md` | **Fait** (serveur MCP Spring AI, jeton RS256) ; échange RFC 8693 → E4.3 |
| P1.1–P1.6 | idem | **Fait** (30 outils lecture, audit MCP, RBAC) sauf T26/E4.3 et E3 |
| P2.1–P2.6, G2 (LangGraph.js, checkpoints) | idem | **Remplacé** : service Python (décision du 2026-10-24) ; checkpoints PostgreSQL **faits** ; durabilité fine → E1.8 ; interruptions → E7.3 |
| P3.1–P3.3, P3.6, P3.7, G3 | idem | **Fait** (CopilotKit Angular, A2UI) |
| P3.4 reconnexion | idem | E5.4 |
| P3.5 accessibilité | idem | E6.13 |
| P3.8 interface ouverte | idem | E6.9 |
| P4.1–P4.7, G4 (RAG) | idem, `rag.md` | E8.1 à E8.7 |
| D1–D8 | ADR 0013 | D1 (pilote), D2 (identité), D3 (MCP), D4 (CopilotKit), D5 (persistance), D7 (LiteLLM) **décidées de fait** ; D6 (migrations du checkpointer : `setup()` automatique au démarrage, contraire à la mise en garde de l'époque) → **à confirmer** (Q14) ; D8 : A2UI **fait**, Rive → E6.14, interface ouverte → E6.9 |
| Modes M0–M4 par domaine | `progression-ui.md` | M0 à M3 **faits en partie** ; déploiement par domaine → E6.15 ; M4 → E6.9 |
| Les neuf piliers | `analyse-architecture.md` | Latence → E1.9, E10.4 ; identité → E3, E4.3 ; hallucinations → E1.1, E1.7, E0.3 ; multi-agents → E9 ; MCP → fait ; AG-UI → E5.4, E6 ; mémoire → E5 ; compactage → E1.3 ; checkpoints → E7.4 |
| Tâches PDF asynchrones, corrélation d'audit, profils de charge | idem | E7.5, E2.3, E10.4 |
| Matrice des protocoles (gRPC, A2A, WebSocket, MQTT, QUIC, outbox) | `protocoles-et-innovations.md` | E10.7 à E10.9, E7.5 |
| Matrice des besoins (RAG, rejet d'import, quasi-doublons, KPI sémantiques, atypiques, OCR, PWA, RLS, mesure) | idem | E8.9, E8.10, E9.9, E10.9, E10.8, E8.4, E0.3 ; **catalogue de KPI** : **fait** par les outils (`definitions`, `paie_comparer`) |
| ADR 0002 (AG-UI, A2UI, Rive, annulation par `runId`) | supprimé le 2026-10-24 | AG-UI et A2UI **faits** ; Rive → E6.14 ; annulation par `runId` → à tester en E6.13 |
| ADR 0008 (LiteLLM, cache, superviseur, mémoire à trois niveaux, A2A, GraphRAG, Langfuse, interrupteur) | supprimé le 2026-10-24 | LiteLLM **fait** ; cache cloisonné → vérifier en E2.6 ; superviseur → E9.1 ; mémoire → E5 ; A2A → E10.7 ; GraphRAG → E8.7 ; Langfuse remplacé par **Phoenix** ; interrupteur → E2.5 |
| T1–T8, T11–T17, T22 | `docs/ia.md` | **Faits** |
| T9, T20 | idem | E10.1 |
| T10 (qualification) | idem | E0.3 |
| T18 | idem | E2.2, E2.3 |
| T19 | idem | **Fait** côté service ; reprise du fil dans l'interface → E0.6, E5.1 |
| T21, T23–T31 | idem | E4.10, E4.9, E4.1 à E4.8 |
| T2.1–T2.9 | idem | E3 (T2.7 : annulée, il reste l'affichage → E3.6) |
| T3.1–T3.10 | idem | E10.2, E5.1, E5.2, E2.3, E10.4, E2.4, E2.5, E10.5, E10.3, E10.6 |
| J2 à J9 | idem | E3, E10.6, E6.5, E9.9, E7.6, E8.8, E10.7, E10.8 |
| V1a, V1d, V1f | plan de clôture | **Faits** |
| V1b, V1c, V1e | idem | E0.6 + E5.1, E0.3, E0.4 |
| M1 à M6 | idem | E1.1 à E1.5 et E1.3 (M1, M3), E2.1 (M2), E7.2 (M4), E9.8 (M5), E9.7 (M6) |
| Fonctions de `copilot-kit-future-to-implement.md` (supprimé) | Codex, 2026-10-31 | E6 (CopilotKit), E1 et E5 (LangChain), E1, E5 et E7 (LangGraph), E9 (Deep Agents) |
| Écarts de `backend-gap-analysis.md` (supprimé) | Codex, 2026-10-31 | E1.1 à E1.3, E1.7, E1.8, E2.1 à E2.2, E5.3, E7, E9 |
| Fonctions exigeant un service payant ou hébergé | tous | E13 |
| Demandes du 2026-10-31 (rôles, départements, hiérarchie, champs ; migration FastAPI) | propriétaire | E11, E12 |

Les documents supprimés se relisent avec `git show 46cf1e39^:<chemin>` (par exemple `docs/ia/plan-integration.md`,
`docs/ia/rag.md`, `docs/ia/progression-ui.md`, `docs/ia/protocoles-et-innovations.md`,
`docs/ia/analyse-architecture.md`, `docs/handoff/integration-ia.md`, ADR 0002, 0008 et 0013).

## 6. Questions pour le propriétaire (le code ne permet pas de répondre)

- **Q1 — Sort des fichiers. Répondue le 2026-10-31 : oui**, ce plan est la référence et remplace le § 7 de `docs/ia.md`.
  Les suppressions de `copilot-kit-future-to-implement.md` et `backend-gap-analysis.md` attendent la confirmation du
  propriétaire, **fichier par fichier**. *Mise à jour du 2026-10-31 : le propriétaire a autorisé la suppression si tout est
  repris ici ; la vérification a été faite et les deux fichiers sont supprimés.* Les deux paragraphes de renvoi du § 7 de
  `docs/ia.md` pointent désormais ici ; ses tableaux de tâches seront réduits en E0.5.
- **Q2 — Ordre.** L'ordre E0 → E10 vous convient-il ? Le pilote réel (E10.6) dépend de E2 et E3 ; faut-il avancer E6
  (interface) avant E4 (code maison) ?
- **Q3 — Services payants ou hébergés (E13).** Le « gratuit » d'Intelligence est *non productif* (licence de 30 jours
  renouvelable) ou *hébergé* (1 000 interactions par mois, conversations chez l'éditeur) : ni l'un ni l'autre ne convient à
  une production RH auto-hébergée. Confirmez-vous que E13 reste entièrement exclue, à relire seulement si le besoin
  apparaît ?
- **Q4 — Première écriture.** Aujourd'hui l'assistant ne fait que lire. Une « écriture » est une action qui modifie des
  données (créer un bulletin, valider une heure supplémentaire, changer un statut). Quelle action, parmi celles-là,
  voulez-vous voir faire à l'assistant en premier, et pour quels rôles ? Sans réponse, E7 reste préparée et inactive.
- **Q5 — Données et confidentialité. Réponse partielle du 2026-10-31** : le masquage est une règle métier côté Spring
  (E11). Reste : `PIIMiddleware` comme second filet sur la saisie libre et les traces (E2.1) ? Un modèle local (E10.2)
  est-il exigé pour les données réelles ? Quelle politique pour une mémoire longue ?
- **Q6 — État partagé.** Quel parcours justifie un état modifiable par l'agent et par l'utilisateur (E6.4) ?
  (L'architecture de l'agent est **décidée** : `create_deep_agent`, E1.0.)
- **Q7 — Interface ouverte et exécution.** Autorisez-vous l'étude d'une interface générative ouverte (interdite par
  `conventions/agent-ui.md`), de MCP Apps, de WebMCP (expérimental) et d'un interpréteur ou d'un shell isolé (E9.7) ?
- **Q8 — Objectifs chiffrés.** Cible de latence p95 (la vision courte parle de 30 s), taille du jeu de référence (≈ 100 ?),
  retard de version toléré (E0.2), budgets de jetons par poste, durées de conservation (30 jours aujourd'hui), plafonds du § 3.
- **Q9 — Outil de jeu adversarial.** Souhaitez-vous un outil open source précis (la documentation des frameworks n'en impose
  pas) ou un jeu écrit dans le dépôt, comme prévu en T2.6 ?
- **Q10 — Liste des fils et reconnexion.** Quelle voie gratuite acceptez-vous : étendre le runner SQLite officiel,
  contribuer au dépôt de l'éditeur, ou code temporaire daté ? (T21 acceptait un petit code temporaire avec date de retrait.)
- **Q11 — Pièces jointes et voix.** Sont-elles voulues (E6.7), pour quels utilisateurs, et la voix est-elle repoussée à J9
  comme le disait l'ADR 0002 ?
- **Q12 — Premier corpus RAG** (D1) : quelle aide métier, quels documents, quels utilisateurs ?
- **Q13 — Compétences.** Les fichiers `docs/*/skills/SKILL.md` du dépôt sont des compétences pour les assistants de
  développement : doivent-ils aussi devenir des compétences de l'agent en exécution, ou reste-t-on sur du contenu séparé ?
- **Q14 — Migrations du checkpointer (ancien D6).** `AsyncPostgresSaver.setup()` crée les tables au démarrage du service ;
  l'ancienne décision demandait de les gérer par Flyway avec un compte sans droit de création. À confirmer ou à changer.
- **Q15 — Migration vers FastAPI (E12).** Quel motif et quel périmètre (tout le backend, ou un domaine pilote d'abord) ?
  Acceptez-vous de remplacer la décision « Spring reste l'autorité » et le serveur MCP Spring AI par un ADR ?
- **Q18 — IA interne (E14).** Matériel disponible (GPU, mémoire) ou budget d'achat ? Quand abandonner LiteLLM : dès que
  le premier modèle interne tient le jeu de référence, ou seulement quand tous les fournisseurs gratuits sont retirés ?
- **Q19 — Veille et CI (E0.2).** Autorisez-vous Dependabot pour les composants IA malgré le déclenchement automatique de la
  CI par ses PR (la règle actuelle est « CI seulement sur demande »), ou préférez-vous la veille manuelle seule ?
- **Q16 — Outillage des assistants de développement (E0.7).** Autorisez-vous l'ajout du serveur MCP de documentation de
  CopilotKit et de ses compétences à la configuration du projet ?
- **Q17 — Hiérarchie et champs (E11).** Quelle règle de visibilité (un responsable voit-il toute sa descendance ?) et quels
  champs sensibles par entité (salaire, CIN, RIB, adresse, téléphone, situation familiale…) ?

## 7. Sources officielles

Lues pour ce plan (2026-10-31) : LangChain [middlewares préconstruits](https://docs.langchain.com/oss/python/langchain/middleware/built-in),
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

**Lues pour la version du 2026-10-31 (suite)** : LangChain, LangGraph et Deep Agents, toutes les pages de l'index officiel
(runtime, sortie structurée, garde-fous, mémoire à long terme, multi-agents, tolérance aux pannes, exécution durable,
checkpointers, stores, retour dans le temps, sous-graphes, API fonctionnelle, agents asynchrones, compétences, mémoire,
interpréteurs, bacs à sable, permissions, profils, grilles d'évaluation, ACP). CopilotKit :
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
(`guides/tools`, `guides/interrupts`, `guides/threads`, `guides/attachments`). Les index ne les listent pas ; leur contenu
utile (authentification, apprentissage) est couvert par les pages ci-dessus. **Limites connues de la lecture** : la page
AG-UI de CopilotKit ne détaille pas le catalogue d'événements (renvoi vers ag-ui.com, à lire avant E5.4 et E6.5) et les
pages « Common Copilot issues », « Runtime debug mode » et « AG-UI Event Inspector » sont seulement citées par le dépannage.
