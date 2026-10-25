# IA dans ERP-RH — document unique

**Mis à jour : 2026-10-24.** Seule référence du chantier IA : décisions, architecture, plan, suivi
et reprise. Les règles réutilisables sont dans les conventions
([agents-ia](../conventions/agents-ia.md), [mcp](../conventions/mcp.md),
[agent-ui](../conventions/agent-ui.md), [rag](../conventions/rag.md),
[integrations](../conventions/integrations.md)) ; ce document fixe comment ERP-RH les applique.

## 1. Objectif

L'IA sert **tous les utilisateurs** de l'entreprise (BTP, classe S, Maroc) : comprendre, retrouver,
contrôler, préparer. Elle commence par la partie RH de l'ERP, puis couvre chaque département avec le
même socle. Elle ne devient jamais la source des chiffres, des droits ou des décisions métier.

## 2. Décisions

| Sujet | Décision |
|---|---|
| Méthode | Tranche verticale de bout en bout, puis durcissement. Une tâche à la fois, suivie au § 7. |
| Métier | Spring est propriétaire des données, transactions, règles, permissions et audits. Aucun framework LLM dans le monolithe. |
| Service IA | **Python** : LangGraph pour le graphe, Pydantic pour tous les contrats, `uv` (lockfile), `ruff`, `pyright` strict, `pytest`. Python est le langage unique de l'IA (graphe, ML, OCR, voix, évaluation). |
| Outils métier | **MCP** (Streamable HTTP) entre le service IA et Spring. Le service IA n'a ni accès aux tables ni client REST métier. |
| Interface ↔ agent | **AG-UI** entre Angular et le service IA : messages en streaming, états d'outils, interruptions, confirmations, événements de la mascotte. Angular dialogue directement avec l'agent Python, sans runtime intermédiaire. |
| Modèles | **LiteLLM** : un alias unique `ai-gateway`, la tâche indiquée par tag (`simple`, `medium`, `complex`, `code`, `ocr`), bascule entre fournisseurs du même niveau, budgets par clé virtuelle. Un modèle est retenu sur le jeu de référence (§ 4). |
| Données exposées à l'IA | Les outils rendent les mêmes champs que les écrans, CIN, dates de naissance et montants compris (décision du 2026-10-25) ; seules les permissions RBAC filtrent, dont le salaire réservé à `PAIE_READ`. Tests sur données fictives. Cible : **modèle local open source** servi derrière LiteLLM ; aucun outil, plugin ou service payant. Accord CNDP (loi 09-08) obtenu par le propriétaire. |
| Sécurité | Périmètres de données par **département et fiche de poste**, appliqués dans Spring pour REST et MCP ; jeton délégué court RS256 ; audit de chaque appel d'outil (§ 5). |
| Premier usage | **Questions/réponses + vues pilotées** : l'agent répond avec des chiffres Spring et ouvre la vue partagée (Tabulaire, Cartes, Analytique) déjà filtrée (§ 6). |
| Interface immersive | **Espace IA** plein écran en plus du panneau latéral : conversation, surfaces **A2UI** composées depuis le catalogue Staport, vues pilotées et mascotte. Aucune génération de code d'interface. |
| Mascotte | Personnage animé **Rive** (State Machines), aux couleurs Staport et à l'univers du chantier, piloté par les événements AG-UI ; design final validé sur maquette (§ 6). |
| Orchestration | **Un agent, catalogue ciblé par domaine** : un petit modèle (tag `simple`) choisit les domaines de la question, seuls leurs outils partent vers le modèle `complex`. Les agents de domaine (sous-graphes sous un superviseur) viennent avec J8, quand le jeu de référence montre qu'un domaine a besoin de ses propres instructions, modèle ou budget ([conventions](../conventions/agents-ia.md#du-ciblage-par-domaine-aux-agents-de-domaine)). |
| Fournisseurs gratuits | Cumul des **offres gratuites à quota renouvelable**, un compte par fournisseur, quotas respectés (`rpm`/`tpm`) ; un modèle sans clé est désactivé au démarrage. Un modèle n'entre dans un pool qu'après une sonde outils + JSON réussie à travers la passerelle. NVIDIA NIM (prototypage) est dans les pools tant que les données sont synthétiques (jusqu'à J2) ; les préversions à sortie instable restent sous tags `eval`. |
| Inter-applications | **A2A** relie l'agent ERP-RH aux agents des autres applications de l'entreprise (autres départements, application IA d'entreprise). À l'intérieur d'ERP-RH, pas d'A2A. |
| Images et secrets | Chaque service a **sa propre image** (`erp-rh-<service>`) construite par la CI. Les clés vivent uniquement dans le `.env` racine unique (non versionné) ; les fichiers versionnés ne contiennent que des références `os.environ/…`. |

## 3. Architecture

```text
Angular ── panneau IA / Espace IA (A2UI + mascotte Rive) ── vues partagées existantes
   │  AG-UI : entrées HTTP, événements SSE              ▲ ViewSpec → route + filtres
   ▼                                                    │
erp-rh-ia (Python, LangGraph)
   │  graphe : ciblage des domaines → outils → rédaction → vérification des chiffres → réponse + ViewSpec + A2UI
   ├── erp-rh-litellm → fournisseurs (alias ai-gateway, tags de tâche)
   ├── A2A (plus tard) → agents des autres applications
   ▼  MCP + jeton délégué
erp-rh-backend (Spring) : adaptateurs MCP → façades de domaine → périmètre fiche de poste → audit
   ▼
PostgreSQL ERP (métier) · base LiteLLM dédiée (clés virtuelles, budgets) · plus tard corpus/pgvector
```

Les services IA tournent sous le profil Compose `ia` : la pile ERP actuelle reste inchangée tant
que ce profil n'est pas activé. Les checkpoints durables LangGraph arrivent avec les écritures (J6).

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
  les permissions filtrent. Avant tout envoi de données réelles à un fournisseur externe, revoir cette règle avec
  le choix du modèle (cible : modèle local).
- **LiteLLM.** Une clé virtuelle par application, jamais la clé master ; la clé d'ERP-RH porte
  `metadata.tags: ["!eval"]` (aucun modèle d'évaluation), une limite de débit et un budget. Port lié
  à `127.0.0.1` ou au seul réseau Docker interne. Cache de réponses désactivé.
- **Audit et exploitation.** Acteur humain, service délégué et corrélation
  `requestId/threadId/runId/toolCallId` pour chaque outil, sans jeton ni contenu RH dans les
  journaux. Interrupteur global de l'IA ; budgets par utilisateur et par poste ; plafonds d'étapes,
  de tokens et de durée par run. L'application reste entièrement utilisable sans IA.

## 6. Expérience

**Vues pilotées (ViewSpec).** Un outil renvoie, avec ses données, une description de vue : domaine,
vue, filtres, période, niveau de parcours. Schéma défini une fois (Pydantic → schéma JSON → types
Angular), validé des deux côtés ; Angular la traduit en route connue et ses gardes s'appliquent.

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
| J2 — Sécurité par fiche de poste | Périmètres Spring REST + MCP, projection salaire, catalogue filtré, budgets par poste | Tests négatifs verts ; porte avant tout utilisateur non administrateur | ⬜ |
| J3 — Pilote réel | RH/paie puis direction ; fournisseurs payants sans entraînement ; retours 👍/👎 vers le jeu de référence ; suivi coûts/latence | Accord CNDP consigné ; seuils validés et atteints | ⬜ |
| J4 — Expérience immersive | Espace IA, catalogue A2UI Staport, mascotte Rive complète | Parcours réel vérifié au navigateur, accessibilité et mouvement réduit | ⬜ |
| J5 — Contrôle de la paie | Règles d'anomalies dans l'assistant d'import, puis détection statistique ; l'agent explique, l'humain décide | Anomalies connues retrouvées sur imports historiques | ⬜ |
| J6 — Documents RH | Attestations, certificats, contrats de chantier ; première écriture (diff, approbation, idempotence, checkpoints durables) | Pas de double effet après crash ; approbation expirée refusée | ⬜ |
| J7 — Assistant réglementaire | Corpus versionné (Code du travail, CNSS/AMO, barème IR par loi de finances, procédures) ; plein texte puis hybride pgvector | Citations vérifiées, abstention hors corpus | ⬜ |
| J8 — Autres départements et A2A | Catalogue MCP, périmètres et jeu de référence par module ; A2A entre applications | Mêmes portes que J1–J3 par module | ⬜ |
| J9 — Terrain et voix | Mobile chef de chantier, voix FR/darija, mascotte parlante ; avec le domaine Pointage | Parcours mobile vérifié, transcription corrigible | ⬜ |

### Tâches de J1

| Tâche | Contenu | Critère de sortie | État |
|---|---|---|---|
| T1 — LiteLLM | Dossier `litellm/` versionné sans secret : image `erp-rh-litellm` (version et digest épinglés, configuration intégrée), base dédiée, service Compose sous le profil `ia`, variables dans le `.env` racine | Image construite ; passerelle prête sur une pile jetable ; pools lus par `test_providers.py --list` | ✅ |
| T2 — Service IA | `ia/` : projet Python (`uv`, Pydantic Settings, `ruff`, `pyright`, `pytest`), santé HTTP, client LiteLLM, image `erp-rh-ia` non privilégiée | Lint, typage et tests verts ; image construite ; `/health` répond | ✅ |
| T3 — MCP Python | Le client MCP Python officiel rejoue les scénarios de la preuve J0 contre le serveur Java | Mêmes scénarios verts que le client TypeScript | ✅ |
| T4 — Identité MCP | Jeton délégué RS256 + JWKS dans Spring ; route MCP réelle protégée | Mauvaise audience, émetteur, signature ou expiration refusés | ✅ |
| T5 — Outils de lecture | Indicateurs de paie, recherche/comptage d'employés, entrées et sorties, fiche chantier ; ViewSpec ; projection salaire | Tests de contrat, refus et masquage | ✅ |
| T6 — Graphe et exactitude | Graphe LangGraph, vérificateur de chiffres, jeu de référence synthétique | Exactitude mesurée et rapportée | ✅ |
| T7 — AG-UI | Point d'entrée AG-UI du service ; événements d'outils, de confirmation et de mascotte | Flux réel testé avec un client AG-UI | ⬜ |
| T8 — Panneau Angular | Panneau en streaming, sources, bouton « Ouvrir la vue » | Parcours vérifié au navigateur | ⬜ |
| T9 — Démonstration J1 | Navigateur → agent → MCP → Spring sur base synthétique | Démonstration présentée au propriétaire | ⬜ |

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

## 8. État technique

| Élément | État |
|---|---|
| Preuve MCP | Serveur SDK Java `mcp-core` + `mcp-json-jackson3` 2.1.0 sur Java 21 / Spring Boot 4.1.1 ; clients TypeScript `@modelcontextprotocol/sdk` 1.32.1 et Python `mcp` 2.3.0 ; protocole **2025-11-25**, Streamable HTTP. Profil Maven `mcp-compatibility`, portée test uniquement ; voir le [README du prototype](../scripts/ia/mcp-compatibility/README.md). |
| LiteLLM | Image `erp-rh-litellm` (LiteLLM v1.104.2 épinglé par digest), base dédiée `litellm-db`, profil Compose `ia`. Fournisseurs actifs : Gemini, Groq, Mistral Experiment, Cloudflare, OpenRouter `:free`, Z.ai Flash, NVIDIA NIM. Pool `complex` : Gemini 3.8 Flash, Mistral Medium, NVIDIA MiniMax M3.1 Flash, Nemotron 3 Ultra, Nemotron 3.5 Super VL, Cloudflare gpt-oss-120b. Candidats suivants (gratuits, renouvelables) : SambaNova (20 req/jour par modèle, sans carte), OVHcloud AI Endpoints anonyme (2 req/min), Cohere (1 000 appels/mois, évaluation), LLM7 (100 K tokens/jour). Écartés : GitHub Models (retiré), Hugging Face (plus de crédit gratuit), Cerebras (aucune inférence gratuite), DeepSeek (aucun palier gratuit), Alibaba Model Studio (quota unique de 90 jours), SiliconFlow international, Chutes, Kluster. Voir [`litellm/README.md`](../litellm/README.md). |
| Service IA | Image `erp-rh-ia` (Python 3.13), santé, client LiteLLM, agent LangGraph avec ciblage par domaine, vérificateur de chiffres et évaluation (T6) ; AG-UI à venir (T7). Voir [`ia/README.md`](../ia/README.md). |
| Code IA dans l'application | Route `/mcp` sans état (SDK Java 2.1.0) derrière `MCP_ENABLED`, chaîne de sécurité dédiée, jeton agent `POST /auth/jetons/agent`, JWKS `GET /.well-known/jwks.json`, permission `IA_UTILISER` (V36, `SYSTEM_ADMIN` seulement). Catalogue de 25 outils en lecture (ci-dessous). Aucun panneau Angular. Détails : [Auth](auth/README.md#jeton-délégué-de-lassistant-ia). |
| CI et production | Job `ia` et publication de `erp-rh-litellm` / `erp-rh-ia` ajoutés à la CI ; exécution distante sur demande du propriétaire ; rien de déployé. |

### Catalogue MCP

Chaque outil exige `IA_UTILISER` (route) et la permission de son domaine (revérifiée à chaque appel), lit uniquement les façades publiques des domaines, journalise l'appel (`LECTURE_METIER`, canal `MCP`) et renvoie une `vue` (§ 6). Annotations MCP : lecture seule, idempotent, monde fermé. Un identifiant inconnu rend « Élément introuvable ».

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
3. Ne jamais toucher au port 4200 ni à la pile Docker `erp-rh-*` du propriétaire ; aucune donnée
   réelle vers un modèle avant J3.
4. Toute nouvelle décision s'inscrit au § 2. Aucun autre document IA n'est créé : celui-ci les
   remplace.
