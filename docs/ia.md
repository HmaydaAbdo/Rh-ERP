# IA dans ERP-RH — document unique

**Mis à jour : 2026-10-26.** Seule référence du chantier IA : décisions, architecture, plan, suivi
et reprise. Les règles réutilisables sont dans les conventions
([agents-ia](../conventions/agents-ia.md), [mcp](../conventions/mcp.md),
[agent-ui](../conventions/agent-ui.md), [rag](../conventions/rag.md),
[integrations](../conventions/integrations.md)) ; ce document fixe comment ERP-RH les applique.

## 1. Objectif

L'IA sert **tous les utilisateurs** de l'entreprise (BTP, classe S, Maroc) : comprendre, retrouver,
contrôler, préparer. Elle commence par la partie RH de l'ERP, puis couvre chaque département avec le
même socle. Elle ne devient jamais la source des chiffres, des droits ou des décisions métier, et ne
prend aucune décision sur une personne : elle explique et prépare, une personne habilitée décide
([usage responsable](../conventions/agents-ia.md#gouvernance-et-usage-responsable)).

## 2. Décisions

| Sujet | Décision |
|---|---|
| Méthode | Tranche verticale de bout en bout, puis durcissement. Une tâche à la fois, suivie au § 7. |
| Métier | Spring est propriétaire des données, transactions, règles, permissions et audits. Aucun framework LLM dans le monolithe. |
| Service IA | **Python** : LangGraph pour le graphe, Pydantic pour tous les contrats, `uv` (lockfile), `ruff`, `pyright` strict, `pytest`. Python est le langage unique de l'IA (graphe, ML, OCR, voix, évaluation). |
| Outils métier | **MCP** (Streamable HTTP) entre le service IA et Spring. Le service IA n'a ni accès aux tables ni client REST métier. |
| Interface ↔ agent | **AG-UI** entre Angular et le service IA, par le **runtime CopilotKit officiel** (service `copilot-runtime`, Node, `@copilotkit/runtime` 1.80) depuis T16 (décision du 2026-10-26) : il relaie l'agent AG-UI du service IA avec le jeton de l'utilisateur et lui applique le middleware A2UI officiel, que l'architecture de CopilotKit place côté serveur. Flux produit par l'**intégration LangGraph officielle** `ag-ui-langgraph` 0.0.47 ([ADR 0015](adr/0015-ag-ui-integration-langgraph-officielle.md)) ; le service n'y ajoute que l'identité et la session MCP. Télémétrie de CopilotKit coupée. |
| Modèles | **LiteLLM** : un alias unique `ai-gateway`, la tâche indiquée par tag (`simple`, `medium`, `complex`, `code`, `ocr`), bascule entre fournisseurs du même niveau, budgets par clé virtuelle. Un modèle est retenu sur le jeu de référence (§ 4). |
| Données exposées à l'IA | Les outils rendent les mêmes champs que les écrans, CIN, dates de naissance et montants compris (décision du 2026-10-25) ; seules les permissions RBAC filtrent, dont le salaire réservé à `PAIE_READ`. Les données réelles peuvent être envoyées aux modèles configurés, offres gratuites comprises : la règle « aucune donnée réelle vers un modèle » est retirée, risque accepté par le propriétaire (décision du 2026-10-26). Cible : **modèle local open source** servi derrière LiteLLM ; aucun outil, plugin ou service payant. Accord CNDP (loi 09-08) obtenu par le propriétaire. |
| Sécurité | Périmètres de données par **département et fiche de poste**, appliqués dans Spring pour REST et MCP ; jeton délégué court RS256 ; audit de chaque appel d'outil (§ 5). |
| Premier usage | **Questions/réponses + interface composée A2UI** : l'agent répond avec des chiffres Spring et, quand c'est plus lisible, compose dans la discussion une surface A2UI (tableau, liste, indicateurs). L'ouverture automatique des vues de l'ERP est retirée (décision du propriétaire du 2026-10-26 : A2UI suffit et supprime le code maison de pilotage des écrans). |
| Interface immersive | **Espace IA** plein écran en plus du panneau latéral : conversation, surfaces **A2UI** composées depuis le catalogue Staport, vues pilotées et mascotte. Aucune génération de code d'interface. |
| Mascotte | Personnage animé **Rive** (State Machines), aux couleurs Staport et à l'univers du chantier, piloté par les événements AG-UI ; design final validé sur maquette (§ 6). |
| Orchestration | **Un agent `create_agent`** (LangChain sur LangGraph) avec tous les outils, groupés par domaine dans leurs descriptions ; `LLMToolSelectorMiddleware` ne transmet que les outils utiles quand le catalogue ou les quotas l'exigent. **Deep Agents** (`create_deep_agent`, mêmes middlewares plus sous-agents par domaine) est adopté quand le jeu de référence montre qu'un domaine a besoin de ses propres instructions, outils ou budget, ou qu'une tâche est longue : contrôle de la paie (J5), assistant réglementaire (J7), documents RH (J6). Pas avant : chaque sous-agent ajoute des appels de modèle, donc de la latence et des quotas (les offres gratuites répondent déjà 429 parfois). Détail : [conventions](../conventions/agents-ia.md#du-ciblage-par-domaine-aux-agents-de-domaine). |
| Fournisseurs gratuits | Cumul des **offres gratuites à quota renouvelable**, un compte par fournisseur, quotas respectés (`rpm`/`tpm`) ; un modèle sans clé est désactivé au démarrage. Un modèle n'entre dans un pool qu'après une sonde outils + JSON réussie à travers la passerelle. NVIDIA NIM (offre de prototypage) est dans les pools ; les préversions à sortie instable restent sous tags `eval`. |
| Inter-applications | **A2A** relie l'agent ERP-RH aux agents des autres applications de l'entreprise (autres départements, application IA d'entreprise). À l'intérieur d'ERP-RH, pas d'A2A. |
| Frameworks d'abord | Décision du 2026-10-26 : tout le code IA s'appuie sur LangChain (`create_agent` et ses middlewares), LangGraph, Deep Agents si besoin, le MCP intégré à LangChain (`langchain.mcp`), `ag-ui-langgraph` et CopilotKit (raisonnement, texte, A2UI, interface Angular), LiteLLM pour la passerelle et ses garde-fous ; côté Java, le serveur MCP de **Spring AI** et l'échange de jetons OAuth2 de **Spring Authorization Server** ; tout code maison qui duplique un composant officiel est retiré ([règle et correspondances](../conventions/agents-ia.md#frameworks-dabord)). L'agent décide lui-même de sa forme de réponse : directe, raisonnée avec outils, ou planifiée et suivie étape par étape, comme Claude, ChatGPT, Gemini et Grok. Remplace, une fois T10 à T20 faites, le graphe explicite de T6 et le ciblage maison. |
| Cadre de référence | Les pratiques des cadres reconnus s'appliquent à tout le chantier (décision du 2026-10-26) : NIST AI RMF et son profil IA générative, ISO/IEC 42001, OWASP Top 10 LLM 2025 et menaces agentiques, conventions OpenTelemetry de l'IA générative, loi 09-08. Leur traduction en règles est dans les [conventions](../conventions/agents-ia.md#gouvernance-et-usage-responsable) ; l'écart avec l'existant est suivi au § 10. |
| Images et secrets | Chaque service a **sa propre image** (`erp-rh-<service>`) construite par la CI. Les clés vivent uniquement dans le `.env` racine unique (non versionné) ; les fichiers versionnés ne contiennent que des références `os.environ/…`. |

## 3. Architecture

```text
Angular (CopilotKit Angular : discussion, raisonnement, surfaces A2UI)
   │  /ia/copilotkit (nginx)
   ▼
erp-rh-copilot-runtime (Node, runtime CopilotKit + middleware A2UI)
   │  AG-UI : entrées HTTP, événements SSE, jeton de l'utilisateur
   ▼
erp-rh-ia (Python, create_agent LangChain sur LangGraph)
   │  outils → réponse (+ generate_a2ui) → vérification des chiffres de la réponse et de la surface
   ├── erp-rh-litellm → fournisseurs (alias ai-gateway, tags de tâche)
   ├── A2A (plus tard) → agents des autres applications
   ▼  MCP + jeton délégué
erp-rh-backend (Spring) : adaptateurs MCP → façades de domaine → périmètre fiche de poste → audit
   ▼
PostgreSQL ERP (métier) · base LiteLLM dédiée (clés virtuelles, budgets) · plus tard corpus/pgvector
```

Les services IA démarrent par défaut avec `docker compose up -d`, sans profil (depuis le 2026-10-26) ; la tâche
ponctuelle `litellm-cles` enregistre les clés virtuelles. La pile ERP n'en dépend pas : `IA_ENABLED=false` ou
`MCP_ENABLED=false` coupe l'assistant. Les checkpoints durables LangGraph arrivent avec les écritures (J6).

## 4. Exactitude

1. Le modèle ne calcule pas : effectifs, montants, taux et périodes viennent des outils Spring.
2. Un vérificateur déterministe contrôle que chaque nombre et chaque période de la réponse figure
   dans les résultats d'outils du run ; sinon une seule régénération, puis abstention explicite.
3. Sans outil ni source adaptés, l'agent s'abstient et propose l'écran classique.
4. Un jeu de référence versionné (`ia/evaluation/jeu_reference.json`, 24 cas au départ, à porter vers
   ≈ 100 ; réponses calculées en appelant l'outil attendu sur la base synthétique) est rejoué à chaque
   changement de modèle, prompt, outil ou graphe par `EvaluationAgentIaTest`. Il décide des
   modèles de chaque tag LiteLLM : exactitude, latence p95, coût.
5. Sorties structurées validées par Pydantic côté service et par schéma côté Angular ;
   `enable_json_schema_validation` côté LiteLLM.
6. À venir (T2.7) : le vérificateur couvre aussi les identifiants, noms et dates cités, et chaque
   chiffre principal affiche sa période, son périmètre et la définition de l'indicateur. Aujourd'hui,
   seuls les nombres et les périodes sont vérifiés.

## 5. Sécurité

- **Périmètres.** Département → fiche de poste → rôles et permissions + périmètre de données
  (chantiers, équipes, département, ou « tous »). Appliqué dans les requêtes Spring, même règle pour
  REST et MCP. Le salaire devient une politique de projection du domaine (`EMPLOYEE_READ` sans
  `PAIE_READ` : ni salaire, ni tri, ni agrégat salarial). Le modèle exact est présenté et validé au
  lancement de J2.
- **Identité de l'agent.** Spring émet pour l'utilisateur connecté un jeton court RS256 (clé
  publique JWKS), audience `mcp`, scopes réduits ; le `JWT_SECRET` n'est jamais partagé. Chaque appel
  MCP revalide émetteur, audience, expiration, permissions et périmètre.
- **Champs rendus.** Les mêmes que les écrans pour un utilisateur donné (CIN, dates et montants compris) ; seules
  les permissions filtrent, quel que soit le fournisseur (cible : modèle local).
- **LiteLLM.** Une clé virtuelle par application, jamais la clé master ; la clé d'ERP-RH porte
  `metadata.tags: ["!eval"]` (aucun modèle d'évaluation), une limite de débit et un budget. Port lié
  à `127.0.0.1` ou au seul réseau Docker interne. Cache de réponses désactivé.
- **Audit et exploitation.** Acteur humain, service délégué et corrélation
  `requestId/threadId/runId/toolCallId` pour chaque outil, sans jeton ni contenu RH dans les
  journaux. Interrupteur global de l'IA ; budgets par utilisateur et par poste ; plafonds d'étapes,
  de tokens et de durée par run. L'application reste entièrement utilisable sans IA.
- **Menaces.** Le [modèle de menaces](../conventions/agents-ia.md#modèle-de-menaces) s'applique
  menace par menace ; l'état de chaque contrôle est suivi au § 10.

## 6. Expérience

**Interface composée (A2UI, T16).** Pour une réponse chiffrée plus lisible en tableau, en liste ou en indicateurs,
l'agent appelle `generate_a2ui` (injecté par `CopilotKitMiddleware` quand le runtime active A2UI) ; le middleware A2UI
du runtime transforme son flux en surface, rendue par CopilotKit Angular avec le catalogue de base officiel aux
couleurs Staport. Le vérificateur contrôle les chiffres de la dernière surface comme ceux du texte ; la surface n'est
jamais une source. Limite connue : la surface se peint pendant le flux, avant la vérification finale ; sur une
abstention, la réponse dit de ne pas se fier aux chiffres affichés.
**Vues pilotées retirées** (décision du propriétaire du 2026-10-26) : l'assistant n'ouvre plus les écrans de l'ERP.
Les outils Spring décrivent toujours la vue correspondante (`VueProposeeDto`), réutilisable si un lien est un jour
proposé.

**Assistant RH (T8).** Barre de commande translucide au repos (`Ctrl K`), discussion ancrée à droite
dès la première question, comme un chat d'assistant : pour chaque réponse, un bloc repliable
d'étapes et d'outils (déplié pendant le travail), la réponse vérifiée avec son chiffre principal,
puis la vue ouverte et ses filtres. Plein écran sur téléphone, thème clair et sombre, mouvement
réduit respecté. Prototype de référence : [maquette-assistant.html](ia/maquette-assistant.html).

**Espace IA immersif.** Plein écran, ouvert depuis le panneau : la conversation à gauche, à droite
une scène composée par l'agent en **A2UI** — indicateurs, graphiques, tableaux, fiches et sources,
tous rendus par des composants Staport du catalogue versionné — avec transitions animées et retour
à la vue classique en un clic. Clavier, lecteur d'écran, mobile et `prefers-reduced-motion` sont
pris en charge ; chaque surface a un repli texte.

**Mascotte.** Un personnage Rive vivant, présent dans le panneau et dans l'Espace IA :

- il **écoute** pendant la saisie, **réfléchit** pendant le raisonnement, **cherche** pendant un
  appel d'outil, **trouve** à l'arrivée du résultat, **demande** lors d'une confirmation et
  **s'excuse** sur un refus ou une erreur ;
- il **désigne** le composant dont parle la réponse (cible `surfaceId/componentId`), suit le
  pointeur du regard et a des animations de repos ;
- il est piloté par l'événement AG-UI `com.staport.mascot.state.v1` décrit dans
  [agent-ui](../conventions/agent-ui.md), jamais directement par le modèle ;
- avec la voix (J9), il parle avec synchronisation labiale et sous-titres ;
- l'utilisateur peut le masquer ; une image fixe remplace l'animation si Rive est indisponible ou
  si le mouvement réduit est demandé.

## 7. Plan et suivi

États : ⬜ à faire · 🟦 en cours · ✅ fait · ⛔ bloqué.

### Jalons

| Jalon | Contenu | Sortie | État |
|---|---|---|---|
| J0 — Socle | Preuve MCP Java ↔ client TypeScript ; décisions ; ce document | Fait | ✅ |
| J1 — Tranche verticale | Tâches T1 à T9 ci-dessous, données synthétiques | Démonstration de bout en bout ; exactitude mesurée ; refus serveur testés | 🟦 |
| J2 — Sécurité par fiche de poste | Périmètres Spring REST + MCP, projection salaire, catalogue filtré, budgets et quotas, jeu adversarial, vérificateur étendu (tâches ci-dessous) | Tests négatifs et adversariaux verts ; porte avant tout utilisateur non administrateur | ⬜ |
| J3 — Pilote réel | Modèle local open source (les offres gratuites restent possibles en attendant) ; conversations multi-tours ; observabilité et objectifs de service ; conformité et transparence ; retours 👍/👎 revus avant le jeu de référence ; RH/paie puis direction (tâches ci-dessous) | Porte de mise en service franchie ; seuils validés et atteints sur le pilote | ⬜ |
| J4 — Expérience immersive | Espace IA, catalogue A2UI Staport, mascotte Rive complète | Parcours réel vérifié au navigateur, accessibilité et mouvement réduit | ⬜ |
| J5 — Contrôle de la paie | Règles d'anomalies dans l'assistant d'import, puis détection statistique ; l'agent explique, l'humain décide | Anomalies connues retrouvées sur imports historiques | ⬜ |
| J6 — Documents RH | Attestations, certificats, contrats de chantier ; première écriture (diff, approbation, idempotence, checkpoints durables) | Pas de double effet après crash ; approbation expirée refusée | ⬜ |
| J7 — Assistant réglementaire | Corpus versionné (Code du travail, CNSS/AMO, barème IR par loi de finances, procédures) ; plein texte puis hybride pgvector | Citations vérifiées, abstention hors corpus | ⬜ |
| J8 — Autres départements et A2A | Catalogue MCP, périmètres et jeu de référence par module ; A2A entre applications | Mêmes portes que J1–J3 par module | ⬜ |
| J9 — Terrain et voix | Mobile chef de chantier, voix FR/darija, mascotte parlante ; avec le domaine Pointage | Parcours mobile vérifié, transcription corrigible | ⬜ |

### Vision courte et vision longue

Proposition du 2026-10-26, à amender par le propriétaire. La vision courte mène à la démonstration J1 ; la vision longue
suit les jalons J2 à J9 ci-dessus et ne change aucune décision du § 2.

**Vision courte (avant la démonstration J1)**

| Ordre | Sujet | Pourquoi | Mesure de réussite |
|---|---|---|---|
| 1 | **Latence des réponses** : une réponse avec surface A2UI est passée de 6 min à 76 s (4 appels de modèle) en retirant le schéma A2UI de chaque appel et en limitant le raisonnement. Reste à tenir sous 30 s | Les offres gratuites répondent de 0,5 à 55 s par appel et l'agent en enchaîne 4 à 10 | p50 et p95 par type de question dans le jeu de référence (§ 4.4) ; routage par latence de LiteLLM validé avec `test_providers.py` avant adoption |
| 2 | **T18 Observabilité** | Impossible d'optimiser la latence sans voir le temps de chaque appel de modèle et d'outil | Une question se suit du clic à la base, appels de modèle et d'outils chronométrés |
| 3 | **T17 Passerelle native** | Garde-fous (injection de prompt, masquage), budgets et limites par utilisateur | Tests négatifs verts, budget par utilisateur appliqué |
| 4 | **T19 Conversations durables** | Reprise de fil et mémoire ; les surfaces A2UI et les réponses survivent à un rechargement | Fil repris après redémarrage du service |
| 5 | **Surface A2UI vérifiée avant affichage** | Aujourd'hui la surface se peint pendant le flux, avant la vérification des chiffres | La surface n'apparaît qu'une fois `verification = verifiee` ; abstention sans surface |
| 6 | **Pool de modèles** | LLM7 (`gpt-oss:20b`, `codestral-latest`) et Cohere (essai, en évaluation) ajoutés le 2026-10-26 ; SambaNova n'est plus gratuit. Aucun modèle local possible avec le matériel disponible | Un modèle rapide et fiable en outils pour le tag `complex`, validé par le jeu de référence |
| 7 | **Clôture des modules Équipe, Fonction, Chantier** | README et skills détaillés par couche ; points à valider listés dans chaque README | Réponses du propriétaire consignées, points classés |
| 8 | **T20 Démonstration J1** | Images reconstruites, banc réel, flux réels | Démonstration présentée |

**Vision longue**

| Horizon | Sujet | Détail |
|---|---|---|
| J2 | **Périmètres par fiche de poste** | Aujourd'hui toute permission donne accès à toutes les données du domaine ; le périmètre (chantiers, équipes, département) est appliqué dans Spring pour REST et MCP |
| J3 | **Pilote réel et modèle hébergé ou local** | Matériel limité : modèles ouverts servis par un fournisseur hébergé ; un abonnement payant minimal sera à arbitrer si les offres gratuites ne tiennent pas la charge ; accord CNDP déjà obtenu |
| J4 | **Espace IA immersif** | Plein écran, surfaces A2UI avec composants métier Staport (`createAngularCatalog`) : indicateurs, graphiques, tableaux ; mascotte Rive seulement si le propriétaire la confirme (la mascotte maison est retirée) |
| J5 à J7 | **Agents de domaine** | Passage à Deep Agents (`create_deep_agent`) quand le jeu de référence le justifie : contrôle de la paie, documents RH, assistant réglementaire. **Skills pour l'agent**, distincts des skills de développement : `ia/skills/<domaine>/SKILL.md` courts, dans la voix de l'agent, reprenant les définitions des README (une seule source) et chargés à la demande |
| J6 | **Premières écritures** | Diff, approbation humaine, idempotence, checkpoints durables ; jamais d'écriture sans confirmation |
| J7 | **Assistant réglementaire** | Corpus versionné (Code du travail, CNSS/AMO, barème IR), plein texte puis hybride pgvector, citations vérifiées |
| J8 | **Autres départements et A2A** | Mêmes portes que J1 à J3 par module ; SSO par Spring Authorization Server comme fournisseur d'identité si l'entreprise l'exige |
| J9 | **Terrain et voix** | Mobile chef de chantier, voix FR et darija |
| Transverse | **Qualité de la documentation** | Contrôle doc ↔ code en CI (`scripts/check-docs-domaines.mjs`) : chaque permission et chaque outil MCP figure dans la documentation de son domaine |

### Tâches de J1

| Tâche | Contenu | Critère de sortie | État |
|---|---|---|---|
| T1 — LiteLLM | Dossier `litellm/` versionné sans secret : image `erp-rh-litellm` (version et digest épinglés, configuration intégrée), base dédiée, service Compose sous le profil `ia`, variables dans le `.env` racine | Image construite ; passerelle prête sur une pile jetable ; pools lus par `test_providers.py --list` | ✅ |
| T2 — Service IA | `ia/` : projet Python (`uv`, Pydantic Settings, `ruff`, `pyright`, `pytest`), santé HTTP, client LiteLLM, image `erp-rh-ia` non privilégiée | Lint, typage et tests verts ; image construite ; `/health` répond | ✅ |
| T3 — MCP Python | Le client MCP Python officiel rejoue les scénarios de la preuve J0 contre le serveur Java | Mêmes scénarios verts que le client TypeScript | ✅ |
| T4 — Identité MCP | Jeton délégué RS256 + JWKS dans Spring ; route MCP réelle protégée | Mauvaise audience, émetteur, signature ou expiration refusés | ✅ |
| T5 — Outils de lecture | Indicateurs de paie, recherche/comptage d'employés, entrées et sorties, fiche chantier ; ViewSpec ; projection salaire | Tests de contrat, refus et masquage | ✅ |
| T6 — Graphe et exactitude | Graphe LangGraph, vérificateur de chiffres, jeu de référence synthétique | Exactitude mesurée et rapportée | ✅ |
| T7 — AG-UI | Point d'entrée AG-UI du service ; événements d'outils et de mascotte ; la confirmation (interruption AG-UI 1.0 et reprise) arrive avec la première écriture et ses checkpoints (J6) | Flux réel testé avec un client AG-UI | ✅ |
| T8 — Assistant Angular | Intégration AG-UI LangGraph officielle côté service ; assistant immersif en streaming (barre de commande, discussion, étapes repliables), ouverture automatique de la vue filtrée, valeurs citées surlignées | Parcours vérifié au navigateur | ✅ |
| T9 — Démonstration J1 | Navigateur → agent → MCP → Spring sur base synthétique ; vérification complète et PR vers `main` | Démonstration présentée au propriétaire | 🟦 |
| T10 — Agent par les frameworks | `create_agent` et middlewares officiels (plan `TodoListMiddleware`, plafonds, `CopilotKitMiddleware`), modèles `ChatLiteLLM` sur la passerelle (seul connecteur qui transmet le raisonnement), outils par le MCP intégré à LangChain (`langchain.mcp`, FastMCP ; l'ancien `langchain-mcp-adapters` n'est plus maintenu). Graphe, tri, ciblage et clients maison retirés ; vérificateur en middleware `after_model` | Tests unitaires verts ; jeu de référence au moins au niveau actuel (22/24 réel, les 2 échecs sont des quotas 429) ; « bonjour » en un appel | ✅ |
| T11 — Flux officiel | `LangGraphAGUIAgent` (CopilotKit, sur `ag-ui-langgraph`) : raisonnement `REASONING_*`, texte en flux, outils du navigateur, état partagé `verification` ; mascotte maison retirée | Flux réel testé avec le client officiel | ✅ |
| T12 — Évaluation officielle | `openevals` et `agentevals` sur le jeu de référence ; réponses de modèle enregistrées et outils simulés par CopilotKit `aimock` pour une évaluation hors ligne en CI, sans quota | Mêmes cas qu'avant, rapport identique ; la CI détecte une régression sans réseau | ✅ |
| T13 — Serveur MCP Spring AI | Serveur MCP de Spring AI 2.0.2 (stable, même SDK MCP 2.1.0 ; Spring Boot 4.1.2) : 25 outils déclarés par `@McpTool`/`@McpToolParam`, schémas générés, **descriptions enrichies** (quand l'utiliser, outil voisin à préférer, sens de chaque argument, définitions des chiffres) ; permission par `@PreAuthorize`, bornes par Bean Validation, trace par `@AuditableAction` (un seul `PerimetreAudit`) ; retirés : `OutilDefini`, `OutilLecture`, `Arguments`, `AuditOutilsAgent`, transport et serveur écrits à la main | `McpOutilsLectureIntegrationTest` 17/17 et `McpSecuriteIntegrationTest` 21/21 ; suite backend 522 tests verts ; flux réel vert | ✅ |
| T14 — Émission du jeton agent | Le jeton agent est émis par l'encodeur JWT de Spring Security (`NimbusJwtEncoder`, `JwtClaimsSet`) à la place de la signature Nimbus écrite à la main. **Spring Authorization Server écarté pour l'instant** : son échange de jetons (RFC 8693) ne sait valider qu'un jeton qu'il a lui-même émis, alors que le jeton de connexion d'ERP-RH est émis par `JwtService` ; l'adopter suppose de faire du serveur d'autorisation le fournisseur d'identité de tout l'ERP (connexion, rafraîchissement, réinitialisation), ce qui relève de l'authentification unique (J8) | Mêmes refus prouvés (audience, émetteur, expiration, droit retiré) : `McpSecuriteIntegrationTest` 21/21 | ✅ |
| T15 — Interface CopilotKit | CopilotKit Angular (`provideCopilotKit` relié à `/ia/agui`) aux couleurs Staport : discussion, raisonnement à la place des étapes, plan, texte en flux, « vérification en cours » ; `registerFrontendTool` pour proposer une vue ; `registerRenderToolCall` pour afficher les résultats des outils Spring en cartes Staport (chiffres lus dans les données, jamais écrits par le modèle) ; interface maison retirée | Parcours vérifié au navigateur, accessibilité, budgets de build | ✅ (2026-10-26) |
| T16 — Interface composée A2UI | Outil `generate_a2ui` injecté par `CopilotKitMiddleware`, rendu A2UI de CopilotKit au thème Staport, chiffres de la surface contrôlés par le vérificateur | Une réponse chiffrée affichée en surface A2UI au navigateur | ✅ (2026-10-26) |
| T17 — Passerelle native | Garde-fous natifs de LiteLLM (détection d'injection de prompt, masquage d'identifiants par Presidio), budgets et limites par utilisateur et par équipe (suivi `user` de LiteLLM), et pour chaque script maison (`filtrer_config.py`, `enregistrer_cles.py`, `test_providers.py`) la fonction native qui le remplace ou la raison de le garder | Injection et dépassement de budget refusés par la passerelle ; décision par script consignée | ✅ (voir journal : injection refusée, limites de la clé, décisions par script) |
| T18 — Observabilité | OpenTelemetry de bout en bout (navigateur, service IA, Spring par Micrometer, base) et Langfuse auto-hébergé (traces LangChain, coûts, retours, versions de prompts) | Une question se suit du clic à la requête SQL, sans donnée personnelle en clair | ✅ (Phoenix à la place de Langfuse, voir journal) |
| T19 — Conversations durables | Checkpointer LangGraph PostgreSQL (base IA dédiée) pour les fils de discussion, reprise de fil par CopilotKit, mémoire longue par le `Store` LangGraph, compactage par `SummarizationMiddleware` | Questions de suivi justes ; isolation entre utilisateurs et suppression testées | ✅ côté service ; reprise de fil dans l'interface : suite |
| T20 — Image et banc réels | Images `erp-rh-ia` et frontend reconstruites ; banc `BancAssistantTest` et flux réel avec les vrais modèles ; démonstration | Démonstration J1 présentée sur la nouvelle base | ⬜ |

### Tâches de J2

Le découpage est proposé ; il est confirmé avec le modèle de périmètres (T2.1).

| Tâche | Contenu | Critère de sortie | État |
|---|---|---|---|
| T2.1 — Modèle de périmètres | Étude de l'existant (fiches de poste, rôles, permissions, filtres des écrans), puis modèle département → fiche de poste → périmètre présenté au propriétaire | Modèle validé par le propriétaire | ⬜ |
| T2.2 — Périmètres appliqués | Filtre de périmètre dans les requêtes des domaines, même règle pour REST et MCP | Tests négatifs par domaine : aucune donnée hors périmètre, ni en liste, ni en agrégat, ni en fiche | ⬜ |
| T2.3 — Projection du salaire | Politique de domaine partagée : sans `PAIE_READ`, ni salaire, ni tri, ni agrégat salarial | Tests REST et MCP identiques | ⬜ |
| T2.4 — Catalogue filtré | Seuls les outils permis par les droits sont proposés au modèle (confort, pas sécurité) | Le serveur refuse toujours un outil interdit appelé directement | ⬜ |
| T2.5 — Budgets et quotas | Quotas par utilisateur et par jour ; budget par poste ; plafonds par run complétés par les tokens totaux et la durée totale | Dépassement refusé avec un message clair ; tests | ⬜ |
| T2.6 — Jeu adversarial | Injections directes et indirectes (champs de données piégés), contournement de périmètre, exfiltration par lien ou image, demandes interdites ; résultats d'outils délimités comme données dans les prompts | Chaque cas a une issue déterministe attendue, rejouée à chaque changement | ⬜ |
| T2.7 — Vérificateur étendu | Identifiants, noms et dates cités vérifiés comme les chiffres ; période, périmètre et définition affichés | Cas d'invention d'identifiant refusés ; jeu de référence vert | ⬜ |
| T2.8 — Conservation dans la passerelle | Contenu des messages non conservé par LiteLLM, réglé explicitement ; durée des journaux de dépense confirmée | Configuration vérifiée | ⬜ |
| T2.9 — Contrat de vue généré | ViewSpec : schéma JSON généré depuis Pydantic, types Angular et contrôle Spring dérivés du même schéma | Une divergence fait échouer la CI | ⬜ |

### Tâches de J3

| Tâche | Contenu | Critère de sortie | État |
|---|---|---|---|
| T3.1 — Modèle local | Comparaison de modèles open source (familles, tailles, quantifications) sur le jeu de référence ; licence et provenance ; serveur d'inférence sans accès sortant derrière LiteLLM ; dimensionnement du matériel | Seuils atteints ; achat ou location décidés par le propriétaire | ⬜ |
| T3.2 — Conversations multi-tours | Historique côté serveur lié à l'utilisateur, identifiant créé par le serveur, fenêtre bornée, rétention et suppression ; questions de suivi et demandes de précision ; liste et suppression des conversations dans l'interface | Cas multi-tours du jeu de référence verts ; isolation et suppression testées | ⬜ |
| T3.3 — Contexte d'écran | La vue courante (module, filtres) accompagne la question comme indice non fiable, revérifié par Spring | « Ce chantier » résolu ; identifiant hors périmètre refusé | ⬜ |
| T3.4 — Observabilité | Traces OpenTelemetry (`gen_ai.*`) du navigateur aux outils, outil open source auto-hébergé, contenu masqué, tableaux et alertes ; versions de prompt, graphe, catalogue et modèle dans chaque trace | Une question se suit de bout en bout ; aucune donnée personnelle en clair | ⬜ |
| T3.5 — Objectifs de service | Mesures sur le banc puis proposition d'objectifs (disponibilité, réponses vérifiées, abstention, latence du premier signe et de la réponse, coût par question) ; tests de charge avec modèle simulé et de panne | Objectifs validés par le propriétaire et tenus sur le banc | ⬜ |
| T3.6 — Conformité | Fiche du système, inscription au registre des cas d'usage, analyse d'impact et formalités CNDP (dont transferts), durées de conservation de chaque stockage, notice aux utilisateurs | Références consignées au § 2 ; notice visible dans l'assistant | ⬜ |
| T3.7 — Exploitation | Procédure d'incident IA, coupure par outil, procédure de changement de modèle (jeu de référence, comparaison, retour arrière), prompts versionnés | Procédure rejouée à blanc | ⬜ |
| T3.8 — Retours et évaluation continue | Retours utile / faux / incomplet avec motif ; revue humaine avant entrée dans le jeu ; évaluation hors ligne en CI avec réponses enregistrées ; relecture périodique d'un échantillon masqué | Le jeu grandit sans écriture directe des utilisateurs ; la CI détecte une régression du graphe sans appel réseau | ⬜ |
| T3.9 — Langues | Cas en arabe et en darija écrits dans le jeu de référence ; réponse dans la langue de la question | Seuils atteints par langue retenue | ⬜ |
| T3.10 — Pilote | Groupe pilote RH/paie formé, puis direction ; accès par `IA_UTILISER` | Retours du pilote revus ; décision de généralisation | ⬜ |

**Porte de mise en service** (avant le pilote) : J2 terminé ; formalités CNDP consignées ; observabilité et alertes actives ; objectifs de service validés ; procédure d'incident prête ; notice
aux utilisateurs visible.

### Décisions à prendre

| Sujet | Options | Recommandation |
|---|---|---|
| Stockage des conversations (T3.2) | Checkpointer LangGraph PostgreSQL dans une base IA dédiée ; ou table dédiée de conversations | Checkpointer PostgreSQL dans une base IA dédiée, tables créées par migration contrôlée : il sert aussi aux reprises de J6 |
| Durées de conservation (T3.6) | Conversations, traces, journaux LiteLLM (30 jours aujourd'hui) | Proposées après la mesure du pilote, avec l'analyse d'impact |
| Outil d'observabilité (T3.4) | Langfuse (riche, mais plusieurs conteneurs : PostgreSQL, ClickHouse, Redis, stockage objet) ; Arize Phoenix (un conteneur et PostgreSQL) | Instrumenter en OpenTelemetry d'abord, puis choisir sur l'empreinte mesurée sur le serveur |
| Modèle local (T3.1) | Matériel acheté, loué ou mutualisé | Décision du propriétaire sur le dimensionnement mesuré |
| Pseudonymisation (T3.1) | Remplacer CIN et noms par des jetons avant un modèle externe, les rétablir dans la réponse | Oui tant qu'un modèle hors de l'entreprise reçoit des données réelles ; inutile avec le seul modèle local |
| Vérificateur de chiffres (T10) | **Décidé le 2026-10-26** : gardé, en middleware officiel (`after_model`), qui fait réécrire puis abstenir | — |
| Texte en flux et vérification (T11) | **Décidé le 2026-10-26** : texte diffusé au fil de l'eau avec « vérification en cours », remplacé si la vérification échoue | — |
| Raisonnement affiché (T11) | **Décidé le 2026-10-26** : raisonnement brut du modèle, dans un bloc « Réflexion » replié | — |
| Dépendances du client (T12, T13) | **Décidé le 2026-10-26** : dernières versions des frameworks adoptées même préliminaires (CopilotKit Angular, A2UI) ; `zod` forcé en version 4 contre la faille GHSA-mrhx-c7xc-m3w5, compatibilité vérifiée | — |
| Langues (T3.9) | Français seul ; français, arabe et darija écrits | Mesurer la demande au pilote ; arabe écrit en priorité si les utilisateurs l'emploient |

### Journal

| Date | Fait |
|---|---|
| 2026-10-24 | Décisions du § 2 ; documents IA fusionnés dans ce fichier ; plan de J1 établi. |
| 2026-10-25 | **T1** : image `erp-rh-litellm` construite ; sur une pile Compose jetable, passerelle prête, appel sans clé refusé (401), image refusant de démarrer sans clé master, clé ERP-RH `!eval` refusant le pool d'évaluation et l'alias de test sans appel fournisseur ; clés regroupées dans le `.env` racine. **T2** : 8 tests, `ruff` et `pyright` strict verts ; image `erp-rh-ia` (utilisateur 10001, lecture seule) saine, `/health/ready` voit la passerelle. **T3** : `McpCompatibilityTest` vert, 10/10 scénarios pour le client TypeScript et pour le client Python (`mcp` 2.3.0, révision 2025-11-25). CI préparée (job `ia`, images publiées), non exécutée. |
| 2026-10-25 | **T4** (design validé par le propriétaire : sans état, `IA_UTILISER`, clé dans le `.env`, 5 minutes) : jeton agent RS256, JWKS, chaîne `/mcp` dédiée, migration V36. `McpSecuriteIntegrationTest` 21/21 (émission, JWKS, appel accepté, refus individuel appliqué au prochain appel, ancienne clé acceptée ; refus sans jeton, jeton REST, autre clé, audience, émetteur, expiration, `alg: none`, scope, `Origin`, compte désactivé, droit retiré, `uid` incohérent ; jeton agent refusé par REST). Client MCP Python sur la vraie route : 2/2. Suite backend complète : 457 tests verts (1 ignoré) ; couverture `mcp` 97,9 % lignes / 50 % branches. Clé RSA 3072 bits ajoutée au `.env` racine, MCP désactivé. |
| 2026-10-25 | `.env` locaux complétés (racine : `CARTE_FOND_DIR`, valeurs des clés virtuelles LiteLLM ; backend : `DB_MIGRATION_*`, `CORS_ALLOWED_ORIGINS`) ; `litellm/enregistrer_cles.py` enregistre ces clés dans la passerelle (prouvé sur pile jetable, idempotent, clé ERP-RH refusant le pool d'évaluation). **T5** : 5 outils de lecture (§ 8), `ViewSpec`, règle de projection du salaire `ProjectionPaieEmployee` partagée par REST et MCP, journal `LECTURE_METIER` canal `MCP`. `McpOutilsLectureIntegrationTest` 9/9 (chiffres identiques aux façades, refus et journal par outil, salaire masqué sans `PAIE_READ`, ni CIN ni date de naissance, argument hors schéma refusé). Suite backend 466 tests verts (1 ignoré), client Python 2/2 ; couverture `mcp` 93,1 % lignes / 55,9 % branches. |
| 2026-10-25 | Décision : champs rendus identiques aux écrans (CIN, dates, montants), modèle local open source visé, tests sur données fictives. Catalogue étendu à **25 outils** sur tous les domaines (§ 8) ; `IPaieEffectifsService` et `IPaieParcoursService` publiés comme façades. `McpOutilsLectureIntegrationTest` 15/15 (chaque outil refusé sans sa permission et journalisé, chaque outil répond avec les droits, chiffres comparés aux façades, introuvable signalé). Suite backend 472 tests verts (1 ignoré), client Python 2/2 ; couverture `mcp` 95,6 % lignes / 59,1 % branches. |
| 2026-10-25 | Branche mise à jour de `main` (PR #89 : référentiels et responsive). Seul impact : la recherche libre de chantier couvre aussi le nom, reporté dans `chantier_rechercher`. Mois de test des outils MCP déplacés après 2300 pour ne plus croiser les mois fixes des autres tests. Suite backend 472 tests verts, client Python 2/2. |
| 2026-10-25 | **T6** : graphe LangGraph `preparer → cibler → choisir ⇄ executer → rediger → verifier`, vérificateur de chiffres, jeu de référence de 24 cas (20 réponses, 3 abstentions, 1 refus) et `EvaluationAgentIaTest`. Service IA : 36 tests, `pyright` et `ruff` verts. Mesure réelle par LiteLLM, pool `complex` = Gemini 3.8 Flash + Cloudflare gpt-oss-120b : **16/24 (67 %)**, p50 6,8 s, p95 12,7 s (abstentions 2/3, refus 1/1, réponses 13/20). Le juge corrigé ensuite (« aucune » = 0, statut `EN_COURS`, valeurs justes par un autre outil) valide 2 cas de plus ; 2 autres restent à confirmer. Échecs restants : modèle (période prise pour un code de chantier, fiche employé non ouverte) et 2 sorties JSON invalides de gpt-oss, désormais rédigées une seconde fois. Fournisseurs : le catalogue complet (≈ 5 000 tokens par appel) dépassait les 8 000 TPM de Groq → **ciblage par domaine** ; Cloudflare refusait `content: null` → chaîne vide ; LiteLLM ne bascule pas sur 400/401 → modèles sans clé désactivés au démarrage (`litellm/filtrer_config.py`). Quota quotidien Gemini (≈ 20 requêtes) épuisé après 3 séries : une nouvelle mesure attend plus de fournisseurs (§ 8). |
| 2026-10-25 | Ciblage appliqué à **tous** les outils : aucun outil d'office, l'identité devient le domaine `systeme`, un préfixe non déclaré forme son propre domaine (37 tests du service IA verts). Clés Mistral, Z.ai et NVIDIA ajoutées ; Cerebras retiré (aucune inférence gratuite). 85 modèles NVIDIA listés, 15 sondés (outils + JSON) : retenus MiniMax M3.1 Flash, Nemotron 3 Ultra 550B, Nemotron 3.5 Super VL 120B (`complex`), gpt-oss-20b (`simple`) ; Step 5 Preview en `eval` (JSON invalide) ; écartés pour délai, 404 ou lenteur : DeepSeek V4.1 Flash, GLM 5.3 / 5.3 Flash, Gemma 4, Kimi K2.6, Nemotron 3 Super, Muse Glimmer. Z.ai : seul `glm-4.7-flash` gratuit et utilisable (outils, JSON invalide → `medium`). Mistral : `ministral-14b` et `codestral` OK, `mistral-medium` en 429 sur ce compte. Pool `complex` : 6 modèles chez 4 fournisseurs. **Évaluation : 20/24 (83 %)**, p50 9,7 s, p95 26,1 s ; abstentions 3/3, refus 1/1, réponses 16/20. Restent : 3 abstentions à tort (masse globale, qualité de paie, salaire) et un délai fournisseur (408). Skills NVIDIA installées globalement pour Claude Code et Codex : `nvidia-skill-finder`, `data-designer`, `rag-blueprint`, `rag-eval`, `nemo-retriever`, `nemotron-speech`, `nemotron-voice-agent-builder`. |
| 2026-10-25 | Les 3 abstentions à tort corrigées. Masse globale et qualité de paie : la période « 3260-02 » était lue comme un code de chantier ; la consigne système et celle du ciblage disent désormais qu'une valeur AAAA-MM est une période de paie, et la description du domaine `paie` cite les bulletins sans équipe, chantier ou fonction. Salaire : l'employé synthétique n'avait pas de salaire (l'import de paie le renseigne, ADR 0010), l'agent avait raison ; les données de test le renseignent, et l'évaluation signale « vérité absente des données synthétiques » au lieu d'imputer l'échec à l'agent. Jeton d'évaluation porté à 1 h (test seulement ; le paramètre reste à 15 min) : un run de 18 min finissait en 401. **Évaluation : 23/24** (run complet 15/15 cas joués, puis 8/9 cas rejoués après l'expiration du jeton et le quota Cloudflare du jour) ; abstentions 2/3, refus 1/1, réponses 20/20 ; seul échec : un délai fournisseur (408). Latences élevées ce jour-là (p50 ≈ 40 s) : quotas gratuits du jour épuisés par les runs précédents, bascules en chaîne. |
| 2026-10-25 | **T7 terminée.** `POST /agui` (`ag-ui-protocol` 1.0.0) : le jeton de connexion est échangé auprès de Spring contre le jeton agent, refus HTTP avant tout flux ; étapes, outils, réponse vérifiée, `com.staport.answer.v1` et `com.staport.mascot.state.v1` ; panne → `RUN_ERROR` générique ; déconnexion → run annulé et session MCP fermée. Le graphe publie sa progression (`Agent.derouler`, flux `custom` de LangGraph). 12 tests de la route (49 au total). Flux réel `FluxAgUiIntegrationTest` avec le client officiel `@ag-ui/client` 1.0.3 (`scripts/ia/agui-client`) : réponse vérifiée (3 000 MAD attendus), arrêt par le client sans événement serveur tardif, jeton invalide refusé — 3/3. Jeton de connexion inchangé en production (15 min) : il ne sert qu'au début du run, le jeton agent (5 min) couvre un run borné. Confirmation (interruption AG-UI) reportée à J6 avec les checkpoints. |
| 2026-10-25 | T8, côté service : le flux AG-UI passe par l'intégration officielle `ag-ui-langgraph` 0.0.47 ([ADR 0015](adr/0015-ag-ui-integration-langgraph-officielle.md)). Le graphe porte la conversation en messages LangChain (seule clé de sortie), signale outils, mascotte et réponse par événements personnalisés et émet le texte vérifié depuis le nouveau nœud `conclure`. Frontière de sécurité dans `agui.py` : ni `RAW` ni `rawEvent` (ils exposaient consignes et données), `RUN_ERROR` générique, échos `manually_emit_*` retirés. Checkpointer en mémoire neuf par run, liste blanche msgpack. 49 tests verts ; flux réel avec `@ag-ui/client` 1.0.3 : 3/3. |
| 2026-10-25 | **T8 terminée.** Assistant immersif dans Angular (`core/assistant`) : client officiel `@ag-ui/client` 1.0.3 (`zod` forcé en 4.6.7, faille GHSA-mrhx-c7xc-m3w5 du `zod` 3 écartée, flux réel validé), barre `Ctrl K`, discussion avec étapes et outils repliables, réponse vérifiée, **ouverture automatique de la vue** (liste blanche, gardes, « Revenir ») et valeurs citées surlignées. `/ia/agui` relayé par `proxy.conf.js` (dev) et nginx (réseau Compose `assistant-net`, frontend et service IA seulement ; limite 20 questions/min). Jetons `--assistant-*` dans les deux thèmes. 21 tests unitaires, 2 parcours e2e (flux AG-UI simulé, axe) ; vérifié au navigateur sur le banc `BancAssistantTest` (données fictives) : question sur un chantier, vue Paie · Analytique ouverte avec période et chantier, masse salariale surlignée, retour à l'écran précédent. |
| 2026-10-25 | **T9, vérification de J1 avant la PR** : backend 475 tests verts (4 ignorés) avec le client MCP Python et seuil de couverture par domaine respecté ; service IA 49 tests, `ruff`, `pyright` ; images `erp-rh-ia` et `erp-rh-litellm` construites, `erp-rh-ia` démarrée (santé, `/agui` en 503 IA désactivée) ; frontend 863 tests unitaires et build de production dans les budgets (assistant chargé en différé : 703 ko initiaux) ; e2e 66 parcours (les échecs en parallèle repassent en série, instabilité connue du poste) ; flux réel `FluxAgUiIntegrationTest` 3/3 ; parcours navigateur sur le banc. Reste : présenter la démonstration au propriétaire. |
| 2026-10-26 | J1 fusionné dans `main` (PR #90). Pile Compose sans profil, IA et MCP actifs par défaut, clés virtuelles LiteLLM enregistrées par la tâche ponctuelle `litellm-cles` (PR #91). PR #92 (domaines) : contraste des badges de l'assistant corrigé. Pile du propriétaire : le backend refusait la clé MCP au format PKCS#1, convertie en PKCS#8 (même clé publique). |
| 2026-10-26 | Revue du chantier face aux cadres de référence (§ 10) : conventions complétées (gouvernance et usages interdits, modèle de menaces OWASP, objectifs de service, cycle de vie des modèles, modèles auto-hébergés, évaluation à trois niveaux, expérience de confiance, injection par champs de données) ; tâches de J2 et J3 détaillées ; J3 aligné sur la décision « aucun service payant » ; décisions à prendre listées. |
| 2026-10-26 | Retour du propriétaire : « bonjour » lent (7 étapes, 3 appels de modèle) ; « 127 entrées » juste mais trompeur (969 payés en août, 1 009 en septembre, +40 net, 87 plus payés). Nœud `trier` en tête du graphe : salutation, remerciement, au revoir et aide répondus sans modèle ni outil ; un ciblage sans domaine passe directement à la rédaction. `paie_mouvements` rend l'effectif du mois précédent, l'écart net, les « plus payés » et la définition de chaque chiffre ; consigne 8 du modèle : nommer chaque chiffre selon sa définition. Service IA 73 tests, `McpOutilsLectureIntegrationTest` 16/16, frontend 921 tests. |
| 2026-10-26 | Décision du propriétaire, contre la recommandation de garder la protection des conventions : la règle « aucune donnée réelle vers un modèle » est retirée du plan et des conventions (§ 2). Retirés : l'interdiction d'envoyer des données réelles aux offres gratuites, le routage et la garde technique par classe de données (ancienne T2.8, recentrée sur la conservation dans la passerelle), la condition « avant toute donnée réelle » de la porte de mise en service. Gardés : classification documentée, minimisation, pseudonymisation possible, formalités de transfert et durées de conservation. |
| 2026-10-26 | Décision du propriétaire « frameworks d'abord » (§ 2) : l'agent décide de sa forme de réponse comme Claude, ChatGPT, Gemini et Grok ; tout code IA maison est retiré au profit de LangChain, LangGraph, Deep Agents si besoin, `ag-ui-langgraph`, A2UI et CopilotKit Angular. Vérifié : LangChain 1.4.7 fournit les middlewares nécessaires ; `ag-ui-langgraph` diffuse le raisonnement des modèles LangChain ; les modèles NVIDIA du pool renvoient leur raisonnement par LiteLLM (1 à 6 s, en anglais) ; `@copilotkit/angular` 0.6 vise Angular 22. Conventions alignées ; tâches T10 à T15 ajoutées à J1. |
| 2026-10-26 | **T10 à T12 terminées.** Service IA sur `create_agent`, `ChatLiteLLM` (seul connecteur qui transmet le raisonnement), MCP intégré à LangChain (`langchain.mcp`, FastMCP ; `langchain-mcp-adapters` n'est plus maintenu), `LangGraphAGUIAgent` de CopilotKit ; graphe, tri, ciblage, clients de modèle et MCP, événements de mascotte retirés ; vérificateur de chiffres en middleware `after_model`, état partagé `verification`. Évaluation par `openevals`/`agentevals` et scénarios hors ligne sur `aimock` (CopilotKit). Défaut corrigé : le serveur MCP ne mettait que la synthèse dans le texte, les clients standard ne donnent au modèle que les blocs texte et l'agent bouclait ; le JSON est aussi renvoyé en texte (spécification MCP). **Évaluation réelle : 22/24 (91,7 %)**, abstentions 3/3, refus 1/1, réponses 18/20 ; les 2 échecs sont des erreurs 429 d'un fournisseur gratuit ; p50 9,8 s, p95 41,7 s. Service IA 44 tests, flux réel `FluxAgUiIntegrationTest` vert (3 appels de modèle), `McpOutilsLecture` 16/16, `McpSecurite` 21/21. |
| 2026-10-26 | **T13 et T14 terminées.** Serveur MCP par **Spring AI 2.0.2** (aucune mécanique à nous : annotations `@McpTool`, `@PreAuthorize`, Bean Validation, `@AuditableAction`, `McpStatelessSyncServerCustomizer` pour l'exécution sur le fil de la requête) ; descriptions d'outils réécrites selon les bonnes pratiques ; refus de permission audités par l'écouteur de sécurité existant (`ACCES_REFUSE`), lectures par `MCP_<OUTIL>`. Comportements des frameworks adoptés : bornes dites dans les descriptions (le générateur de schéma ne reprend pas Bean Validation), messages d'erreur de Spring Security et des exceptions de domaine. Vue à ouvrir : état partagé `vue`, posé par le vérificateur une fois la réponse vérifiée (vue rendue par Spring, jamais choisie par le modèle). Jeton agent par `NimbusJwtEncoder`. Backend 522 tests verts, flux réel vert. |
| 2026-10-26 | **T15 terminée.** Interface rebâtie sur CopilotKit Angular 0.6 : barre latérale ancrée à droite (`Ctrl K`), raisonnement repliable à la place des étapes, plan de l'agent en liste cochée, consultations d'outils en une ligne, questions proposées et contexte adaptés à l'écran ouvert, vue de la réponse vérifiée ouverte par l'état partagé (`verification`/`vue`) avec « Revenir », libellés en français, thème Staport clair/sombre (variables CopilotKit reliées aux jetons ; `dark` posé selon le thème). Ancien code maison retiré (service, mascotte, échanges). Choix de structure : les services de CopilotKit sont fournis à la racine par la bibliothèque et lisent sa configuration ; la déclarer à la racine ramenait toute la bibliothèque dans le paquet initial (5 Mo). L'assistant crée donc un injecteur d'environnement enfant (`assistant-racine.component.ts`) avec la configuration (`enableInspector: false` : l'inspecteur est un outil distant promotionnel) et ses services ; l'agent et les rendus s'y branchent par `updateRuntime` et `addRenderToolCall`. Paquet initial 785 kB (budget 1 Mo), assistant 4,2 Mo dans un chunk différé. Vérifié : 918 tests unitaires, e2e (flux AG-UI simulé avec raisonnement, outil, état vérifié ; axe sans violation), parcours réel au navigateur sur le banc (données fictives, vrai modèle) : question, raisonnement, consultation, réponse, vue Paie · Analytique ouverte. Finitions faites : raisonnement en français par l'emplacement `reasoningMessageComponent` (« Réfléchi pendant … », la bibliothèque n'expose pas ce libellé), bandeau « Vue ouverte » visible, thème clair vérifié, téléphone (fenêtre modale pleine largeur, sans débordement) couvert par l'e2e. Connu : en développement seulement, la console affiche l'échec de chargement de l'inspecteur de la bibliothèque (sa configuration n'existe pas à la racine) ; aucun inspecteur n'est affiché et le build de production n'en contient pas. |
| 2026-10-26 | **T16 construite.** Décisions du propriétaire : runtime CopilotKit officiel en Node (service `copilot-runtime`, image `erp-rh-copilot-runtime`, réseaux `assistant-net`/`runtime-net`, relais nginx `/ia/copilotkit/`) pour le middleware A2UI que CopilotKit place côté serveur (`@ag-ui/a2ui-middleware` importe `crypto` de Node, impossible dans le navigateur) ; ouverture automatique des vues retirée (A2UI suffit) ; composants CopilotKit d'origine à la place des rendus maison (raisonnement, plan, outils). Règles « frameworks d'abord » et « un seul `compose pull` + `up` » inscrites dans `AGENTS.md`. Le vérificateur contrôle les chiffres de la dernière surface ; elle n'est jamais une source. Vérifié : Python 47 tests, Angular 903, e2e 3 (surface A2UI simulée rendue par le rendu officiel, axe), image du runtime construite, `/info` du runtime local (A2UI actif, télémétrie coupée). Reste : voir au navigateur la surface produite par un vrai modèle. |
| 2026-10-26 | **T16 terminée.** Échec « Couldn't generate the UI » constaté par le propriétaire : le sous-agent composait des composants absents du catalogue de base (`Title`, `Metric`, `Table`) et le service IA ne validait rien. Correction par les paramètres officiels de `CopilotKitMiddleware` (`a2ui_params`) : catalogue de base A2UI v0.9 de la spécification (fichier de `@a2ui/web_core` 0.10.4, `catalogue_a2ui_base.json`) pour valider chaque surface et la faire reprendre par le sous-agent, consignes de l'ERP (français, valeurs reprises des outils sans calcul, MAD). Vérifié avec un vrai modèle : par le runtime, surface de `Column`/`Row`/`Text`/`Divider`, réponse `verifiee` ; au navigateur, tableau Période · Masse salariale · Effectif affiché dans la discussion. Interface : panneau flottant au-dessus de l'écran (mode `overlay` de CopilotKit, voile neutralisé, la vue garde sa place), en-tête de marque (emplacement `headerComponent`), finitions de la saisie, des puces et des bulles, consultations d'outils non affichées en brut. Connu : avec les offres gratuites, une réponse avec surface prend plusieurs minutes ; le libellé du raisonnement reste en anglais (composant d'origine). |
| 2026-10-26 | **Latence des surfaces A2UI.** Constat du propriétaire : environ 6 minutes pour un tableau. Mesure dans les journaux LiteLLM : une dizaine d'appels de modèle en série, de 2 à 55 s chacun sur les offres gratuites NVIDIA, 10 000 à 20 000 jetons en entrée, dont environ 7 000 de schéma A2UI envoyés à chaque appel. Corrections par options officielles : `a2ui.includeSchema: false` (le schéma ne part plus à chaque question ; le sous-agent reçoit un guide de composition compact lu dans le catalogue, via `a2ui_params`) et `reasoning_effort: low` pour le modèle principal. Même question, vrai modèle, par le runtime : **76 s**, 4 appels de modèle, surface valide, réponse vérifiée. Piste non retenue sans validation : routage par latence de LiteLLM (`latency-based-routing`), à tester avec `test_providers.py` avant tout changement de la passerelle. |
| 2026-10-26 | **Documentation par couches et pool de modèles.** README et skills des huit domaines décrivent les couches Application, Analytique et IA (Équipe, Fonction et Chantier en détail, avec points à valider ; Employé et Paie avec leurs outils MCP ; Audit, Paramètres et Auth pour leurs outils d'administration) ; `scripts/check-docs-domaines.mjs`, lancé par la CI du backend, vérifie que chaque permission de contrôleur et chaque outil MCP figure dans la documentation de son domaine. Fournisseurs : sondes directes avec les clés du propriétaire : LLM7 ne rend gratuits que `gpt-oss:20b` et `codestral-latest` (les autres répondent 402), Cohere répond en 1 à 1,4 s mais sa clé d'essai est limitée à 20 requêtes/min, 1 000 appels/mois et à un usage non commercial ; à travers LiteLLM, Command A a mis 25 s et Command A+ n'a pas appelé l'outil. Entrées en pool : `llm7-gpt-oss-20b` (simple), `llm7-codestral` (code), `cohere-command-r7b` (simple) ; en évaluation seulement : `cohere-command-a`, `cohere-command-a-plus`. SambaNova n'est plus gratuit : écarté. Le routage par latence de LiteLLM reste à valider. Section « Vision courte et vision longue » ajoutée au § 7. |
| 2026-10-26 | **T18 terminée : observabilité de bout en bout.** **Arize Phoenix** (un seul conteneur, environ 450 Mo, authentification activée) à la place de Langfuse v3 : Langfuse exige ClickHouse, Redis, MinIO et un worker (3 à 4 Go) quand Docker n'en offre que 7,4, et Phoenix lit nativement OpenTelemetry/OpenInference, donc rien d'autre à brancher. Runtime CopilotKit (Node : `@opentelemetry/sdk-node`, instrumentations `http` et `undici`, chargeur ESM officiel), service IA (`opentelemetry-instrument`, FastAPI, httpx, LangChain via OpenInference), Spring Boot 4 (`spring-boot-starter-opentelemetry`, spans SQL `datasource-micrometer`) : une question donne **une seule trace** du runtime aux appels de modèle (modèle, jetons, durée), aux outils MCP, à l'API et au SQL. Réseau `trace-net`, jeton partagé `PHOENIX_ADMIN_SECRET` (401 sans, 200 avec), conservation 30 jours. |
| 2026-10-26 | **Harnais : contexte ERP.** Middleware `ContexteErp` (`before_agent`/`wrap_model_call`) : date du jour, droits utiles et dernier mois de paie fournis sans appel de modèle (outils `systeme_identite` et `paie_periodes` appelés par le code, avec le jeton de l'utilisateur) ; consigne d'appels d'outils parallèles. Une question de données passe de plus de 30 s à 17-20 s (2 appels de modèle). |
| 2026-10-26 | **Interface composée enrichie.** Catalogue de l'ERP = catalogue de base A2UI + `DataTable` (tri, recherche, export CSV, plein écran, défilement virtuel CDK), `KpiGrid` et `Chart` (composant `stp-chart`, jetons Staport), déclarés avec `createAngularCatalog` côté Angular et `catalogue_a2ui_erp.json` côté IA (validation des surfaces). **Surfaces déterministes** : un outil MCP qui rend 4 lignes ou plus porte aussi les opérations A2UI (motif officiel `copilotkit.a2ui.render`, détecté par le middleware du runtime) ; le modèle ne recopie pas le tableau, ne voit que le résultat d'origine (`PresentationResultats`) et commente en deux phrases ; le vérificateur de chiffres lit le résultat d'origine. Prouvé de bout en bout (événement `ACTIVITY_SNAPSHOT` du runtime). |
| 2026-10-26 | **T17 terminée.** Détection d'injection de prompt native de LiteLLM (`detect_prompt_injection`, heuristiques seules : « Ignore all previous instructions… » refusé en 400 par la passerelle avant tout modèle, question normale transmise ; vérifié sur une passerelle jetable) ; la détection est en anglais, un attaquant francophone passe : l'autorisation par outil et les droits relus à chaque appel restent la vraie barrière. Clé `erp-rh-ia` : 60 requêtes/min, 8 simultanées, 300 000 jetons/min. **Budgets par utilisateur non retenus** : tous les modèles du pool sont gratuits (coût nul), et `overwrite_user_with_key_hash` isole déjà les clés ; à rouvrir si une offre payante entre dans le pool. **Masquage Presidio non retenu** (décision du propriétaire sur les données réelles, empreinte mémoire). Scripts : `filtrer_config.py` gardé (LiteLLM ne désactive pas un déploiement dont la clé est vide), `enregistrer_cles.py` gardé (les clés virtuelles vivent en base, pas dans la configuration), `test_providers.py` gardé (banc de non-régression du routage avant toute mise à jour de l'image). |
| 2026-10-26 | **T19 terminée côté service.** Checkpointer officiel `AsyncPostgresSaver` (LangGraph) dans une base dédiée `ia-db` (même image PostgreSQL, volume et réseau `memoire-net` propres, joignable par le seul service IA) ; `IA_DATABASE_URL` absent = mémoire du processus (tests). Règles à nous : le fil du navigateur est **préfixé par l'identité du jeton agent** (isolation entre utilisateurs) et l'identifiant d'origine est rendu dans les événements ; purge des conversations inactives depuis `IA_CONVERSATION_JOURS` (30) toutes les 24 h ; `SummarizationMiddleware` officiel au-delà de 12 000 jetons. Prouvé : après redémarrage du service, la question « quelle était ma première question » retrouve le fil, un autre fil n'a aucune mémoire. **Suite** : afficher l'historique d'un fil repris dans l'interface (la liste des fils de CopilotKit exige sa plateforme Intelligence, hors périmètre gratuit) et mémoire longue par le `Store`. |
| 2026-10-27 | **Outils flexibles, questions à l'utilisateur, lint.** Les outils MCP de recherche et de répartition exposent leur tri : `tri` (critère propre à l'outil), `sens` (ASC ou DESC) et `page` (avec `limite`) sur `employes_rechercher`, `paie_bulletins_rechercher`, `chantier_rechercher`, `equipe_rechercher`, `fonction_rechercher`, et `tri`/`sens` sur `employes_regrouper` et `paie_repartition` ; l'agent compose « les cinq plus gros salaires » ou « le chantier le moins cher » lui-même, et le tri par salaire exige le droit de paie (aucune fuite par l'ordre). 4 tests d'intégration. L'agent interroge l'utilisateur avec `poser_question` (outil déclaré par le navigateur, human-in-the-loop de CopilotKit : options à choisir ou réponse libre, le run reprend avec la réponse). ESLint (`angular-eslint`, `typescript-eslint`) : `npm run lint`, étape de CI, 0 erreur, 23 avertissements de dette d'accessibilité plafonnés. Surfaces déterministes : le crochet officiel `wrap_tool_call` remplace le contournement de la coroutine des outils. |
| 2026-10-27 | **Inventaire du code IA maison et passerelle.** Décision du propriétaire : tout passe par les frameworks, sans exception. Pièces examinées une à une : le rejoueur d'évaluation reste un banc de développement qui s'appuie sur `agentevals` pour la trajectoire ; `ContexteErp`, `SurfacesResultats` et le vérificateur sont des middlewares officiels (`AgentMiddleware`, crochets `before_agent`, `wrap_model_call`, `wrap_tool_call`, `after_model`) ; la surface suit le motif officiel de schéma fixe de CopilotKit (`copilotkit.a2ui`) ; le checkpointer et la purge utilisent `AsyncPostgresSaver` et `adelete_thread` (aucune expiration native hors Agent Server : [forum LangChain](https://forum.langchain.com/t/production-use-of-postgressaver-service-owned-migrations-and-checkpoint-retention-in-node-js/4481)). **Vérificateur de chiffres** : aucun framework ne vérifie qu'un nombre vient des outils (la page [Guardrails de LangChain](https://docs.langchain.com/oss/python/langchain/guardrails) ne propose que des filtres de contenu et l'approbation humaine, NeMo Guardrails des rails à base de modèle) ; le remplacer par un juge `openevals` troquerait une garantie déterministe contre une garantie probabiliste sur des modèles gratuits : **décision du propriétaire attendue**. **Passerelle** : alternatives comparées (Bifrost, Portkey, Kong, Cloudflare ; TensorZero archivé en juin 2026 et Helicone en maintenance selon les comparatifs). Bifrost gagne en surcoût (microsecondes) mais ce surcoût est sans effet ici (les secondes viennent des modèles gratuits) et son catalogue de fournisseurs est plus petit ; LiteLLM reste : bascule par tag avec cooldown, clés virtuelles, détection d'injection. À rouvrir si le volume ou un fournisseur payant l'impose. |
| 2026-10-27 | **Conversations reprises dans l'interface, runtime durci.** Le fil de l'utilisateur (`u<id>-<uuid>`, mémorisé par navigateur) est rejoué au rechargement par le `connect` officiel de CopilotKit, et « Nouvelle conversation » en ouvre un autre. L'historique du runtime est gardé par le **runner SQLite officiel** (`@copilotkit/sqlite-runner`, volume `runtime_data`) : il survit au redémarrage du runtime (prouvé). Sans CopilotKit Intelligence, le runtime exposait les fils de tous les utilisateurs ; les crochets officiels `onBeforeHandler` authentifient chaque requête auprès de Spring (`/auth/me`, droit `IA_UTILISER`), ne servent que `info`, `agent/run`, `agent/connect` et `agent/stop` et réservent un fil à son propriétaire (403 sinon) ; sa liste (`/threads`) répond 404. Correctif trouvé au banc : la reprise après `poser_question` envoie le résultat de l'outil comme dernier message, que le service IA refusait (422) ; accepté, avec la même limite de taille. Image du runtime : le chargeur ESM d'OpenTelemetry était absent de l'`ENTRYPOINT`. Vérifié dans le navigateur : question de l'agent, réponse (option ou texte libre), reprise de l'agent. **Limites** : pas de liste ni de titres des anciennes conversations (la liste des fils et leurs titres automatiques sont des fonctions de CopilotKit Intelligence, payant ; le runner SQLite n'en offre pas) ; pas d'expiration de l'historique SQLite. |

## 8. État technique

| Élément | État |
|---|---|
| Preuve MCP | Serveur SDK Java `mcp-core` + `mcp-json-jackson3` 2.1.0 sur Java 21 / Spring Boot 4.1.1 (J0, avant l'adoption de Spring AI en T13) ; clients TypeScript `@modelcontextprotocol/sdk` 1.32.1 et Python `mcp` 2.3.0 ; protocole **2025-11-25**, Streamable HTTP. Profil Maven `mcp-compatibility`, portée test uniquement ; voir le [README du prototype](../scripts/ia/mcp-compatibility/README.md). |
| LiteLLM | Image `erp-rh-litellm` (LiteLLM v1.104.2 épinglé par digest), base dédiée `litellm-db`, démarrés par défaut avec la pile (clés virtuelles enregistrées par `litellm-cles`). Fournisseurs actifs : Gemini, Groq, Mistral Experiment, Cloudflare, OpenRouter `:free`, Z.ai Flash, NVIDIA NIM. Pool `complex` : Gemini 3.8 Flash, Mistral Medium, NVIDIA MiniMax M3.1 Flash, Nemotron 3 Ultra, Nemotron 3.5 Super VL, Cloudflare gpt-oss-120b. Candidats suivants (gratuits, renouvelables) : SambaNova (20 req/jour par modèle, sans carte), OVHcloud AI Endpoints anonyme (2 req/min), Cohere (1 000 appels/mois, évaluation), LLM7 (100 K tokens/jour). Écartés : GitHub Models (retiré), Hugging Face (plus de crédit gratuit), Cerebras (aucune inférence gratuite), DeepSeek (aucun palier gratuit), Alibaba Model Studio (quota unique de 90 jours), SiliconFlow international, Chutes, Kluster. Voir [`litellm/README.md`](../litellm/README.md). |
| Service IA | Image `erp-rh-ia` (Python 3.13), santé, client LiteLLM, agent LangGraph avec ciblage par domaine, vérificateur de chiffres et évaluation (T6), point d'entrée AG-UI `POST /agui` (T7). Voir [`ia/README.md`](../ia/README.md). |
| Code IA dans l'application | Serveur MCP de **Spring AI 2.0.2** (SDK MCP Java 2.1.0, Spring Boot 4.1.2) : route `/mcp` sans état derrière `MCP_ENABLED`, outils déclarés par `@McpTool` (permission par `@PreAuthorize`, bornes par Bean Validation, trace par `@AuditableAction`), chaîne de sécurité dédiée, jeton agent `POST /auth/jetons/agent`, JWKS `GET /.well-known/jwks.json`, permission `IA_UTILISER` (V36, `SYSTEM_ADMIN` seulement). Catalogue de 25 outils en lecture (ci-dessous). Assistant Angular (`core/assistant`, T8). Détails : [Auth](auth/README.md#jeton-délégué-de-lassistant-ia). |
| CI et production | Job `ia` et publication de `erp-rh-litellm` / `erp-rh-ia` ajoutés à la CI ; exécution distante sur demande du propriétaire ; rien de déployé. |

### Catalogue MCP

Chaque outil exige `IA_UTILISER` (route) et la permission de son domaine (revérifiée à chaque appel), lit uniquement les façades publiques des domaines, journalise l'appel (entrée `ACCES` d'action `MCP_<OUTIL>`, canal `MCP` ; un refus de permission est l'événement de sécurité `ACCES_REFUSE`, comme pour l'API REST) et renvoie une `vue` (§ 6). Les données sont rendues en contenu structuré, en synthèse et en JSON texte (spécification MCP). Annotations MCP : lecture seule, idempotent, monde fermé. Les erreurs sont celles des frameworks : « Access Denied » de Spring Security, message de l'exception du domaine (par exemple « Employé introuvable avec l'id… », celui de l'API REST), violation de borne de Bean Validation.

| Domaine | Outil | Permission | Arguments principaux | Rend | Vue proposée |
|---|---|---|---|---|---|
| Système | `systeme_identite` | — | aucun | Utilisateur et autorités effectives | — |
| Chantier | `chantier_rechercher` | `CHANTIER_READ` | `recherche` (code, nom ou désignation), `statut` (`EN_COURS`/`CLOTURE`), `limite` ≤ 20 | Identifiant, code, désignation, nom, origine ERP, statut | `chantiers` / `tabulaire` |
| | `chantier_fiche` | `CHANTIER_READ` | `id` | Fiche du chantier | `chantiers` / `fiche` |
| Équipe | `equipe_rechercher` | `EQUIPE_READ` | `recherche`, `limite` ≤ 20 | Identifiant, code, libellé | `equipes` / `tabulaire` |
| | `equipe_fiche` | `EQUIPE_READ` | `id` | Fiche de l'équipe | `equipes` / `fiche` |
| Fonction | `fonction_rechercher` | `FUNCTION_READ` | `recherche`, `limite` ≤ 20 | Identifiant, libellé | `functions` / `tabulaire` |
| | `fonction_fiche` | `FUNCTION_READ` | `id` | Fiche de la fonction | `functions` / `fiche` |
| Employé | `employes_rechercher` | `EMPLOYEE_READ` | `nom`, `cin`, périmètre, `statut` (`EN_POSTE`/`SORTI`), `limite` ≤ 20 | Fiches complètes (CIN, naissance, embauche, affectations) ; salaire avec `PAIE_READ` | `employees` / `tabulaire` |
| | `employe_fiche` | `EMPLOYEE_READ` | `id` | Fiche complète et départs ; salaire avec `PAIE_READ` | `employees` / `fiche` |
| | `employes_compter` | `EMPLOYEE_READ` | périmètre, `statut` | Effectif, en poste, sortis, âge et ancienneté moyens, embauches 12 mois, tranches | `employees` / `analytique` |
| | `employes_regrouper` | `EMPLOYEE_READ` | `dimension` (`CHANTIER`/`EQUIPE`/`FONCTION`), périmètre, `statut` | Effectif et en poste par groupe, 50 au plus | `employees` / `cartes` |
| | `employes_sorties` | `EMPLOYEE_READ` | `periode` | Départs du mois par motif, 20 noms au plus | `employees` / `analytique` (mouvements, avec `PAIE_READ`) ou liste « Sorti » |
| | `employe_parcours` | `PAIE_READ` | `id` | Indicateurs, 36 derniers mois (affectations, jours, salaires), événements | `employees` / `fiche` |
| Paie | `paie_indicateurs` | `PAIE_READ` | `periode`, périmètre | Masse, effectif, coût moyen, STC ; mois précédent ; 5 principaux chantiers | `paie` / `analytique` |
| | `paie_periodes` | `PAIE_READ` | périmètre, `limite` ≤ 36 | Mois importés : bulletins, chantiers, masse, STC | `paie` / `cartes` |
| | `paie_repartition` | `PAIE_READ` | `periode`, `dimension`, périmètre | Masse, effectif, STC par groupe, 50 au plus | `paie` / `analytique` |
| | `paie_evolution` | `PAIE_READ` | `periode` (dernier mois de la série), périmètre, `limite` ≤ 36 | Série mensuelle masse, effectif, STC | `paie` / `analytique` |
| | `paie_mouvements` | `PAIE_READ` | `periode` ou `limite` ≤ 36, périmètre | Payés, entrées, sorties, mutations par mois | `employees` / `analytique` |
| | `paie_qualite` | `PAIE_READ` | `periode`, périmètre | Bulletins sans équipe, sans observation ; tranches de total | `paie` / `tabulaire` (sans équipe) |
| | `paie_bulletins_rechercher` | `PAIE_READ` | `periode`, `nom`, `cin`, périmètre, `limite` ≤ 20 | Bulletins complets : employé et CIN, affectations, jours, salaires, primes, total, observation | `paie` / `tabulaire` |
| Rapport | `rapport_preparer` | `PAIE_EXPORT` + `PAIE_READ` | `periode`, `chantierIds` | Chantiers du rapport ; aucun fichier généré | `paie` / `tabulaire`, `action=export` |
| Paramètres | `parametres_lire` | `PARAMETRE_READ` | aucun | Clé, libellé, valeur, unité, bornes | `admin/parametres` |
| Administration | `roles_lister` | `ROLE_MANAGE` | `nom`, `limite` ≤ 20 | Rôles et codes de permission (sans les comptes) | `admin/roles` |
| Audit | `audit_rechercher` | `AUDIT_READ` | `depuis`, `jusqua`, `utilisateur`, `action`, `categorie`, `resultat`, `entite`, `entiteId`, `limite` ≤ 20 | Entrées du journal | `audit` |
| | `audit_historique` | `AUDIT_READ` | `entite`, `id`, `limite` ≤ 10 | Versions : auteur, opération, champs avant/après | — |

Périmètre = `chantierIds`, `equipeIds` (`0` = sans équipe), `fonctionIds`. `periode` absente = dernier mois de paie
importé. Exclus : toute écriture (jusqu'à J6), la liste des comptes utilisateurs, la carte.

## 9. Reprise

1. Lire `AGENTS.md`, le [handoff général](handoff/etat-du-projet.md), ce document et les conventions
   IA ; vérifier branche, `git status` et derniers commits.
2. Reprendre la première tâche ⬜ du § 7 ; la passer en 🟦, puis en ✅ avec une ligne de journal
   quand son critère de sortie est prouvé.
3. Ne jamais toucher au port 4200 ni à la pile Docker `erp-rh-*` du propriétaire.
4. Toute nouvelle décision s'inscrit au § 2. Aucun autre document IA n'est créé : celui-ci les
   remplace.
5. Tenir le § 10 à jour : une pratique passe à « en place » seulement quand sa preuve existe.

## 10. Pratiques de référence : état réel

Revue du 2026-10-26 de l'existant face aux cadres retenus au § 2. « En place » signifie prouvé par un
test ou une mesure ; la règle de chaque ligne est dans les conventions.

| Pratique | État réel | Traitée par |
|---|---|---|
| Le modèle ne calcule pas ; chiffres et périodes vérifiés ; abstention | En place | T6 |
| Identifiants, noms et dates vérifiés ; période, périmètre et définition affichés | Partiel : nombres et périodes vérifiés ; `paie_mouvements` rend ses définitions, l'écart net et les « plus payés » ; identifiants et noms pas encore vérifiés | T2.7 |
| Réponse directe aux messages simples | Provisoire : tri par mots-clés dans un nœud du graphe (2 à 17 ms), à remplacer par la décision du modèle (règle « frameworks d'abord ») | T10 |
| Raisonnement et plan visibles, texte en flux | Absent : étapes du graphe affichées, texte d'un bloc après vérification | T10 à T12 |
| Code IA maison | Présent : graphe, tri, ciblage, client de modèle, client MCP, frontière AG-UI, rejoueur d'évaluation, interface Angular, scripts LiteLLM, outils MCP et jeton agent côté Java | T10 à T20 (service IA : graphe, tri, ciblage et clients maison déjà retirés) |
| Permissions revérifiées à chaque appel d'outil ; jeton délégué court ; audit par outil | En place | T4, T5 |
| Périmètre de données par fiche de poste | Absent : l'accès est réservé à `SYSTEM_ADMIN` | T2.1 à T2.3 |
| Injection directe et indirecte (champs de données piégés), exfiltration | Non testées ; seuls les refus de droits le sont | T2.6 |
| Texte du modèle rendu comme texte, aucun lien ni image actif | En place (interpolation Angular), sans test dédié | T2.6 |
| Plafonds par run | Partiel : 3 tours, 6 appels, 2 rédactions, 12 000 caractères par résultat, 1 500 tokens par réponse, 120 s par appel ; durée totale et tokens totaux non plafonnés (nginx coupe à 300 s) | T2.5 |
| Quotas par utilisateur et budgets par poste | Absent : limite de 20 questions par minute au proxy, 60 requêtes par minute pour la clé ERP-RH | T2.5 |
| Contenu des messages non conservé par la passerelle | Non réglé explicitement ; journaux de dépense gardés 30 jours | T2.8 |
| Contrat de vue unique entre Spring, service IA et Angular | Absent : deux listes écrites à la main | T2.9 |
| Conversations multi-tours, isolation, suppression | Absent : chaque question est traitée seule, l'historique ne vit que dans le navigateur | T3.2 |
| Contexte d'écran | Absent | T3.3 |
| Traces OpenTelemetry, outil d'observation, alertes | Absent : journaux JSON et corrélation seulement | T3.4 |
| Objectifs de service, tests de charge et de panne | Absent ; mesure connue : p50 9,7 s et p95 26,1 s sur offres gratuites | T3.5 |
| Registre, fiche du système, analyse d'impact, notice, conservation | Absent ; accord CNDP obtenu (§ 2), sa référence et son périmètre restent à consigner | T3.6 |
| Procédure d'incident, changement de modèle, prompts versionnés | Partiel : interrupteur global en place ; prompts dans le dépôt sans identifiant de version | T3.7 |
| Évaluation hors ligne en CI, retours utilisateurs, relecture d'échantillons | Partiel : jeu de 24 cas rejoué à la demande sur vrais modèles | T3.8 |
| Langues arabe et darija | Absent | T3.9 |
| Modèle local, licence et provenance des poids | Absent : offres gratuites externes, données synthétiques | T3.1 |
| Confirmation humaine, idempotence, reprise durable | Sans objet tant que tout est en lecture | J6 |
| SBOM et analyse de vulnérabilités du service IA | Absent pour le service IA (dépendances verrouillées par `uv.lock`) ; en place pour le backend et le frontend | T3.7 |
