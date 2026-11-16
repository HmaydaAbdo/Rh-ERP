---
title: "Registre : décisions ouvertes, code maison, middlewares"
sidebar_position: 6
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions des tâches T* décrivent l'état au 2026-11-06 : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## Décisions à prendre

| Sujet | Options | Recommandation |
|---|---|---|
| Stockage des conversations (T3.2) | Checkpointer LangGraph PostgreSQL dans une base IA dédiée ; ou table dédiée de conversations | Checkpointer PostgreSQL dans une base IA dédiée, tables créées par migration contrôlée : il sert aussi aux reprises de J6 |
| Durées de conservation (T3.6) | Conversations, journaux LiteLLM (30 jours aujourd'hui). **Traces Phoenix : sans limite**, supprimées seulement par le propriétaire (décision du 2026-11-04) | Conversations et journaux : proposées après la mesure du pilote, avec l'analyse d'impact |
| Outil et méthode d'observabilité (T3.4) | **Arize Phoenix local** reçoit OpenTelemetry/OpenInference ; ses sessions regroupent les tours, les traces localisent les spans, les annotations consignent les causes et les jeux/datasets + expériences comparent les versions | Garder Phoenix auto-hébergé et privé ; utiliser des cas synthétiques ou explicitement pseudonymisés pour les datasets ; ne pas envoyer des conversations RH réelles à un évaluateur externe ; entrées et sorties conservées en clair et traces conservées sans limite (base `phoenix` du PostgreSQL de l'ERP, sauvegardée et chiffrée avec elle) |
| Modèle local (T3.1) | Matériel acheté, loué ou mutualisé | Décision du propriétaire sur le dimensionnement mesuré |
| Pseudonymisation (T3.1) | Remplacer CIN et noms par des jetons avant un modèle externe, les rétablir dans la réponse | Oui tant qu'un modèle hors de l'entreprise reçoit des données réelles ; inutile avec le seul modèle local |
| Vérificateur de chiffres (T10) | ~~Décidé le 2026-10-26 : gardé, en middleware officiel (`after_model`)~~ **Décision du 2026-10-27 appliquée en V1f après V1d** : suppression complète (T22), sans remplaçant maison | — |
| Texte en flux et vérification (T11) | **Décision du 2026-10-27 appliquée en V1f** : le texte reste diffusé tel quel ; l'état partagé `verification` et la mention « vérification en cours » ont été retirés | — |
| Raisonnement affiché (T11) | **Décidé le 2026-10-26** : raisonnement brut du modèle, dans un bloc « Réflexion » replié | — |
| Dépendances du client (T12, T13) | **Décidé le 2026-10-26** : dernières versions des frameworks adoptées même préliminaires (CopilotKit Angular, A2UI) ; `zod` forcé en version 4 contre la faille GHSA-mrhx-c7xc-m3w5, compatibilité vérifiée | — |
| Langues (T3.9) | Français seul ; français, arabe et darija écrits | Mesurer la demande au pilote ; arabe écrit en priorité si les utilisateurs l'emploient |

## Objectif : aucun code IA fait maison, aucun service payant

Décisions du propriétaire (2026-10-27) : **tout est gratuit** (aucun abonnement, y compris CopilotKit Intelligence : une
fonction payante se remplace par une alternative gratuite, jamais par un achat) et **le code IA fait maison est une dette
suivie jusqu'à zéro** : chaque pièce ci-dessous reste une tâche ouverte tant qu'un framework officiel et gratuit n'a pas
pris sa place. Une pièce n'est retirée de la liste qu'une fois remplacée et testée ; l'inventaire se relit à chaque
changement du chantier IA. Les points non terminés ne sont jamais effacés : ils restent ⬜ ou 🟦 pour que le travail
reprenne là où il s'est arrêté.

| Tâche | Pièce maison actuelle | Piste gratuite à instruire | État |
|---|---|---|---|
| T21 — Liste titrée des anciennes conversations | Aucune : fonction absente. Le fil est rejoué, mais l'utilisateur ne peut pas revenir à un ancien fil | `injectThreads` et `CopilotThreadsDrawer` de CopilotKit sur les routes locales de fils du runtime (`LocalThreadEndpointRunner`) ; contribuer ou étendre le runner SQLite officiel ; titre tiré de la première question ; sinon petit code **temporaire** avec date de retrait | ⬜ |
| T22 — Vérificateur de chiffres | `verification.py` et `VerificateurChiffres` | **Décision du propriétaire (2026-10-27) appliquée en V1f après V1d** : suppression complète sans remplaçant maison. Les règles de réponse et les calculs relèvent des outils métier et des middlewares officiels ; le jeu de référence mesure l'exactitude | ✅ V1f |
| T23 — Surfaces déterministes | ✅ **Fait (KAN-80)** : motif officiel « schéma fixe » côté outil. Chaque outil MCP de liste déclare ses colonnes (liste blanche) et rend `a2ui_operations` (`api/src/staport/domains/mcp/surfaces.py`) ; `ia/src/staport_ia/surfaces.py` ne fait que transmettre et masquer au modèle (253 → 85 lignes, plus aucune déduction de colonnes, libellés ni formats) | MCP Apps abandonné (décision du 2026-10-31) | ✅ |
| T24 — Contexte ERP | `contexte.py` : date, droits, dernier mois de paie | Ressource MCP `erp://contexte` publiée par l'API (FastMCP, droits de l'appelant), lue une fois par run et passée par le `context_schema` de LangGraph au décorateur officiel `dynamic_prompt` (KAN-72) | ✅ |
| T25 — Mémoire des conversations | `memoire.py` : préfixe de fil par utilisateur, purge des conversations inactives | Isolation par espaces de noms du `Store` LangGraph ; expiration par une tâche `pg_cron` (extension PostgreSQL gratuite) ou par le TTL du `Store` PostgreSQL | ⬜ |
| T26 — Échange de jeton | `outils.py` : `jeton_agent` appelle `/auth/jetons/agent` ; côté API, émission par l'encodeur JWT | Échange de jetons OAuth2 (RFC 8693) : serveur Authlib (`AuthorizationServer`, JWT RFC 9068 par `JWTBearerTokenGenerator`, JOSE par `joserfc`) et client OAuth2 d'Authlib côté IA ; reste une classe de grant 8693 (~40 lignes, `echange_jetons.py`), Authlib n'en publiant pas encore : à retirer à sa parution (KAN-74) | ✅ |
| T27 — Enveloppe du service IA | `agui.py` : authentification, validation de la question, flux SSE, erreurs sans détail | `add_langgraph_fastapi_endpoint` avec dépendances FastAPI ; outils par requête via les crochets dynamiques de LangChain | ⛔ gardé (décision du propriétaire, 2026-11-15, KAN-75) : l'assistant officiel sert un agent construit une fois, sans crochet par requête (outils MCP au nom de l'utilisateur, fil propre, état non fiable écarté, filtre des événements, erreur sans détail, arrêt en douceur) ; demande amont [ag-ui-protocol/ag-ui#3404](https://github.com/ag-ui-protocol/ag-ui/issues/3404) ; à reprendre quand l'éditeur l'offre |
| T28 — Banc d'évaluation | `evaluation.py` : rejoueur et notation | `agentevals` et `openevals` sous pytest, sans LangSmith ; supprimer le rejoueur | ✅ juge `openevals` (KAN-208), trajectoire `agentevals`, jeu rejoué par pytest (KAN-76) ; restent les critères métier (formats français), absents des bibliothèques |
| T29 (KAN-77) — Scripts de la passerelle | `filtrer_config.py`, `enregistrer_cles.py`, `test_providers.py` | `include` de fichiers de configuration LiteLLM par fournisseur ; contrôles de santé et sondes natifs ; clés virtuelles par l'API gérée en base | ✅ **`filtrer_config.py` supprimé (2026-11-15)** : sondes natives `background_health_checks` + `enable_health_check_routing`, mesurées dans Docker avec un faux fournisseur (sans : 5 échecs sur 20 requêtes ; avec : 0 échec sur 95 pendant 100 s, cooldown de 5 s), sans `allowed_fails_policy` qui désactiverait le filtre ; configuration valide sur l'image épinglée (54 déploiements sondés, 8 exclus : Cohere d'évaluation et sonde cassée de l'auto-test). ⛔ **`enregistrer_cles.py` gardé** : la documentation officielle n'a aucune déclaration de clés dans la configuration (« no config.yaml surface ») ; le CLI officiel `litellm-proxy keys` (devenu `lite`) n'a que `generate`, `delete`, `list` et `import`, sans mise à jour ni lecture d'une clé : la synchronisation idempotente des groupes autorisés passe par l'API officielle `/key/info` et `/key/update`, que le script appelle. ⛔ **`test_providers.py` gardé** : `GET /health` couvre l'état de chaque déploiement, mais pas l'OCR réel, la sortie JSON, l'ancrage, l'abstention ni la bascule ; ces scénarios n'ont pas d'équivalent officiel |
| T30 — Composants d'interface | `DataTable`, `KpiGrid`, `Chart`, `QuestionUtilisateur`, `FilAssistant` | Tableau : AG Grid Community ou TanStack Table (licences libres) ; graphique : `ng2-charts` ; question : interruptions natives de CopilotKit | ✅ **Fait (KAN-78, 2026-11-15)** : le tableau des surfaces A2UI (`a2ui-data-table`) est le `stp-table` AG Grid de l'ERP (tri, clavier, accessibilité et thème natifs ; défilement CDK, tri et rôles ARIA maison supprimés ; pagination au-delà de 20 lignes) et ne garde que la barre (titre, recherche, plein écran) et la barre de proportion ; le graphique passe par `stp-chart` (`ng2-charts`) ; la question de l'agent et l'accord d'écriture passent par `injectInterrupt` (la carte de réponse est le seul affichage à nous) ; `FilAssistant` reste (identifiant du fil), voir T34. `comparer` supprimé |
| T32 — Sélection d'outils juste-à-temps | **Fait (2026-11-03)** : une compétence `SKILL.md` par domaine dans `ia/src/staport_ia/competences/` (6 domaines, 7 outils au plus chacune, les 31 outils couverts une fois), `SkillsMiddleware(tools=résolveur)` sur le catalogue MCP de l'utilisateur, `routage.py` calculant `pinned_skills` hors modèle (embeddings MiniLM locaux), repli par lecture du `SKILL.md`, aucun plafond de domaines épinglés, évaluation `ia/evaluation/routage.json` (41 demandes, 39 couvertes, p50 5,9 ms) ; 22 définitions d'outils complétées (cas de non-usage, limites) | Fonctions officielles de Deep Agents ≥ 0.7.23 ; seule pièce maison **déclarée** : la fonction de routage | Tests verts (66), ruff et pyright stricts verts ; **banc réel (2026-11-03, routage actif)** : 23/24, latence p50 8,25 s contre 9,09 s avant (sélecteur LLM), l'échec restant est un chemin valide différent du chemin attendu (`fonction_rechercher` au lieu de `employes_rechercher`) ; le p95 (68 s) vient des offres gratuites, pas du routage |
| T33 (KAN-203) — Migration du service IA vers Deep Agents | **Fait (2026-11-03)** : `create_deep_agent` dans `agent.py` (middlewares de contexte, surfaces, plafonds, reprise et `CopilotKitMiddleware` reportés dans `middleware`), harnais limité à `read_file` et `write_todos`, sous-agent généraliste désactivé par profil d'harnais, `LLMToolSelectorMiddleware` retiré, image Docker avec modèle d'embeddings préchargé. Le groupe de passerelle `tool-selection` est retiré (configuration, clés virtuelles, tests de fumée, README) | Point d'entrée officiel documenté de Deep Agents (`create_deep_agent(model, tools, middleware, backend, ...)`) | Test de contrat vert ; écriture refusée par `FilesystemPermission` (test : aucun outil métier dans `tools=`, `write_file` refusé même lié) ; espace de fichiers par identité (`backend_par_identite`, isolation testée) ; **reste** : magasin PostgreSQL avec l'épopée d'écriture |
| T31 — Contrôle d'accès du runtime | `app.mjs` : authentification par `/auth/me`, routes servies, fil réservé à son propriétaire | Gestionnaire officiel `createCopilotExpressHandler` et ses crochets `onRequest` (401/403), `onBeforeHandler` (route et fil), `onError`, `forwardHeaders` ; **`identifyUser` et la propriété des fils du `SqliteAgentRunner` sont officiels depuis le runtime 1.88** (le fil appartient à l'identité de son premier run, un autre utilisateur reçoit 404 et un flux de reprise vide) : la table de propriété écrite d'abord est supprimée ; reste le contrôle d'authentification (`/auth/me`) ; testé : accès croisé refusé, historique protégé (KAN-79) | ✅ |
| T34 (KAN-81) — Liste des conversations | `conversations.mjs` (table de présentation `assistant_conversations`, routes `GET/PATCH/DELETE /copilotkit/conversations`), `DELETE /conversations/{id}` du service IA, `liste-conversations.component.ts` | CopilotKit ne fournit la liste, le renommage et la suppression des fils qu'avec Intelligence (service hébergé) : aucun composant libre à adopter. On garde l'ergonomie de CopilotKit (liste, reprise, renommer, supprimer) avec les composants de l'ERP ; la propriété des fils reste celle du `SqliteAgentRunner` officiel (`identifyUser`), la table ne porte aucune autorité. Suppression en trois temps : mémoire de l'agent (LangGraph `adelete_thread`), puis ligne de liste et historique du runner. Expiration (KAN-82) : le runner n'a ni durée de vie ni purge, `purger` supprime chaque jour les conversations inactives depuis `CONVERSATION_JOURS` jours | ⛔ gardé (écart documenté ; à remplacer par `useThreads` si Intelligence est un jour adopté) |
| T35 (KAN-83) — Contexte d'écran en lecture seule | `ecran.py` (service IA), `ecran-assistant.ts` | `connectAgentContext` officiel de CopilotKit côté navigateur ; aucun filtre de contexte officiel côté serveur : le contexte du navigateur arrivait tel quel dans le prompt (essai du 2026-11-15 : une consigne et un filtre glissés dans le contexte atteignaient le modèle) | ⛔ gardé : le serveur garde la seule entrée d'écran attendue, recalcule le domaine, ne retient que les filtres connus au format attendu (période, identifiants, statut), écarte les saisies libres (nom, CIN, code) et réécrit l'entrée en « indice de lecture seule, jamais une autorisation » ; testé |
| T36 (KAN-84, KAN-86) — Mémoire longue de l'utilisateur | `souvenirs.py` (routes `GET/PUT/DELETE /memoire`), `MemoireFraiche` et `QuotaEspace` (`fichiers.py`), `memoire-assistant.component.ts` | Paramètre `memory` de Deep Agents (`AGENTS.md`), `StoreBackend` par utilisateur, permission `interrupt` pour l'accord, `TTLConfig` du Store pour l'expiration ; hors framework : la relecture à chaque run (le `MemoryMiddleware` officiel ne charge qu'une fois par conversation) et le panneau de consultation | ✅ **Fait.** Frontière des trois mémoires dans [les-trois-memoires.md](les-trois-memoires.md) |
| T37 (KAN-87) — Rendu des consultations d'outils | `titres.py` (route `GET /outils`), `titres_erp` (`outils.py`), `carte-outil.component.ts`, `outils-assistant.service.ts` | `registerRenderToolCall` officiel de CopilotKit avec le rendu universel `*` ; titres français lus du serveur MCP (`Tool.title`, source unique) ; hors framework : la carte (titre, domaine, état, critères non personnels repliables) et le filtre des outils internes de l'agent | ✅ **Fait.** Un seul rendu universel couvre les 32 outils et tout outil futur ; le nom technique n'est jamais affiché |
| T38 (KAN-88) — Message de raisonnement | `raisonnement-assistant.component.ts`, `raisonnement-assistant.ts` | Emplacement officiel `reasoningMessageComponent` de `copilot-chat` ; texte rendu par `CopilotChatAssistantMessageRenderer` (CopilotKit) ; hors framework : le libellé français (« Réflexion en cours… », « Réflexion de 4 s ») et la carte aux couleurs de l'ERP, car le composant d'origine est en anglais | ✅ **Fait** |
| T40 (KAN-91) — Espace IA plein écran | `espace-assistant.component.ts`, `assistant.component.ts`, `liste-conversations.component.ts`, `fil-assistant.service.ts` | Discussion officielle `copilot-chat` réutilisée à l'identique (parité par construction, pas de headless réécrit) ; hors framework : la page (route `/assistant`), la barre latérale des conversations (CopilotKit n'offre `injectThreads` et le tiroir qu'avec Intelligence, service hébergé) et le lanceur qui remplace `copilot-sidebar` | ✅ **Fait** |

## Middlewares officiels de LangChain et LangGraph : tous adoptés, sans exception

Décision du propriétaire (2026-10-27) : **tous les middlewares officiels de LangChain** (1.4.7, liste de
`langchain.agents.middleware`) et les fonctions de LangGraph sont mis en œuvre, chacun avec un test ; ils prennent la
place de tout code maison équivalent. « Sans exception » veut dire qu'aucun n'est écarté sans décision écrite du
propriétaire : un middleware à risque (exécution de commandes) s'adopte avec ses garde-fous, pas autrement.

| Élément officiel | État | Tâche |
|---|---|---|
| `TodoListMiddleware` | ✅ en place | — |
| `ModelCallLimitMiddleware`, `ToolCallLimitMiddleware` | ❌ retirés (KAN-40) : décision du propriétaire, aucun plafond appliqué par nous | — |
| `SummarizationMiddleware` | ✅ en place (40 000 jetons, résumé interne) | — |
| `LLMToolSelectorMiddleware` | ✅ adopté et testé ; **retiré du chemin systématique le 2026-11-03** (il ajoute un appel de modèle) : le routage de base est l'épinglage de compétences hors modèle (T32) ; réactivable en second étage après évaluation chiffrée | T32 |
| `CopilotKitMiddleware` (A2UI, outils du navigateur) | ✅ en place | — |
| `ContextEditingMiddleware` (`ClearToolUsesEdit`) | ✅ en place (KAN-34) : au-delà de 30 000 jetons, les 6 derniers résultats d'outils sont gardés et les plus anciens remplacés par un marqueur ; `poser_question` jamais effacé ; testé. Le gain en jetons se mesure sur le jeu de référence avec le vrai modèle (à lancer par le propriétaire) | — |
| `ToolErrorMiddleware`, `ToolRetryMiddleware` | ✅ en place, matrice des erreurs ci-dessous et testée | — |
| `ModelRetryMiddleware` | ⛔ non repris (décision du 2026-11-01) : la reprise des modèles reste dans le routage LiteLLM, qui bascule sans rejouer (`num_retries: 0`), et le client n'en ajoute pas (`max_retries=0`) ; le budget de reprises est borné et testé (`ia/tests/test_agent.py`, KAN-33) | — |
| `PIIMiddleware` (`RedactionRule`, `PIIDetectionError`) | ⬜ | M2 |
| `ModelFallbackMiddleware` | ✅ en place, **inactif tant qu'aucun modèle de repli n'est configuré** (paramètre `repli` de `creer_agent`) ; panne simulée du principal rendue par le repli, testé (KAN-35). Choisir et brancher le modèle de repli du service reste une décision du propriétaire | — |
| `ProviderToolSearchMiddleware`, `LLMToolEmulator` | ⬜ | M3 |
| `HumanInTheLoopMiddleware` (`InterruptOnConfig`), interruptions LangGraph | ⬜ | M4 |
| `FilesystemFileSearchMiddleware` | ⬜ | M5 |
| `ShellToolMiddleware` (`DockerExecutionPolicy`) | ⬜, décision de sécurité | M6 |
| Crochets `before_agent`, `after_agent`, `before_model`, `after_model`, `wrap_model_call`, `wrap_tool_call`, `dynamic_prompt` | utilisés par les middlewares ci-dessus ; `dynamic_prompt` lit le contexte du run ; `contexte.py` supprimé | T24 |
| LangGraph : checkpointer PostgreSQL | ✅ en place | — |
| LangGraph : `Store` (mémoire longue, espaces de noms, expiration) | ✅ `AsyncPostgresStore` pour les fichiers d'espace par utilisateur (`/espace/`), expiration native `TTLConfig`, testé sur PostgreSQL réel (KAN-73) ; reste la purge et le préfixe de fil des conversations, écrits par nous | T25, J4 |

### Décisions de clôture de l'épopée E6 (2026-11-15)

- **KAN-36, non applicable** : les reprises, délais et gestionnaires d'erreur **par nœud** (`retry_policy`, `TimeoutPolicy`,
  `error_handler`) n'existent que pour un graphe construit à la main ; Deep Agents construit le graphe, et les reprises
  passent par les middlewares officiels (`ToolRetryMiddleware`, `ToolErrorMiddleware`, routage LiteLLM). Convention
  gardée : sortir de Deep Agents seulement pour un besoin précis qu'aucun middleware ne couvre.
- **KAN-38, non applicable** : le sélecteur d'outils est un routage par embeddings sans appel de modèle, les surfaces sont
  déterministes, le juge utilise `openevals` et les sous-agents ont été écartés (KAN-261). Aucun code maison à remplacer.
- **KAN-41, veille** : `ag-ui-langgraph` 0.0.47 reste sur `astream_events` v2 et n'expose ni `control` ni `durability` ;
  notre sous-classe `AgentAGUI` les ajoute par `get_stream_kwargs`. Signalement publié :
  [ag-ui-protocol/ag-ui#3403](https://github.com/ag-ui-protocol/ag-ui/issues/3403). À retirer quand l'éditeur les prend en charge.
- **KAN-42** : procédure d'analyse d'incident par retour dans le temps, testée : [analyse d'un incident](../exploitation/incident-agent.md).

### Matrice des erreurs d'outil (KAN-32)

`ToolRetryMiddleware` ne rejoue que les coupures transitoires (`httpx.TransportError`, `TimeoutError`,
`ConnectionError`) : deux reprises. Quelle que soit l'erreur, `ToolErrorMiddleware` la transforme en message d'erreur
qui nomme le type de l'exception sans son texte (qui peut porter un détail interne) ; le run se poursuit et le modèle
explique le manque sans inventer de valeur. Les interruptions LangGraph (question posée à l'utilisateur) remontent
toujours : ce ne sont pas des pannes. Test : `MATRICE_ERREURS` dans `ia/tests/test_agent.py`.

| Erreur de l'outil | Reprise | Ce que voit le modèle | Run |
|---|---|---|---|
| Erreur métier (400, `ValueError`) | non | erreur typée, sans message brut | continue |
| Refus (401, 403) | non | erreur typée ; consigne 4 : dire que le droit manque, ne pas retenter | continue |
| Panne serveur (500) | non | erreur typée | continue |
| Délai dépassé, réseau coupé | 2 reprises | erreur typée si les reprises échouent | continue |
| Interruption LangGraph | sans objet | question à l'utilisateur | en pause |

## Middlewares officiels d'AG-UI et d'A2UI : inventaire (2026-11-09)

Inventaire des points d'extension officiels lus dans les paquets installés (`@ag-ui/client` 1.0.3, `@ag-ui/a2ui-middleware` 0.0.10, `@ag-ui/mcp-apps-middleware` 0.1.2, `@ag-ui/mcp-middleware` 0.0.2, `ag-ui-langgraph` 0.0.47, `ag_ui_a2ui_toolkit` 0.0.6). Un middleware AG-UI s'enregistre par `agent.use(...)` et transforme le flux d'événements d'un run.

| Middleware | Rôle | État |
|---|---|---|
| `FunctionMiddleware` (`agent.use(fn)`) | Fonction `(input, next) => Observable<événements>` : filtre ou transforme le flux | ✅ utilisé : masque les messages `<skill name=…>` de `MESSAGES_SNAPSHOT` (`copilot-runtime/src/app.mjs`) |
| `FilterToolCallsMiddleware` | Retire des appels d'outils du flux | ⬜ non nécessaire : les outils sont déjà bornés par les permissions des compétences |
| `A2UIMiddleware` (`@ag-ui/a2ui-middleware`) | Fait offrir `generate_a2ui` et transforme son flux en surfaces | ✅ activé par `a2ui: { injectA2UITool: true }` du runtime |
| `MCPAppsMiddleware` | Applications MCP rendues dans le chat | ⬜ à évaluer avec le catalogue MCP |
| `MCPMiddleware` | Expose des outils MCP côté client | ⬜ inutile : les outils MCP sont servis par le service IA |
| Compatibilité ascendante (`BackwardCompatibility_0_0_*`) | Adaptation d'anciens clients | ⬜ sans objet |
| `CopilotKitMiddleware` (Python) | Outils du navigateur et paramètres A2UI (`a2ui_params`) | ✅ en place |

Cause de la bulle `<skill …>` : les compétences épinglées de Deep Agents sont des `HumanMessage` marqués `lc_source: pinned_skill`, que `ag-ui-langgraph` convertit en messages utilisateur sans le marqueur. Le signalement amont est publié ([ag-ui-protocol/ag-ui#3343](https://github.com/ag-ui-protocol/ag-ui/issues/3343)) ; le middleware ci-dessus est le contournement par la voie officielle, à retirer quand le correctif amont existe.

Autres points non terminés, gardés ouverts :

| Point | État |
|---|---|
| T20 — Démonstration J1 sur la nouvelle base (images reconstruites, banc réel, flux réels) | ⬜ |
| Espace IA plein écran (J4) et mémoire longue par le `Store` LangGraph | ⬜ |
| Latence d'une réponse sous 30 s à tenir sur le jeu de référence | ⬜ |
| Évaluation de l'agent étendue (cas complexes, tri, questions à l'utilisateur) | ⬜ |
| Historique SQLite du runtime : pas d'expiration | ⬜ |
| Lint : frontend à 0 avertissement (règles en `error`), Ruff, pyright et ESLint du runtime Node, branchés dans la CI | ✅ |
| Écran d'accueil de l'assistant : CopilotKit le masque sur un fil fourni par l'application (fil repris) ; prévoir un accueil propre, avec les moyens officiels de la discussion | ⬜ |
| Reprise du fil dans l'interface : lenteur ponctuelle vue au banc (réponse arrivée côté serveur mais affichée au rechargement) | ✅ Cause isolée et corrigée le 2026-11-02 (E5.6) : flux de run coupé côté client, le serveur garde la réponse ; rattachement par `connectAgent` |

### Outils du harnais visibles par le modèle (KAN-258, KAN-260, KAN-267)

Le modèle voit du système de fichiers `read_file` (lecture des `SKILL.md`), `write_file` et `edit_file` ; `ls`, `delete`,
`glob`, `grep` et `execute` sont masqués par `HarnessProfile(excluded_tools=…)` dans `ia/src/staport_ia/agent.py`, la
voie officielle de Deep Agents, qui remplace notre `FilesystemMiddleware(tools=["read_file"])`.

Les permissions de fichiers (`FilesystemPermission`, la première règle qui correspond l'emporte) bornent l'écriture :
sous `/espace/` (propre à l'identité de l'utilisateur, `StoreBackend` sur PostgreSQL), elle **attend l'accord de
l'utilisateur** par une interruption LangGraph (`mode="interrupt"`, `HumanInTheLoopMiddleware` construit par Deep Agents ;
reprise par `Command(resume={"decisions": [{"type": "approve"}]})` ou `"reject"`) ; ailleurs, elle est refusée sans
question. Tests dans `ia/tests/test_agent.py` : accord, refus, isolation entre utilisateurs, refus hors de l'espace,
liste exacte des outils exposés.

### Client MCP : `langchain.mcp` conservé, `langchain-mcp-adapters` écarté (KAN-256, 2026-11-15)

| | `langchain.mcp` (`langchain[mcp]`, bêta) | `langchain-mcp-adapters` 0.3.2 |
|---|---|---|
| Statut | page officielle « MCP » de la documentation LangChain (connexions, authentification, outils) | dernière version du 2026-08-06 ; absent de la documentation actuelle |
| Client | FastMCP (`fastmcp.Client`), `ClientGroup` pour plusieurs serveurs (outils préfixés `{serveur}_{outil}`) | SDK `mcp`, `MultiServerMCPClient` |
| Authentification | `Client(url, auth=jeton)` (jeton porteur, OAuth 2.1, `httpx.Auth`) | en-têtes à la main |
| Contenu structuré | `ToolMessage.artifact["structured_content"]` | artefact selon la version |
| Question du serveur en cours d'appel | interruption LangGraph native (`elicitation`), reprise par `Command(resume=…)` | non |
| Compatibilité avec nos versions | oui (`mcp` 2.3.0, `fastmcp` 4.1.6) | **non : exige `mcp<2.0.0`, nous avons `mcp` 2.3.0** |

Ce que chacun apporte, en clair :
- `langchain-mcp-adapters` : le premier pont publié entre MCP et LangChain. Il fournit `MultiServerMCPClient` (plusieurs
  serveurs dans un seul client), `load_mcp_tools` (outils depuis une session), des en-têtes à passer à la main
  (`headers`, transports HTTP et SSE seulement) et l'option `handle_tool_errors` pour les erreurs d'exécution MCP.
  Une session est ouverte par appel d'outil. Il s'appuie sur le SDK `mcp` 1.x.
- `langchain.mcp` : le même rôle, intégré à LangChain et construit sur FastMCP. Il ajoute ce que nous utilisons ou
  utiliserons : authentification déclarée (`auth=jeton`, OAuth 2.1, `httpx.Auth`), `ClientGroup` (une connexion et une
  authentification par serveur, outils préfixés), contenu structuré dans `ToolMessage.artifact` (déjà lu par le rendu
  des tableaux), outils réentrants, et surtout les questions du serveur en cours d'appel (élicitation) converties en
  interruption LangGraph, qui s'additionne à l'accord de l'utilisateur avant écriture (KAN-260).

Décision : **garder `langchain.mcp`**. `langchain-mcp-adapters` ne s'installe pas avec `mcp` 2.x et n'apporte aucune
capacité qui nous manque. Le risque de la bêta (API susceptible de changer) est couvert par les tests MCP et la
veille de versions. Pistes ouvertes, chacune dans son ticket : passer l'authentification par `Client(url, auth=jeton)`
au lieu de l'en-tête construit à la main, et vérifier le mode MCP `auto` maintenant que le serveur MCP est celui de
l'API FastAPI (`mode="legacy"` est un choix de transport du client FastMCP) ; l'interruption d'élicitation sert la validation
humaine (KAN-260, KAN-264).

### ag-ui-langgraph : état amont (KAN-257, 2026-11-15)

`ag-ui-langgraph` 0.0.47 est la dernière version publiée (2026-10-08), et la branche principale amont est aussi en
0.0.47. L'issue [ag-ui-protocol/ag-ui#3343](https://github.com/ag-ui-protocol/ag-ui/issues/3343) (compétences épinglées
envoyées au client comme messages utilisateur) est ouverte ; un contributeur a proposé le correctif, non fusionné.
Le contournement par `FunctionMiddleware` (`copilot-runtime/src/app.mjs`) est donc **maintenu** ; à retirer à la
sortie d'une version qui contient le correctif, à vérifier à chaque montée de version.

### Fiches de compétences dans le Store, sans accès disque (KAN-259, décision du propriétaire du 2026-11-15)

Option 2 retenue : le modèle n'a **aucun accès au disque**. Les fiches `SKILL.md` du paquet sont semées dans le Store
(espace de noms `("competences",)`, commun à tous) au démarrage du service (`semer_competences`, `app.py`) ; le
`CompositeBackend` les sert par un `StoreBackend`, et l'espace de chaque utilisateur (`/espace/`) par un autre,
propre à son identité. Le `FilesystemBackend` n'est plus utilisé par le service. L'écriture reste bornée par le profil
d'harnais et les permissions (accord sous `/espace/`, refus ailleurs, donc aussi sur les fiches). Les fiches ne
changent qu'avec une nouvelle version du service : le semis au démarrage les remplace. Test : lecture des fiches depuis
PostgreSQL, semis répétable (`ia/tests/test_memoire.py`).

### Fichiers de l'espace de l'utilisateur : écriture, téléchargement, bornes (KAN-267)

- **Écriture** : `write_file` et `edit_file` sous `/espace/` seulement, avec l'accord de l'utilisateur (interruption
  LangGraph, KAN-260) ; les fichiers sont dans le Store PostgreSQL, sous l'identité du jeton agent, et expirent par le
  balayeur natif du Store.
- **Reprise** : le service accepte un run de reprise (`RunAgentInput.resume` ou `forwardedProps.command.resume`) sans
  nouvelle question ; l'état du fil (compétences épinglées) est conservé. Test de bout en bout par `/agui`.
- **Téléchargement** : `GET /ia/fichiers` (liste) et `GET /ia/fichiers/espace/<chemin>` (nginx vers le routeur IA de
  l'API). L'identité vient de l'échange du jeton de connexion ; le fichier d'un autre utilisateur est introuvable (404) ;
  réponse en pièce jointe, `nosniff`, sans cache.
- **Bornes** (écrites par nous, aucun framework ne les fournit) : 200 000 caractères par fichier et 50 fichiers par
  utilisateur, par un middleware `wrap_tool_call` (`ia/src/staport_ia/fichiers.py`) ; le refus arrive à l'exécution,
  après l'accord, avec son motif. Remplacer un fichier existant reste permis quand l'espace est plein.
- **Audit** (KAN-268) : le même middleware signale chaque écriture réussie à l'API (`POST /interne/ia/ecritures-fichier`,
  jeton agent) qui journalise `ECRITURE_FICHIER_AGENT` (chemin, taille, outil ; jamais le contenu). Le signaleur est une
  `ContextVar` posée par le run (`agui.py`), donc jamais partagée entre utilisateurs ; une panne du signalement est
  consignée côté serveur sans interrompre le run.

### Question de l'agent à l'utilisateur : interruption native (KAN-264)

- **Avant** : `poser_question` était un outil déclaré par le navigateur (`registerHumanInTheLoop` de CopilotKit) ; la
  réponse revenait comme message d'outil, sans point de reprise durable.
- **Maintenant** : l'outil vit côté agent (`ia/src/staport_ia/question.py`) et appelle `interrupt()` de LangGraph, comme
  l'accord avant écriture. Le run s'arrête avec un point de reprise dans le checkpointer PostgreSQL, et la réponse
  revient par la reprise AG-UI. La valeur de l'interruption porte `type: "question"` ; l'interface (`injectInterrupt`)
  distingue ainsi la question de l'accord d'écriture.
- **Sécurité** : le service n'accepte plus un message d'outil comme dernier message d'un run ; seules la question de
  l'utilisateur et la reprise d'interruption (vérifiée par le fil propre à l'utilisateur) sont admises. La réponse est
  bornée à 500 caractères. Test de bout en bout par `/agui` (`ia/tests/test_agui.py`).

### Exports de l'ERP : référence signée, sans stockage (KAN-266)

- **Outil MCP** `paie_export_preparer` (`PAIE_EXPORT` + `PAIE_READ`) : vérifie qu'il y a des bulletins, puis rend les
  chantiers concernés et une **référence de téléchargement** : un JWT RS256 de 5 minutes (audience propre
  `staport-intelligence-export`), lié à l'utilisateur, au mois et aux identifiants de chantier. Aucun chiffre ne passe par
  le modèle.
- **Téléchargement** : `GET /paie/export/agent/{reference}` exige la connexion REST de l'utilisateur et `PAIE_EXPORT`,
  puis vérifie que la référence lui a été émise ; sinon 404 (expirée, altérée, autre utilisateur ou jeton d'un autre
  usage, sans dire laquelle). Le classeur est généré à ce moment, par le service d'export existant ; rien n'est stocké.
- **Interface** : `registerRenderToolCall` de CopilotKit dessine le résultat de l'outil comme un bouton « Télécharger » ;
  la référence n'apparaît pas dans la discussion (la fiche de compétence demande au modèle de ne pas la recopier).
- **Pas de `CompositeBackend` ici** : le classeur est binaire et généré à la demande ; l'espace de fichiers texte de
  l'utilisateur (`/espace/`, KAN-267) garde son routage `CompositeBackend` + Store.

### Exécution durable : base obligatoire, arrêt en douceur, durabilité (KAN-39)

Source : doc LangGraph « Fault tolerance » (retries, timeouts, error handling, graceful shutdown) et « Durability modes »
(`langgraph` 1.2.22, la dernière version stable).

- **Base de l'IA obligatoire** : sans `IA_DATABASE_URL`, le service IA activé refuse de démarrer (`RuntimeError` explicite),
  en local comme en production. Plus aucun repli sur `InMemorySaver` ni `InMemoryStore` dans le service : il masquait une
  panne de configuration et perdait conversations et fichiers au redémarrage. Les tests rapides reçoivent leur mémoire par
  injection (`creer_app(..., memoire=...)`, `ia/tests/doubles.py`) ; les tests de l'API et du lanceur ouvrent une base
  PostgreSQL vierge, comme `ia-db`. Le service désactivé (`IA_ENABLED=false`) n'ouvre aucune base.
- **Arrêt en douceur** (`RunControl`, doc « Graceful shutdown ») : à SIGTERM (`docker compose up -d` après un `pull`), chaque
  run en cours termine son étape, enregistre un point de reprise et s'arrête (`GraphDrained`) ; le navigateur reçoit
  `RUN_ERROR` avec le code `SERVICE_REDEMARRE` et un message qui invite à renvoyer le message ; la conversation reprend avec
  le même fil. Le gestionnaire SIGTERM est chaîné à celui d'uvicorn (`app.py`), pas substitué. Délais : `stop_grace_period:
  60s` (Compose) et `--timeout-graceful-shutdown 45` (uvicorn).
- **Durabilité `sync`** (doc « Durability modes ») : chaque point de reprise est écrit avant l'étape suivante, donc un run
  repris après un arrêt ou une panne repart de la dernière étape terminée. Coût : une écriture PostgreSQL par étape,
  négligeable devant un appel de modèle.
- **Écart au 0 % de code maison** : l'intégration `ag-ui-langgraph` 0.0.47 (dernière version) appelle `astream_events` sans
  `control` ni `durability`. `AgentAGUI` (`agui.py`) est une sous-classe de `LangGraphAGUIAgent` qui ajoute ces deux
  arguments au point d'extension `get_stream_kwargs` (une ligne). À retirer quand l'intégration les prendra en charge.
- **Délais, reprises et gestionnaire d'erreur par nœud : non applicables** (décision documentée). `retry_policy`,
  `TimeoutPolicy` et `error_handler` se règlent sur les nœuds ou par `set_node_defaults` d'un `StateGraph` que nous
  construisons ; le graphe de l'agent est construit par Deep Agents et `create_agent`, qui ne les exposent pas. Les mêmes
  protections existent au niveau du modèle et des outils, avec les composants officiels : `ModelFallbackMiddleware`
  (KAN-35), reprises bornées par appel d'outil (KAN-33), erreurs d'outil rendues au modèle sans détail (KAN-32), délai du modèle porté par
  LiteLLM.
- **Preuve** (PostgreSQL réel, `ia/tests/test_memoire.py`) : un run arrêté pendant l'étape des outils, un « redémarrage »
  (nouvelle connexion, nouvel agent), une reprise avec le même fil jusqu'à la réponse, sans rejouer l'étape terminée.
  Test de bout en bout par `/agui` dans `ia/tests/test_agui.py`.
