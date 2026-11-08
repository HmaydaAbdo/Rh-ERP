---
title: "Registre : décisions ouvertes, code maison, middlewares"
sidebar_position: 6
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions de Spring, de Java et des tâches T* décrivent l'état avant la bascule vers FastAPI : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
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
| T23 — Surfaces déterministes | `surfaces.py` : liste d'outil vers `DataTable`/`Chart`, enveloppe A2UI | Motif officiel à schéma fixe (`copilotkit.a2ui`) déjà utilisé ; évaluer MCP Apps (`@copilotkit/mcp-apps-renderer`, `@copilotkit/angular/mcp-apps`) pour que l'interface d'un outil vienne de son serveur MCP | ⬜ |
| T24 — Contexte ERP | `contexte.py` : date, droits, dernier mois de paie | Invite ou ressource MCP de Spring AI (`@McpPrompt`) lue par le client MCP, injectée par le décorateur officiel `dynamic_prompt` | ⬜ |
| T25 — Mémoire des conversations | `memoire.py` : préfixe de fil par utilisateur, purge des conversations inactives | Isolation par espaces de noms du `Store` LangGraph ; expiration par une tâche `pg_cron` (extension PostgreSQL gratuite) ou par le TTL du `Store` PostgreSQL | ⬜ |
| T26 — Échange de jeton | `outils.py` : `jeton_agent` appelle `/auth/jetons/agent` ; côté Java, émission par l'encodeur JWT | Échange de jetons OAuth2 (RFC 8693) de Spring Authorization Server et client OAuth2 Authlib | ⬜ |
| T27 — Enveloppe du service IA | `agui.py` : authentification, validation de la question, flux SSE, erreurs sans détail | `add_langgraph_fastapi_endpoint` avec dépendances FastAPI ; outils par requête via les crochets dynamiques de LangChain | ⬜ |
| T28 — Banc d'évaluation | `evaluation.py` : rejoueur et notation | `agentevals` et `openevals` sous pytest, sans LangSmith ; supprimer le rejoueur | ⬜ |
| T29 — Scripts de la passerelle | `filtrer_config.py`, `enregistrer_cles.py`, `test_providers.py` | `include` de fichiers de configuration LiteLLM par fournisseur ; contrôles de santé et sondes natifs ; clés virtuelles par l'API gérée en base | ⬜ |
| T30 — Composants d'interface | `DataTable`, `KpiGrid`, `Chart`, `QuestionUtilisateur`, `FilAssistant` | Tableau : AG Grid Community ou TanStack Table (licences libres) ; graphique : `ng2-charts` ; question : interruptions natives de CopilotKit | ⬜ |
| T32 — Sélection d'outils juste-à-temps | **Fait (2026-11-03)** : une compétence `SKILL.md` par domaine dans `ia/src/erp_rh_ia/competences/` (6 domaines, 7 outils au plus chacune, les 31 outils couverts une fois), `SkillsMiddleware(tools=résolveur)` sur le catalogue MCP de l'utilisateur, `routage.py` calculant `pinned_skills` hors modèle (embeddings MiniLM locaux), repli par lecture du `SKILL.md`, aucun plafond de domaines épinglés, évaluation `ia/evaluation/routage.json` (41 demandes, 39 couvertes, p50 5,9 ms) ; 22 définitions d'outils Spring complétées (cas de non-usage, limites) | Fonctions officielles de Deep Agents ≥ 0.7.23 ; seule pièce maison **déclarée** : la fonction de routage | Tests verts (66), ruff et pyright stricts verts ; **banc réel (2026-11-03, routage actif)** : 23/24, latence p50 8,25 s contre 9,09 s avant (sélecteur LLM), l'échec restant est un chemin valide différent du chemin attendu (`fonction_rechercher` au lieu de `employes_rechercher`) ; le p95 (68 s) vient des offres gratuites, pas du routage |
| T33 (KAN-203) — Migration du service IA vers Deep Agents | **Fait (2026-11-03)** : `create_deep_agent` dans `agent.py` (middlewares de contexte, surfaces, plafonds, reprise et `CopilotKitMiddleware` reportés dans `middleware`), harnais limité à `read_file` et `write_todos`, sous-agent généraliste désactivé par profil d'harnais, `LLMToolSelectorMiddleware` retiré, image Docker avec modèle d'embeddings préchargé. Le groupe de passerelle `tool-selection` est retiré (configuration, clés virtuelles, tests de fumée, README) | Point d'entrée officiel documenté de Deep Agents (`create_deep_agent(model, tools, middleware, backend, ...)`) | Test de contrat vert ; écriture refusée par `FilesystemPermission` (test : aucun outil métier dans `tools=`, `write_file` refusé même lié) ; espace de fichiers par identité (`backend_par_identite`, isolation testée) ; **reste** : magasin PostgreSQL avec l'épopée d'écriture |
| T31 — Contrôle d'accès du runtime | `serveur.mjs` : authentification par `/auth/me`, routes servies, fil réservé à son propriétaire (crochets officiels `onBeforeHandler`) | `identifyUser` est réservé à Intelligence ; chercher un équivalent gratuit ou un proxy d'authentification standard devant le runtime | ⬜ |

## Middlewares officiels de LangChain et LangGraph : tous adoptés, sans exception

Décision du propriétaire (2026-10-27) : **tous les middlewares officiels de LangChain** (1.4.7, liste de
`langchain.agents.middleware`) et les fonctions de LangGraph sont mis en œuvre, chacun avec un test ; ils prennent la
place de tout code maison équivalent. « Sans exception » veut dire qu'aucun n'est écarté sans décision écrite du
propriétaire : un middleware à risque (exécution de commandes) s'adopte avec ses garde-fous, pas autrement.

| Élément officiel | État | Tâche |
|---|---|---|
| `TodoListMiddleware` | ✅ en place | — |
| `ModelCallLimitMiddleware`, `ToolCallLimitMiddleware` | ✅ en place | — |
| `SummarizationMiddleware` | ✅ en place (40 000 jetons, résumé interne) | — |
| `LLMToolSelectorMiddleware` | ✅ adopté et testé ; **retiré du chemin systématique le 2026-11-03** (il ajoute un appel de modèle) : le routage de base est l'épinglage de compétences hors modèle (T32) ; réactivable en second étage après évaluation chiffrée | T32 |
| `CopilotKitMiddleware` (A2UI, outils du navigateur) | ✅ en place | — |
| `ContextEditingMiddleware` (`ClearToolUsesEdit`) | ⬜ | M1 |
| `ToolErrorMiddleware`, `ToolRetryMiddleware`, `ModelRetryMiddleware` | ⬜ | M1 |
| `PIIMiddleware` (`RedactionRule`, `PIIDetectionError`) | ⬜ | M2 |
| `ModelFallbackMiddleware`, `ProviderToolSearchMiddleware`, `LLMToolEmulator` | ⬜ | M3 |
| `HumanInTheLoopMiddleware` (`InterruptOnConfig`), interruptions LangGraph | ⬜ | M4 |
| `FilesystemFileSearchMiddleware` | ⬜ | M5 |
| `ShellToolMiddleware` (`DockerExecutionPolicy`) | ⬜, décision de sécurité | M6 |
| Crochets `before_agent`, `after_agent`, `before_model`, `after_model`, `wrap_model_call`, `wrap_tool_call`, `dynamic_prompt` | utilisés par les middlewares ci-dessus ; `dynamic_prompt` remplace `contexte.py` | T24 |
| LangGraph : checkpointer PostgreSQL | ✅ en place | — |
| LangGraph : `Store` (mémoire longue, espaces de noms, expiration) | ⬜ | T25, J4 |

Autres points non terminés, gardés ouverts :

| Point | État |
|---|---|
| T20 — Démonstration J1 sur la nouvelle base (images reconstruites, banc réel, flux réels) | ⬜ |
| Espace IA plein écran (J4) et mémoire longue par le `Store` LangGraph | ⬜ |
| Latence d'une réponse sous 30 s à tenir sur le jeu de référence | ⬜ |
| Évaluation de l'agent étendue (cas complexes, tri, questions à l'utilisateur) | ⬜ |
| Historique SQLite du runtime : pas d'expiration | ⬜ |
| Lint : frontend à 0 avertissement (règles en `error`), Checkstyle Java et ESLint du runtime Node, branchés dans la CI | ✅ |
| Écran d'accueil de l'assistant : CopilotKit le masque sur un fil fourni par l'application (fil repris) ; prévoir un accueil propre, avec les moyens officiels de la discussion | ⬜ |
| Reprise du fil dans l'interface : lenteur ponctuelle vue au banc (réponse arrivée côté serveur mais affichée au rechargement) | ✅ Cause isolée et corrigée le 2026-11-02 (E5.6) : flux de run coupé côté client, le serveur garde la réponse ; rattachement par `connectAgent` |
