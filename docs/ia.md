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
| Données envoyées aux modèles | Développement : **données synthétiques uniquement** (les clés actuelles sont des paliers gratuits). Données réelles : fournisseurs payants sans entraînement sur les requêtes, à partir de J3. Accord CNDP (loi 09-08) obtenu par le propriétaire ; référence et date consignées avant J3. |
| Sécurité | Périmètres de données par **département et fiche de poste**, appliqués dans Spring pour REST et MCP ; jeton délégué court RS256 ; audit de chaque appel d'outil (§ 5). |
| Premier usage | **Questions/réponses + vues pilotées** : l'agent répond avec des chiffres Spring et ouvre la vue partagée (Tabulaire, Cartes, Analytique) déjà filtrée (§ 6). |
| Interface immersive | **Espace IA** plein écran en plus du panneau latéral : conversation, surfaces **A2UI** composées depuis le catalogue Staport, vues pilotées et mascotte. Aucune génération de code d'interface. |
| Mascotte | Personnage animé **Rive** (State Machines), aux couleurs Staport et à l'univers du chantier, piloté par les événements AG-UI ; design final validé sur maquette (§ 6). |
| Inter-applications | **A2A** relie l'agent ERP-RH aux agents des autres applications de l'entreprise (autres départements, application IA d'entreprise). À l'intérieur d'ERP-RH, pas d'A2A. |
| Images et secrets | Chaque service a **sa propre image** (`erp-rh-<service>`) construite par la CI. Les clés vivent uniquement dans le `.env` racine unique (non versionné) ; les fichiers versionnés ne contiennent que des références `os.environ/…`. |

## 3. Architecture

```text
Angular ── panneau IA / Espace IA (A2UI + mascotte Rive) ── vues partagées existantes
   │  AG-UI : entrées HTTP, événements SSE              ▲ ViewSpec → route + filtres
   ▼                                                    │
erp-rh-ia (Python, LangGraph)
   │  graphe : intention → outils → vérification des chiffres → réponse + ViewSpec + surface A2UI
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
4. Un jeu de référence versionné (≈ 100 questions RH au départ, réponses calculées sur la base
   synthétique) est rejoué à chaque changement de modèle, prompt, outil ou graphe. Il décide des
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
- **Minimisation.** Agrégats et identifiants d'abord ; noms seulement si la question l'exige et que
  l'utilisateur y a droit.
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
| T6 — Graphe et exactitude | Graphe LangGraph, vérificateur de chiffres, jeu de référence synthétique | Exactitude mesurée et rapportée | ⬜ |
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

## 8. État technique

| Élément | État |
|---|---|
| Preuve MCP | Serveur SDK Java `mcp-core` + `mcp-json-jackson3` 2.1.0 sur Java 21 / Spring Boot 4.1.1 ; clients TypeScript `@modelcontextprotocol/sdk` 1.32.1 et Python `mcp` 2.3.0 ; protocole **2025-11-25**, Streamable HTTP. Profil Maven `mcp-compatibility`, portée test uniquement ; voir le [README du prototype](../scripts/ia/mcp-compatibility/README.md). |
| LiteLLM | Image `erp-rh-litellm` (LiteLLM v1.104.2 épinglé par digest), base dédiée `litellm-db`, profil Compose `ia`. Fournisseurs configurés : Gemini, Groq, Cloudflare, OpenRouter (paliers gratuits) ; Mistral, Cerebras et NVIDIA sans clé. Clé virtuelle ERP-RH à créer au premier démarrage. Voir [`litellm/README.md`](../litellm/README.md). |
| Service IA | Image `erp-rh-ia` (Python 3.13), santé et client LiteLLM ; graphe, outils et AG-UI à venir (T4–T7). Voir [`ia/README.md`](../ia/README.md). |
| Code IA dans l'application | Route `/mcp` sans état (SDK Java 2.1.0) derrière `MCP_ENABLED`, chaîne de sécurité dédiée, jeton agent `POST /auth/jetons/agent`, JWKS `GET /.well-known/jwks.json`, permission `IA_UTILISER` (V36, `SYSTEM_ADMIN` seulement). Catalogue de 6 outils en lecture (ci-dessous). Aucun panneau Angular. Détails : [Auth](auth/README.md#jeton-délégué-de-lassistant-ia). |
| CI et production | Job `ia` et publication de `erp-rh-litellm` / `erp-rh-ia` ajoutés à la CI ; exécution distante sur demande du propriétaire ; rien de déployé. |

### Catalogue MCP

Chaque outil exige `IA_UTILISER` (route) et la permission de son domaine (revérifiée à chaque appel), lit uniquement
la façade du domaine, journalise l'appel (`LECTURE_METIER`, canal `MCP`) et renvoie une `vue` (§ 6) aux paramètres
d'URL des vues partagées. Annotations MCP : lecture seule, idempotent, monde fermé.

| Outil | Permission | Arguments | Rend | Vue proposée |
|---|---|---|---|---|
| `systeme_identite` | — | aucun | Utilisateur et autorités effectives | — |
| `paie_indicateurs` | `PAIE_READ` | `periode` (défaut : dernier mois importé), `chantierIds`, `equipeIds`, `fonctionIds` | Masse, effectif payé, coût moyen, STC ; mois précédent ; 5 principaux chantiers | `paie` / `analytique` |
| `employes_compter` | `EMPLOYEE_READ` | `chantierIds`, `equipeIds`, `fonctionIds`, `statut` (`EN_POSTE`, `SORTI`) | Effectif, en poste, sortis, âge et ancienneté moyens, embauches 12 mois, tranches | `employees` / `analytique` |
| `employes_rechercher` | `EMPLOYEE_READ` | `nom`, périmètre, `statut`, `limite` (≤ 20) ; au moins un critère | Fiches sans CIN ni date de naissance ; salaire avec `PAIE_READ` seulement | `employees` / `tabulaire` |
| `employes_sorties` | `EMPLOYEE_READ` | `periode` (défaut : dernier mois importé) | Nombre de départs, par motif ; 20 noms au plus | `employees` / `tabulaire` (`statut=INACTIF`) |
| `chantier_fiche` | `CHANTIER_READ` | `recherche` (code ou désignation) | 5 chantiers : identifiant, code, désignation, `EN_COURS` / `CLOTURE` | `chantiers` / `tabulaire` |

## 9. Reprise

1. Lire `AGENTS.md`, le [handoff général](handoff/etat-du-projet.md), ce document et les conventions
   IA ; vérifier branche, `git status` et derniers commits.
2. Reprendre la première tâche ⬜ du § 7 ; la passer en 🟦, puis en ✅ avec une ligne de journal
   quand son critère de sortie est prouvé.
3. Ne jamais toucher au port 4200 ni à la pile Docker `erp-rh-*` du propriétaire ; aucune donnée
   réelle vers un modèle avant J3.
4. Toute nouvelle décision s'inscrit au § 2. Aucun autre document IA n'est créé : celui-ci les
   remplace.
