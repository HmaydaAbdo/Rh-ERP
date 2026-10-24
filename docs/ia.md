# IA dans ERP-RH — document unique

**Mis à jour : 2026-10-24.** Ce document est la seule référence du chantier IA : décisions,
architecture, feuille de route, état et reprise. Les règles réutilisables restent dans les
conventions ([agents-ia](../conventions/agents-ia.md), [mcp](../conventions/mcp.md),
[agent-ui](../conventions/agent-ui.md), [rag](../conventions/rag.md),
[integrations](../conventions/integrations.md)) ; ce document dit comment ERP-RH les applique.

**État en une ligne :** décisions de cadrage prises par le propriétaire le 2026-10-24 ; seule la
preuve de compatibilité MCP (J0) existe dans le code, en profil de test isolé ; aucune route MCP
métier, aucun appel de modèle, aucune interface IA livrés. **Prochaine action : J1.**

## 1. Objectif

Rendre l'IA utile à **tous les utilisateurs** d'une entreprise BTP marocaine de classe S, en
commençant par la partie RH de l'ERP, puis en couvrant chaque département (achats, matériel,
finance…) avec le même socle. L'IA aide à comprendre, retrouver, contrôler et préparer ; elle ne
devient jamais la source des chiffres, des droits ou des décisions métier.

## 2. Décisions du propriétaire (2026-10-24)

| Sujet | Décision |
|---|---|
| Méthode | **Tranche verticale** : un cas d'usage complet navigateur → agent → MCP → Spring, en lecture seule sur données de développement, puis durcissement avant les données réelles. Validation par jalon. |
| Premier cas d'usage | **Questions/réponses et vues pilotées** (§ 6). Tous les autres cas suivent : contrôle de la paie, documents RH, assistant réglementaire, terrain. |
| Utilisateurs | **Tout le monde**, d'où une sécurité par **département** et par **fiche de poste** (§ 5) avant d'ouvrir l'IA au-delà du pilote. |
| Modèles | **LiteLLM** devant plusieurs fournisseurs ; seuls des modèles performants (exactitude, latence, absence d'invention) sont retenus, **choisis sur notre jeu de référence** (§ 4). |
| Données personnelles | Le propriétaire indique disposer de l'accord CNDP (loi 09-08). Sa référence et sa date sont à consigner ici avant le pilote réel (J3). |
| Langage de la couche IA | **Python** (§ 3), décision prise sur recommandation après comparaison avec TypeScript. |
| Métier | Spring reste propriétaire des données, transactions, règles, permissions et audits. Pas de Spring AI, LangChain4j ou LangGraph4j dans le monolithe. |

## 3. Pourquoi Python plutôt que TypeScript

| Critère | Python | TypeScript |
|---|---|---|
| Orchestration | LangGraph Python : implémentation de référence, nouveautés en premier | LangGraph.js : suit avec retard |
| Besoins futurs du plan | Détection d'anomalies de paie (statistiques, ML), extraction de documents et OCR (textes réglementaires, PDF scannés FR/AR), voix et darija, évaluations RAG : écosystème dominant | Possible, mais bibliothèques moins nombreuses ou appelées en service externe |
| Protocoles | SDK MCP officiel, AG-UI côté serveur disponibles | Disponibles |
| Cohérence avec Angular | Contrats partagés par schéma JSON généré | Mêmes types partagés directement |
| Coût pour une équipe d'une personne | Un langage de plus, limité au service IA | Langage déjà connu par le frontend |

**Décision : Python** pour le service IA. Les jalons J4 à J7 (ML, OCR, voix, RAG) reposent sur
l'écosystème Python ; choisir TypeScript reviendrait à ajouter Python plus tard en service
annexe, donc deux runtimes IA au lieu d'un. Le coût d'un langage supplémentaire est contenu :
Python reste confiné au service IA, typé strictement, avec un outillage reproductible.

Socle Python (versions exactes vérifiées et verrouillées en J1) : version stable supportée de
CPython, `uv` et son lockfile, Pydantic v2 pour tous les contrats, `ruff`, `pyright` en mode strict,
`pytest`. Serveur HTTP ASGI pour le point d'entrée AG-UI, LangGraph pour le graphe, client MCP
officiel, OpenTelemetry. Le service appelle les modèles uniquement par LiteLLM.

La preuve J0 (client MCP TypeScript contre le serveur Java) reste valable : elle établit que le
serveur Spring parle MCP. J1 ajoute la même preuve avec le client Python.

## 4. Architecture cible

```text
Angular (panneau IA + vues partagées existantes)
   │  AG-UI : entrées HTTP, événements SSE          ▲ ViewSpec → route + filtres → Tabulaire / Cartes / Analytique
   ▼                                                │
Service IA Python (LangGraph)
   │  graphe : intention → outils → vérification des chiffres → réponse + ViewSpec
   ├── LiteLLM : alias par rôle, secours entre fournisseurs, budgets par poste
   ▼  MCP (Streamable HTTP) + jeton délégué court
Spring : adaptateurs MCP → façades de domaine → périmètre de la fiche de poste → audit
   ▼
PostgreSQL : données métier · schéma ia (conversations, retours, coûts) · plus tard corpus/pgvector
```

Frontières :

- Angular continue d'utiliser les API REST pour ses écrans ; seul le panneau IA parle AG-UI.
- Le service IA ne lit aucune table métier et n'a pas de client REST métier : tout passe par MCP.
- Pas de runtime Node intermédiaire. J1 vérifie si le client Angular CopilotKit se connecte
  directement à l'agent Python AG-UI ; sinon, le client AG-UI officiel est intégré à un panneau
  Staport. Aucun composant React ni PrimeNG.
- Les checkpoints durables LangGraph n'arrivent qu'avec les écritures (J5) ; avant, l'historique
  de conversation suffit.

### Exactitude : « pas d'invention » garanti par l'architecture

Aucun modèle ne garantit l'absence d'erreur ; ces mécanismes la garantissent pour les chiffres :

1. **Le modèle ne calcule jamais.** Effectifs, montants, taux et périodes viennent des outils Spring.
2. **Vérificateur de chiffres.** Avant affichage, chaque nombre et chaque période de la réponse doit
   figurer dans les résultats d'outils du run. Sinon, la réponse est régénérée une fois, puis
   remplacée par une abstention explicite.
3. **Abstention.** Sans outil ni source adaptés, l'assistant le dit et propose l'écran classique.
4. **Jeu de référence versionné** (≈ 100 questions RH au départ, réponses calculées sur la base de
   développement) rejoué à chaque changement de modèle, de prompt ou d'outil. Les modèles de
   LiteLLM sont choisis et remplacés selon ce jeu : exactitude, latence p95, coût.
5. **Sorties structurées** validées par Pydantic côté service et par schéma côté Angular.

## 5. Sécurité

### Fiches de poste et périmètres de données

Aujourd'hui, le RBAC dit **quelle action** est permise (27 permissions `DOMAINE_ACTION`), jamais
**sur quelles données**. Ouvrir l'IA à tous exige un périmètre :

- Département → fiche de poste → rôles et permissions + **périmètre de données** (par exemple
  chantiers, équipes, département, ou « tous »). Un utilisateur occupe une fiche de poste.
- Le périmètre est appliqué **dans Spring, au niveau des requêtes**, de la même façon pour REST et
  MCP. L'écran classique en bénéficie aussi.
- Le masquage du salaire sort du `EmployeeController` pour devenir une politique de projection du
  domaine, réutilisée par REST et MCP (`EMPLOYEE_READ` sans `PAIE_READ` ne révèle ni salaire, ni
  tri, ni agrégat salarial).
- Le modèle exact (entités, migration, écrans d'administration) est un choix d'architecture à
  présenter et valider au lancement de J2.

### Identité de l'agent

- Spring émet, pour l'utilisateur connecté, un **jeton délégué court signé RS256** (clé publique
  JWKS), d'audience `mcp`, avec des scopes réduits. Le `JWT_SECRET` HS256 n'est jamais partagé.
- Le serveur MCP revalide émetteur, audience, expiration, permissions et périmètre **à chaque appel** ;
  un `userId` fourni en argument n'a aucune valeur.
- Le catalogue d'outils proposé au modèle est filtré par droits ; le filtrage n'est pas la
  sécurité, le refus serveur l'est.

### Minimisation et données personnelles

Même avec l'accord CNDP : les outils renvoient d'abord des agrégats et des identifiants ; les noms
ne sont envoyés au modèle que lorsque la question les exige et que l'utilisateur y a droit.
Données RH réelles : uniquement des offres payantes sans entraînement sur les requêtes et à
conservation minimale. Les quotas gratuits et les comptes multiples chez un même fournisseur pour
cumuler des quotas sont exclus (conditions d'utilisation, entraînement sur les données).

### Audit et exploitation

Chaque appel d'outil est audité avec l'acteur humain, le service délégué et la corrélation
`requestId/threadId/runId/toolCallId`, sans jeton ni contenu RH dans les journaux. Interrupteur
global de l'IA, budgets par utilisateur et par poste, limites de durée, d'étapes et de tokens par
run. L'application reste entièrement utilisable sans IA.

## 6. Vues pilotées (ViewSpec)

L'IA ne génère pas d'écrans : elle **pilote les vues partagées existantes** (coque, Tabulaire,
Cartes, Analytique — ADR 0011, 0012, 0014). Un outil renvoie, à côté de ses données, une
`ViewSpec` : domaine, vue, filtres, période, niveau de parcours. Son schéma est défini une fois
(Pydantic → schéma JSON → types Angular) et validé des deux côtés. Angular la traduit en route et
paramètres connus ; les gardes et permissions existantes s'appliquent. Exemple : « masse salariale
du chantier X par rapport à août » → réponse chiffrée + bouton « Ouvrir dans Analytique » déjà filtré.

## 7. Feuille de route

| Jalon | Contenu | Critère de sortie |
|---|---|---|
| **J0 — Socle** ✅ | Preuve MCP Java ↔ client TypeScript ; décisions du § 2 ; ce document | Fait (§ 8) |
| **J1 — Tranche verticale** | Serveur MCP Spring avec 4 outils de lecture sur les façades analytiques (indicateurs de paie par périmètre et période, recherche/comptage d'employés, entrées et sorties, fiche chantier) renvoyant données + ViewSpec ; jeton délégué minimal ; service Python (graphe, LiteLLM, client MCP) ; panneau Angular en streaming avec ouverture de la vue pilotée ; jeu de référence et vérificateur de chiffres | Démonstration de bout en bout sur données de dev ; exactitude mesurée sur le jeu de référence ; refus serveur testés |
| **J2 — Sécurité par fiche de poste** | Périmètres de données dans Spring (REST + MCP), projection salaire du domaine, catalogue filtré, audit des outils, budgets par poste | Tests négatifs verts : autre chantier, salaire sans `PAIE_READ`, droit révoqué en cours de conversation. Porte obligatoire avant tout utilisateur non administrateur |
| **J3 — Pilote réel** | Service RH/paie puis direction, données réelles, fournisseurs payants sans entraînement, retour 👍/👎 avec correction alimentant le jeu de référence, suivi coûts/latence | Accord CNDP consigné ; seuils d'exactitude, de latence et de coût validés par le propriétaire et atteints |
| **J4 — Contrôle de la paie** | Règles d'anomalies déterministes dans l'assistant d'import (saut de salaire, doublon, mutation suspecte, STC inhabituel), puis détection statistique ; le modèle explique et priorise, l'humain décide | Anomalies connues détectées sur des imports historiques ; aucun blocage automatique sans règle validée |
| **J5 — Documents RH** | Brouillons d'attestations, certificats, contrats de chantier avec le moteur PDF existant ; première écriture : diff, approbation liée à l'action, idempotence, checkpoints durables | Pas de double effet après crash ; approbation expirée ou droit révoqué refusés |
| **J6 — Assistant réglementaire** | Corpus versionné (Code du travail, CNSS/AMO, barème IR par loi de finances, procédures internes) ; plein texte d'abord, hybride pgvector si gain mesuré ; citations et abstention | Citations vérifiées, sources retirées inaccessibles, abstention sur question hors corpus |
| **J7 — Terrain** | Chefs de chantier sur mobile, voix FR/darija ; avec le futur domaine Pointage | Parcours mobile vérifié ; transcription visible et corrigible |
| **J8+ — Autres départements** | Chaque module apporte son catalogue MCP, ses périmètres et son jeu de référence ; sous-agents par département seulement si le contexte l'exige | Mêmes portes que J1–J3 par module |

Repoussé tant qu'un besoin mesuré ne l'impose pas : A2UI et surfaces déclaratives, interface
générée (interdite sans ADR), mascotte, Langfuse (OpenTelemetry d'abord), GraphRAG/Neo4j, A2A.

## 8. État actuel

| Élément | État |
|---|---|
| Preuve MCP (J0) | SDK Java `mcp-core` + `mcp-json-jackson3` 2.1.0 sur Java 21 / Spring Boot 4.1.1, client TypeScript `@modelcontextprotocol/sdk` 1.32.1 ; protocole **2025-11-25** négocié en Streamable HTTP ; 10 scénarios client et un test Java verts en local. Profil Maven `mcp-compatibility`, dépendances de portée test uniquement ; commandes dans le [README du prototype](../scripts/ia/mcp-compatibility/README.md) |
| Code IA applicatif | Aucun : pas de route MCP métier, de service Python, de modèle ni de panneau |
| CI | Le profil MCP et son SBOM de test sont dans la CI ; exécution distante sur demande du propriétaire |
| Production | Rien de déployé |

## 9. Reprise et règles de travail

1. Lire `AGENTS.md`, le [handoff général](handoff/etat-du-projet.md), ce document et les
   conventions IA ; vérifier branche, `git status` et derniers commits.
2. Travailler jalon par jalon ; un jalon se termine par une démonstration, ses tests et la mise à
   jour du § 8. Le propriétaire valide le jalon avant le suivant.
3. Ne jamais toucher au port 4200 ni à la pile Docker du propriétaire ; aucune donnée réelle avant J3.
4. Consigner ici toute nouvelle décision (date, choix, réserve). Ne pas recréer de documents IA
   parallèles : ce fichier les remplace.
