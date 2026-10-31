# Plan de travail IA — document unique des tâches restantes

> **Brouillon à valider par le propriétaire (2026-10-31).** Ce fichier regroupe, en un seul endroit, tout ce qui reste à
> faire pour l'IA d'ERP-RH : l'historique complet des anciens plans (y compris les documents supprimés le 2026-10-24), le
> plan actuel de `docs/ia.md`, l'inventaire des fonctions de CopilotKit, LangChain, LangGraph et Deep Agents, et l'analyse
> des écarts du backend. Chaque tâche a été **comparée au code du dépôt** : ce qui est déjà fait n'y figure pas (voir § 2).
> Les points que le code ne permet pas de trancher sont des **questions** (§ 6) : aucune n'est supposée résolue.
>
> Ce que ce document ne remplace pas : `docs/ia.md` garde les décisions, l'architecture, l'état technique et le journal.
> Sort des autres fichiers : voir la question Q1.

## 1. Principes

Décisions du propriétaire, dont celle du **2026-10-31** (en gras) :

1. **Utiliser toutes les fonctions que fournissent les frameworks** (CopilotKit, LangChain, LangGraph, Deep Agents) pour
   profiter de leur expérience éprouvée. Ce principe **remplace** la règle « ne pas adopter toutes les fonctions disponibles,
   chaque adoption doit répondre à un parcours réel » des documents `copilot-kit-future-to-implement.md` et
   `backend-gap-analysis.md`. Une fonction n'est écartée que par une décision écrite du propriétaire ou parce qu'elle
   enfreint un garde-fou ci-dessous.
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
   - **auto-hébergé** : les services hébergés par l'éditeur (CopilotKit Intelligence, LangSmith) sont exclus (Q3).
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
| `langchain-core` | 1.7.0 | 1.7.3 | transitive |
| `langgraph-sdk` | 0.4.9 | 0.4.11 | transitive |
| `litellm` | 1.106.4 | 1.106.6 | 1.109.0.dev2 existe : préversion, non adoptée |
| `openinference-instrumentation-langchain` | 0.1.80 | 0.1.81 | |
| `pydantic`, `pydantic-settings` | 2.14.1, 2.16.1 | 2.14.2, 2.16.2 | |
| `openai` | 2.54.0 | 3.42.0 | **changement de version majeure** : compatibilité avec `litellm` et `langchain-litellm` à prouver |
| `agentevals` | 0.0.9 | 0.0.9 | **dernière publication le 2025-07-24** : bibliothèque dormante, à surveiller |
| `@copilotkit/core`, `@copilotkit/shared` (frontend) | 1.80.0 | 1.83.0 | **écart avec le runtime 1.83.0** à expliquer |
| `@a2ui/web_core` | 0.10.4 | 0.14.0 | le catalogue A2UI de base du service IA est copié de 0.10.4 |
| `@ag-ui/a2ui-middleware` (surcharge) | 0.0.13 | 0.0.14 | |
| `deepagents` | absent | 0.7.32 | non adopté |
| CopilotKit `next` | — | 2.0.0-rc.7 | préversion : suivie, non adoptée |

Plafonds actuels du code, relevés le 2026-10-31 (à mesurer puis relever, E1.9) : 8 appels de modèle et 8 appels d'outils par
run (`agent.py`) ; délai de modèle 120 s (`config.py`, réglable jusqu'à 600 s) ; résumé à 40 000 jetons en gardant 12 messages ;
`recursion_limit` 200 (`agui.py`) ; 20 lignes au plus par page d'outil MCP (backend). **Il n'existe plus de plafond de
génération de jetons** (l'ancien `max_tokens=1500` a été retiré) **ni de plafond de 12 000 caractères par résultat d'outil**
(cité à tort dans `docs/ia.md` ancien et dans un commentaire de `agent.py`, corrigé le 2026-10-31).

## 4. Épopées, dans l'ordre proposé

Ordre : on assoit d'abord ce qui rend tout le reste mesurable (versions, qualification), puis la fiabilité de l'agent, puis
la confidentialité et la sécurité **avant** toute donnée réelle, puis on résorbe le code maison, puis les conversations, puis
l'interface complète, et seulement ensuite les écritures, le RAG, les agents spécialisés et l'exploitation. Les
dépendances sont indiquées par tâche ; l'ordre est à valider (Q2).

### E0 — Socle de vérité : versions, qualification, démarrage

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E0.1 | Aligner toutes les dépendances IA sur la dernière stable (tableau du § 3), une montée à la fois ; expliquer pourquoi le frontend résout `@copilotkit/core` 1.80.0 ; régénérer le catalogue A2UI de base depuis `@a2ui/web_core` 0.14.0 ; prouver `openai` 3.x avec `litellm` avant de l'adopter | Verrous à jour, tests et CI verts, note de migration par montée de version majeure | Politique de versions du 2026-10-31 |
| E0.2 | Veille de versions outillée : `.github/dependabot.yml` existe déjà ; l'étendre à `ia/` (uv), `copilot-runtime/` et `frontend/`, et ajouter un contrôle qui échoue si un composant IA a plus de N jours de retard (N : Q8) | PR de montée automatiques, contrôle en CI | Idem |
| E0.3 | **V1c — qualification** : jeu de référence 24 sur 24 (dernier relevé exploitable 19/24, p50 9,09 s, p95 39,5 s), puis porté à environ 100 cas avec cas complexes, tri, questions à l'utilisateur, abstentions, refus et comparaisons ; objectif de latence (Q8) | Rapport reproductible, seuils tenus, jeu versionné | V1c, § 4 de l'ancien `docs/ia.md` |
| E0.4 | **V1e — CPU au démarrage** du service `ia` : l'import de `erp_rh_ia.app` coûte 14 s de calcul (dont 7 s `litellm`, 3 s `fastmcp.client`) ; premier démarrage à froid 110 s, puis 27 s. Pistes à lire dans la documentation de LiteLLM et de `langchain-litellm` : barème de coûts local (`LITELLM_LOCAL_MODEL_COST_MAP`), imports différés, client plus léger **à condition que `reasoning_content` reste transmis** | Mesure avant/après, une modification à la fois, raisonnement affiché inchangé | V1e |
| E0.5 | Contrôle documentation ↔ code en CI (versions, seuils, listes d'outils) ; supprimer les mentions périmées (12 000 jetons de résumé, « vérificateur ») | Contrôle vert, plus d'écart connu | « Transverse » de la vision longue ; analyse P0 |
| E0.6 | Écran d'accueil propre de l'assistant (CopilotKit masque l'accueil sur un fil fourni par l'application) ; lenteur ponctuelle à la reprise d'un fil (réponse arrivée côté serveur, affichée seulement au rechargement) | Accueil visible sur fil repris ; cause de la lenteur isolée et corrigée | V1b |

### E1 — Fiabilité de l'agent : middlewares LangChain et exécution LangGraph

Source : [middlewares préconstruits](https://docs.langchain.com/oss/python/langchain/middleware/built-in) (lue).

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E1.1 | `ToolErrorMiddleware` (`on_error`, `tools` ; exige `langchain>=1.3.14`) : une exception d'outil devient un message d'erreur **expurgé** que le modèle peut corriger ou qui arrête le run selon une matrice des erreurs métier | Matrice écrite, test : erreur métier, 403, délai, 500 | M1 |
| E1.2 | `ToolRetryMiddleware` et `ModelRetryMiddleware` (`max_retries`, `retry_on`, `on_failure`, `backoff_factor`, `jitter` ; comportement par défaut modifié en `langchain>=1.3.16`) : une **seule** politique de reprise avec LiteLLM (`max_retries=0` côté client) et MCP ; lecture seule rejouable, jamais une écriture | Budget total borné, test sans cascade de reprises | M1 |
| E1.3 | `ContextEditingMiddleware` + `ClearToolUsesEdit` (`trigger`, `keep`, `exclude_tools`, `placeholder`) : effacer les vieux résultats d'outils **sans toucher aux résultats du tour en cours** (cause de l'incident du résumé tronqué du 2026-10-27) | Jeu de référence sans régression, gain de jetons mesuré | M1 |
| E1.4 | `ModelFallbackMiddleware` : second filet sur un autre groupe de modèles, **en plus** du routage LiteLLM (première frontière) | Panne simulée du modèle principal : réponse rendue par le repli | M3 |
| E1.5 | `LLMToolEmulator` : outils simulés dans le banc d'évaluation, en remplacement des doubles de test maison | Banc sans double maison | M3 |
| E1.6 | `ProviderToolSearchMiddleware` : **non applicable aujourd'hui** (réservé à Anthropic Claude 4+ et OpenAI gpt-5.5+, erreur sinon) ; à réévaluer seulement si ces fournisseurs entrent dans la passerelle | Décision écrite (Q3) | M3 |
| E1.7 | Sortie structurée officielle : `response_format` avec `ToolStrategy` / `ProviderStrategy` pour le sélecteur d'outils, les surfaces et les réponses structurées ; revoir les pannes de format JSON observées par fournisseur | Cas de panne couvert, erreurs visibles, reprises bornées | T10, analyse « sortie structurée » |
| E1.8 | Exécution durable LangGraph : lire [tolérance aux pannes](https://docs.langchain.com/oss/python/langgraph/fault-tolerance) et [exécution durable](https://docs.langchain.com/oss/python/langgraph/durable-execution) (pages non lues), puis régler modes de durabilité, politiques de reprise par nœud et cache | Reprise après arrêt du processus, test sur PostgreSQL réel | P2.4–P2.6, porte G2 |
| E1.9 | **Relever les plafonds** du § 3 : rendre chacun configurable (variable d'environnement documentée), mesurer le coût en latence et en jetons, fixer les cibles (Q8) ; ajouter un plafond de **durée totale et de jetons par run**, absent aujourd'hui (`docs/ia.md`, T2.5) | Tableau avant/après, cibles tenues, aucune réponse tronquée | Principe 4 |
| E1.10 | Flux d'événements de LangGraph : la documentation recommande la version 3 (`stream_events(version="v3")`, projections `messages`, `values`, `subgraphs`, `output`, introduite en 1.2) ; `ag-ui-langgraph` 0.0.47 appelle encore `astream_events` en version 2. Suivre ses mises à jour **sans réimplémenter le flux** ; flux personnalisé `get_stream_writer` pour l'avancement | Version de `ag-ui-langgraph` qui adopte la v3 identifiée, ou question posée à l'éditeur | Streaming (page lue) |
| E1.11 | Retour dans le temps et reprise (`get_state_history`, `update_state`, [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel), page non lue) comme **aide à l'analyse d'incident**, sur données synthétiques | Procédure d'incident testée | Analyse « time travel » |

### E2 — Confidentialité, traces et conformité (avant toute donnée réelle)

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E2.1 | `PIIMiddleware` (`strategy` : `block`, `redact`, `mask`, `hash` ; `apply_to_input`, `apply_to_output`, `apply_to_tool_results`) avec **détecteurs personnalisés** : les types natifs sont `email`, `credit_card`, `ip`, `mac_address`, `url`, donc CIN, RIB/IBAN marocains et téléphones demandent un `detector` (Q5) | Cas synthétiques CIN, RIB, téléphone, courriel masqués avant le modèle et dans les traces | M2 |
| E2.2 | Politique de traces LangChain (`configure_trace_policy`, `omit_payload`) + masquage OpenInference + **preuve sur une trace Phoenix réelle** qu'aucune donnée sensible n'apparaît ; rétention 30 jours, annotation | Trace synthétique inspectée de bout en bout | M2, T3.4, analyse P1 |
| E2.3 | Observabilité complète (T3.4) : traces du clic à la base, alertes, corrélation `requestId`/`threadId`/`runId`/`toolCallId` dans l'audit (sans les mettre en étiquettes de métriques), évaluation des coûts par run | Tableau de bord et alertes, audit corrélé | T3.4, analyse « neuf piliers » |
| E2.4 | Conformité (T3.6) : registre des systèmes, fiche du système, analyse d'impact, notice, durées de conservation (loi 09-08, NIST AI RMF, ISO/IEC 42001, OWASP LLM) | Documents approuvés | T3.6 |
| E2.5 | Exploitation (T3.7) : procédure d'incident, changement de modèle, prompts versionnés, SBOM et analyse de vulnérabilités du service IA, interrupteur d'arrêt, sauvegarde et restauration des bases IA (`ia-db`, `litellm-db`, Phoenix, SQLite du runtime) | Exercice de restauration réussi | T3.7, analyse « exploitation » |
| E2.6 | Conservation dans la passerelle (T2.8) : le contenu des messages n'est pas conservé par LiteLLM (vérifier journaux de dépense et rétention) | Contrôle automatisé | T2.8 |

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
| E4.1 | `contexte.py` → `dynamic_prompt` + invite ou ressource MCP de Spring AI (`@McpPrompt`) lue par l'adaptateur MCP ; contexte d'exécution immuable par `context_schema` / `ToolRuntime` (page [runtime](https://docs.langchain.com/oss/python/langchain/runtime), non lue) | `contexte.py` supprimé, droits non élargis | T24 |
| E4.2 | `memoire.py` (préfixe de fil, purge) → espaces de noms du `Store` LangGraph (`AsyncPostgresStore`) ; **l'expiration (TTL) n'est pas documentée** pour le `Store` : tâche `pg_cron` ou équivalent gratuit | Isolation testée, expiration prouvée | T25 |
| E4.3 | `jeton_agent` et encodeur JWT → échange de jetons RFC 8693 (Spring Authorization Server, client OAuth2) | Anciens chemins supprimés, audience et expiration testées | T26 |
| E4.4 | `agui.py` (authentification, validation, flux SSE) → `add_langgraph_fastapi_endpoint` d'`ag-ui-langgraph` (présent en 0.0.47) avec dépendances FastAPI ; outils par requête par les crochets dynamiques | `agui.py` réduit aux dépendances | T27 |
| E4.5 | `evaluation.py` (rejoueur) → `openevals` et `agentevals` sous pytest, sans LangSmith ; **risque** : `agentevals` est dormant (E0.1) | Rejoueur supprimé, jeu de référence rejoué par pytest | T28 |
| E4.6 | `filtrer_config.py`, `enregistrer_cles.py`, `test_providers.py` → `include` de fichiers de configuration LiteLLM par fournisseur, sondes natives, clés virtuelles par l'API gérée | Scripts supprimés | T29 |
| E4.7 | Composants maison (`DataTable`, `KpiGrid`, `Chart`, `QuestionUtilisateur`, `FilAssistant`) → AG Grid Community ou TanStack Table, `ng2-charts`, interruptions natives CopilotKit (`registerHumanInTheLoop`, `injectInterrupt`) | Composants maison supprimés, accessibilité conservée | T30 |
| E4.8 | `serveur.mjs` (authentification `/auth/me`, routes, propriété du fil) → crochets officiels `onBeforeHandler` ; `identifyUser` est réservé à Intelligence : équivalent gratuit ou proxy d'authentification standard | Fils réservés à leur propriétaire, testé | T31 |
| E4.9 | `surfaces.py` (liste → tableau ou graphique) → motif A2UI à schéma fixe (`a2ui-fixed-schema`) ; évaluer MCP Apps (`provideMCPApps`, `@copilotkit/angular/mcp-apps`) pour que l'interface vienne du serveur MCP | Décision mesurée puis migration | T23 |
| E4.10 | Liste titrée des anciennes conversations : `injectThreads` / tiroir de fils sur les routes locales du runtime ; **voie gratuite à instruire** (Q10) | Liste, titre, suppression, isolation par utilisateur | T21 |

### E5 — Conversations et mémoire

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E5.1 | Conversations multi-tours (T3.2) : isolation, **suppression par l'utilisateur**, reprise après redémarrage, expiration de l'historique SQLite du runtime (aucune aujourd'hui) | Tests de suppression et d'expiration | T3.2, V1b |
| E5.2 | Contexte d'écran (T3.3) : conserver `connectAgentContext` en lecture seule et **revalider côté serveur** ; ne jamais le présenter comme un état partagé | Test : filtre falsifié refusé | T3.3 |
| E5.3 | Mémoire longue explicite (P4.6) : préférences uniquement, consultable, corrigeable, supprimable, avec expiration ; pas de faits personnels RH promus automatiquement ; mémoire du fichier `AGENTS.md` de Deep Agents (E9.5) à rapprocher | Politique écrite (Q5) puis tests d'oubli | P4.6, `backend-gap-analysis` |
| E5.4 | Reconnexion du flux et rattrapage (P3.4) : `AG-UI Streams` est une fonction de **CopilotKit Intelligence** (exclue) ; `join` / `rejoin` de LangChain suppose le serveur d'agent LangGraph (`langgraph dev` en local, sinon déploiement LangSmith, exclu) et n'est pas documenté pour un service FastAPI maison ; voie gratuite à instruire (Q10) | Pas de double exécution au retour du réseau | P3.4 |
| E5.5 | Séparation des trois mémoires : état de fil (checkpointer), mémoire inter-fils (`Store`), contexte immuable d'exécution ; documenter la frontière | Schéma d'état formalisé | Analyse LangGraph |

### E6 — Interface CopilotKit complète (Angular)

Source : [exemples Angular](https://docs.copilotkit.ai/angular/features) (41 entrées, lue) et [référence](https://docs.copilotkit.ai/reference/angular) (lue). Aucune n'est libellée bêta ; aucune n'indique si elle exige Intelligence.

| ID | Fonction CopilotKit | Preuve de terminé | Origine |
|---|---|---|---|
| E6.1 | Rendu des appels d'outils : `registerRenderToolCall` pour les 30 outils MCP (renderers partagés par domaine) + renderer universel de repli (« Tool Rendering ») ; chaîne de raisonnement et d'outils (`tool-rendering-reasoning-chain`) | Chaque outil a un rendu lisible, accessible | Copilot future |
| E6.2 | Raisonnement : composant de message de raisonnement personnalisé (`reasoning-custom`) aux couleurs Staport | Rendu et test | Copilot future |
| E6.3 | Outils frontend : `registerFrontendTool` (synchrone et asynchrone) pour ouvrir une vue ou préparer un filtre, **réversibles** ; `registerComponent` (l'agent affiche un composant Angular précis) ; le serveur reste l'autorité | Parcours « ouvrir la vue filtrée » testé, droits revérifiés | P3.3, Copilot future |
| E6.4 | État partagé agent ↔ interface : lecture seule, lecture-écriture, flux de deltas (`agent.setState`, `shared-state-*`) sur **un** parcours concret ; propriété et source d'autorité à fixer (Q6) | Conflit et validation testés | Copilot future |
| E6.5 | Interface sans chat (« headless ») pour l'espace plein écran : `injectAgentStore`, `registerRenderToolCall`, messages et surfaces (J4, T8) ; `CopilotActivity` + `registerRenderActivityMessage` pour les cartes d'activité | Espace immersif livré | J4 |
| E6.6 | Interruptions : `injectInterrupt` (dans le chat et hors chat) et `registerHumanInTheLoop` (par outil) ; dépend de E7 | Voir E7 | Copilot future |
| E6.7 | Pièces jointes (multimodal) ; voix en temps réel ; **cadrer consentement, types de fichiers, antivirus, données RH** (Q11) | Cadre écrit puis prototype | Copilot future, J9 |
| E6.8 | MCP Apps (`provideMCPApps`) : prototype isolé (isolation iframe, droits, accessibilité, provenance) ; WebMCP (`webmcp` sur `registerFrontendTool`) : **expérimental**, exige Chrome 149 et le brouillon d'un groupe communautaire du W3C ; ses annotations ne sont pas des contrôles de sécurité | Décision écrite pour chacun (Q7) | T23, Copilot future |
| E6.9 | Interface générative ouverte (HTML/CSS/JS agent-généré, iframe) : **interdite** par `conventions/agent-ui.md` ; toute étude exige un ADR et une évolution normative (Q7) | ADR ou refus écrit | M4, `progression-ui` |
| E6.10 | Récupération des surfaces A2UI invalides (`a2ui-recovery` : boucle de validation et reprise avant repli) ; catalogue fermé versionné | Surface invalide : reprise puis repli, testé | T16 |
| E6.11 | Capacités de la bibliothèque : `injectCapabilities`, `injectCopilotKitConfig`, directive `CopilotKitAgentContext`, `selfManagedAgents` ; contrat de production (zoneless, hydratation, SSR, nettoyage) de la page « production-lifecycle » ; budget de taille du paquet (peut dépasser 1 Mo) | Contrat appliqué, budget réglé | Copilot future |
| E6.12 | Inspecteur CopilotKit : activé **en développement seulement** ; ses « Rich Threads » exigent Intelligence | Désactivé en production, vérifié | Copilot future |
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

Sources lues : [vue d'ensemble](https://docs.langchain.com/oss/python/deepagents/overview), [sous-agents](https://docs.langchain.com/oss/python/deepagents/subagents)
(sauf les 5 087 derniers caractères), [backends](https://docs.langchain.com/oss/python/deepagents/backends), [production](https://docs.langchain.com/oss/python/deepagents/going-to-production).
Non lues : agents asynchrones, compétences, mémoire, interpréteurs, bacs à sable, profils, rubrique, ACP.

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E9.0 | **Décision d'architecture** : ajouter les middlewares de Deep Agents (`SubAgentMiddleware`, `FilesystemMiddleware`, `RubricMiddleware`, importables dans `create_agent` d'après la page des middlewares) à l'agent actuel, ou passer à `create_deep_agent` (Q6) | Décision écrite | J5–J7 |
| E9.1 | `SubAgentMiddleware` (outil `task`) : sous-agents par domaine (Paie, Employés, Chantiers, Heures supplémentaires, Audit) avec instructions, outils, modèle et budget propres ; **isolation du contexte** ; `tools` d'un sous-agent **remplace** ceux du parent (droits minimaux) ; `response_format` pour des résultats structurés ; mode `fork` (bêta, `deepagents>=0.7.13`) à part | Aucune élévation de droits, latence et coût mesurés | J5, P3 « conditionnel » |
| E9.2 | Sous-agents asynchrones (lancer, vérifier, modifier, annuler) pour les analyses longues ; flux par sous-agent (`stream.subagents`) ; **page à lire avant** | Analyse longue en parallèle, annulable | Copilot future |
| E9.3 | Fichiers virtuels pour délester le contexte : `FilesystemMiddleware`, `StateBackend`, `StoreBackend` (**fournir une fabrique d'espaces de noms par utilisateur** : par défaut l'espace est celui de l'assistant, donc partagé), `CompositeBackend` ; **jamais** `FilesystemBackend` ni `LocalShellBackend` sur un serveur ; règles `permissions` (première règle gagnante, non applicables aux bacs à sable) | Gros résultats délestés, isolation par utilisateur testée | Copilot future |
| E9.4 | Compétences chargées à la demande (`SKILL.md`, norme Agent Skills) : source, version, périmètre et revue par compétence ; ne remplacent ni RBAC ni politique système (Q13) | Compétence chargée progressivement, testée | Copilot future |
| E9.5 | Mémoire `AGENTS.md` (toujours chargée, modifiable par l'agent) : **risque d'injection si partagée** ; limiter à l'espace utilisateur, écriture contrôlée | Politique écrite, test d'injection | Copilot future, production |
| E9.6 | `RubricMiddleware` (bêta, `deepagents>=0.6.5`) : auto-évaluation par grille sur les rapports et analyses (J5) | Grille et seuil évalués sur le jeu | J5 |
| E9.7 | Exécution : interpréteur `eval` (QuickJS, **sans shell, réseau ni fichiers**) en premier pour les calculs ponctuels ; `ShellToolMiddleware` avec `DockerExecutionPolicy` seulement dans un conteneur jetable **sans réseau, sans secret, sans accès à l'ERP** ; `HostExecutionPolicy` interdite ; fournisseurs de bacs à sable à vérifier (gratuité) | **Décision de sécurité préalable** (Q7) | M6 |
| E9.8 | Recherche de fichiers : `FilesystemFileSearchMiddleware` (`root_path`, ripgrep) sur des documents RH locaux, racine en lecture seule, sans secrets | Périmètre étroit testé | M5 |
| E9.9 | Contrôle de la paie (J5) : contrôles déterministes d'abord (règles approuvées), puis détection de données atypiques ; « atypique » n'est pas « erroné » ; aucun salaire modifié automatiquement | Règles approuvées, faux positifs mesurés | J5, innovations P2 |
| E9.10 | Profils de harnais, page des modèles, protocole ACP, intégration AG-UI de Deep Agents (todos, état des sous-agents) | Décision par élément | Copilot future |
| E9.11 | Autres motifs multi-agents de LangChain (transferts, routeur, flux personnalisé) : lire les pages et ne retenir que ce qui apporte un gain mesuré | Comparatif | Analyse « multi-agents » |

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
| Fonctions de `copilot-kit-future-to-implement.md` | Codex, 2026-10-31 | E6 (CopilotKit), E1 et E5 (LangChain), E1, E5 et E7 (LangGraph), E9 (Deep Agents) |
| Écarts de `backend-gap-analysis.md` | Codex, 2026-10-31 | E1.1 à E1.3, E2.1 à E2.2, E5.3, E7, E9 |

Les documents supprimés se relisent avec `git show 46cf1e39^:<chemin>` (par exemple `docs/ia/plan-integration.md`,
`docs/ia/rag.md`, `docs/ia/progression-ui.md`, `docs/ia/protocoles-et-innovations.md`,
`docs/ia/analyse-architecture.md`, `docs/handoff/integration-ia.md`, ADR 0002, 0008 et 0013).

## 6. Questions pour le propriétaire (le code ne permet pas de répondre)

- **Q1 — Sort des fichiers.** Ce plan remplace-t-il le § 7 de `docs/ia.md` (qui garderait décisions, architecture, état et
  journal, avec un renvoi ici) et absorbe-t-il `copilot-kit-future-to-implement.md` et `backend-gap-analysis.md`, qui
  seraient alors supprimés ?
- **Q2 — Ordre.** L'ordre E0 → E10 vous convient-il ? Le pilote réel (E10.6) dépend de E2 et E3 ; faut-il avancer E6
  (interface) avant E4 (code maison) ?
- **Q3 — Fonctions réservées à un service payant ou hébergé.** Confirmez-vous leur exclusion : CopilotKit Intelligence
  (AG-UI Streams, mémoires utilisateur, trajectoires, analyses, canaux), LangSmith (Studio, observabilité, déploiement),
  Managed Deep Agents, `ProviderToolSearchMiddleware` (Anthropic ou OpenAI seulement) et les fournisseurs de bacs à sable ?
  L'offre gratuite d'Intelligence envoie les conversations chez l'éditeur : acceptable pour des données RH, ou non ?
- **Q4 — Première écriture.** Quel parcours autoriseriez-vous en premier (et pour quels rôles) ? Sans réponse, E7 reste préparée.
- **Q5 — Données et confidentialité.** Quels champs masquer avant un modèle externe (CIN, salaires, noms, RIB), dans la
  question, dans les résultats d'outils et dans les traces ? Les résultats d'outils masqués empêchent de répondre : faut-il
  un modèle local (E10.2) pour les données réelles ? Quelle politique pour une mémoire longue ?
- **Q6 — État partagé et architecture agent.** Quel parcours justifie un état modifiable par l'agent et par l'utilisateur
  (E6.4) ? Ajoute-t-on les middlewares de Deep Agents à l'agent actuel (progressif) ou migre-t-on vers `create_deep_agent` (E9.0) ?
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

**À lire avant d'implémenter la tâche concernée** (listées dans l'index officiel, non lues pour ce brouillon) : LangChain
[runtime](https://docs.langchain.com/oss/python/langchain/runtime), [sortie structurée](https://docs.langchain.com/oss/python/langchain/structured-output),
[garde-fous](https://docs.langchain.com/oss/python/langchain/guardrails), [mémoire à long terme](https://docs.langchain.com/oss/python/langchain/long-term-memory),
[multi-agents](https://docs.langchain.com/oss/python/langchain/multi-agent/index) ; LangGraph [tolérance aux pannes](https://docs.langchain.com/oss/python/langgraph/fault-tolerance),
[checkpointers](https://docs.langchain.com/oss/python/langgraph/checkpointers), [stores](https://docs.langchain.com/oss/python/langgraph/stores),
[retour dans le temps](https://docs.langchain.com/oss/python/langgraph/use-time-travel), [sous-graphes](https://docs.langchain.com/oss/python/langgraph/use-subgraphs),
[API fonctionnelle](https://docs.langchain.com/oss/python/langgraph/functional-api) ; Deep Agents
[agents asynchrones](https://docs.langchain.com/oss/python/deepagents/async-subagents), [compétences](https://docs.langchain.com/oss/python/deepagents/skills),
[mémoire](https://docs.langchain.com/oss/python/deepagents/memory), [interpréteurs](https://docs.langchain.com/oss/python/deepagents/interpreters),
[bacs à sable](https://docs.langchain.com/oss/python/deepagents/sandboxes), [permissions](https://docs.langchain.com/oss/python/deepagents/permissions),
[profils](https://docs.langchain.com/oss/python/deepagents/profiles), [grilles d'évaluation](https://docs.langchain.com/oss/python/deepagents/rubric) ;
CopilotKit : pages de guide Angular (interruptions, état partagé, fils, pièces jointes, interface sans chat), [production et cycle de vie](https://docs.copilotkit.ai/reference/angular/production-lifecycle).
