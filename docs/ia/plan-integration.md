# Plan d’intégration IA en quatre phases

**Version du 2026-10-23 — proposition à valider avant implémentation.**
Orientation : [ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md).
État et prochaine action : [handoff](../handoff/integration-ia.md).

## Mode de travail et définition de terminé

Le lot documentaire P0 est réalisé sur `codex/integration-ia-mcp-rag`. Les phases P1 à P4 sont
**non commencées**. Les phases sont des dépendances de réalisation, pas une promesse de délai.
Après choix du pilote, estimer chaque lot à partir du spike et des moyens disponibles ; ne pas
annoncer une date de production avant ces mesures.

Pour chaque lot : lire conventions, README/skill/RBAC du domaine ; réaliser le plus petit parcours
complet ; vérifier compilation, contrats, tests utiles et comportement réel ; synchroniser les
docs ; consigner commit, commandes, résultats, risques et prochaine action dans le handoff.
Une ligne n’est terminée que si ses preuves sont accessibles. Un test simulé, une intégration
locale, une CI et un contrôle de production sont consignés séparément.

Les changements importants suivent l’approbation d’architecture d’`AGENTS.md`. Les actions de
production suivent les règles de déploiement ; ce plan n’autorise aucun changement du Docker du
propriétaire, aucun remplacement de son serveur sur 4200 et aucune écriture sur une base réelle.

## P0 — conventions, cadrage et décisions

| ID | Livrable | État / sortie |
|---|---|---|
| P0.1 | Audit du code et stress-test des neuf piliers | Documenté dans [analyse-architecture.md](analyse-architecture.md) |
| P0.2 | Conventions adaptées à la séparation Java/TypeScript et aux protocoles selon besoin | Documentation seulement ; pas de dépendance ajoutée |
| P0.3 | ADR, feuille de route, conception RAG et registre de reprise | Préparés pour revue propriétaire |
| P0.4 | Accord initial sur périmètre, limites et spikes isolés ; registre des décisions D1–D8 | En attente ; autorise les explorations, pas l’exposition d’une solution non approuvée |

Le propriétaire choisit le premier utilisateur et le corpus, puis fixe avec l’équipe les limites
de l’expérimentation. Cet accord initial autorise les spikes sur données synthétiques. Les
choix définitifs sont arrêtés après leurs preuves : D2/D3 avant exposition MCP, D5/D6 avant
persistance applicative, D4 après le spike d’interface, D7 avant appel de modèle et D8 avant
présentation avancée. La classification est vérifiée ; ne pas supposer une base fictive.

## Phase 1 — serveur MCP Spring et identité

**Objectif :** un client de test authentifié exécute une lecture bornée, autorisée et auditée dans
Spring, sans LLM et sans nouvelle règle métier.

| Lot | Travail concret | Dépend de | Critères de sortie | Responsable de réalisation |
|---|---|---|---|---|
| P1.1 | Spike SDK Java officiel : BOM/modules JSON/transport Servlet, matrice protocole/client ; verrouiller versions et licences après essai | P0.4 | Compilation Boot4/Java21, vraie découverte et appel depuis client TS, pas de Spring AI ni préversion non approuvée | Backend / plateforme |
| P1.2 | Comparer les options d’identité autorisées au spike, faire valider D2, puis implémenter audiences, émetteur, scopes, rotation, révocation et découverte OAuth | P0.4, P1.1 ; D2 avant implémentation retenue | Mauvaise audience/émetteur/signature/expiration refusés, secret HS256 non partagé, identité humaine vérifiée | Sécurité / backend |
| P1.3 | Catalogue initial explicite, un outil de lecture candidat `chantier_lire_fiche` sous `CHANTIER_READ` ; nom et contrat à confirmer avec le domaine | D1, P1.2 | Schémas typés, absence de repository inter-domaine, champs minimaux, pagination/tailles/délais bornés | Domaine Chantier |
| P1.4 | Couverture autorisation et projection de champs de tous les outils exposés ; vérifier aussi ressources, découverte et artefacts | P1.3 | Tests appel direct sans permission, refus individuel, cas salaire `EMPLOYEE_READ` sans `PAIE_READ` avant tout outil Employé | Sécurité / domaines |
| P1.5 | Adaptation audit MCP : identité humaine/service, corrélation, lectures sensibles, refus, erreurs expurgées et santé du journal | P1.3 | Succès/refus/échec traçables sans jetons ni données RH dans les logs ; audit métier préservé | Audit / backend |
| P1.6 | Transport et exploitation isolés : TLS, Origin/CORS, hôtes autorisés, limites, timeouts, propagation de corrélation | P1.1–P1.5 | Test client réel à travers proxy, panne et annulation ; application REST inchangée fonctionnellement | Plateforme |

Les noms de routes MCP et des outils ci-dessus sont des **candidats**, pas une API déjà publiée.
Les en-têtes de contexte ne sont pas une autorité. Le serveur reconstruit l’identité validée et
ne fait pas confiance à un `userId` fourni dans les arguments JSON.

La découverte utilise les capacités et schémas de la révision MCP choisie. Le runtime autorise
une liste de serveurs et d’outils ; une description d’outil modifiée est validée avant usage. Le
cache de catalogue est versionné, borné et invalidé au changement/à expiration. Les permissions
sont revérifiées à chaque appel, même si l’outil apparaît dans un ancien catalogue.

**Porte G1 :** D1–D3 confirmés après les spikes, vrais échanges MCP Java/TS, sécurité et audit verts. Aucun accès modèle à la base
métier. Aucune dépendance envers la future interface ou une mémoire vectorielle.

## Phase 2 — LangGraph.js, client MCP et reprise durable

**Objectif :** exécuter un graphe de lecture explicite, borné et repris après arrêt du processus.

| Lot | Travail concret | Dépend de | Critères de sortie | Responsable |
|---|---|---|---|---|
| P2.1 | Créer le composant Node/TypeScript isolé et son build/CI ; dépendances verrouillées, Zod, configuration typée, conteneur non privilégié | G1, D5 | Installation reproductible, typecheck/tests, healthcheck ; aucune clé fournisseur dans Angular | Runtime / plateforme |
| P2.2 | Brancher client MCP SDK et délégation, découverte et filtrage du catalogue ; passerelle LiteLLM existante en convention à déployer/valider séparément | P2.1, D7 | Appel réel de l’outil P1 sans client REST métier parallèle, refus sûrs et indisponibilité compréhensible | Runtime / sécurité |
| P2.3 | Graphe `entrée → intention → outil/recherche → validation → réponse` avec routes explicites et états d’échec ; aucune boucle opaque | P2.2 | Sorties Zod, plafond d’étapes/outils/tokens/durée ; aucun retry d’un refus d’autorisation | Runtime |
| P2.4 | Spike isolé du saver/migrations, validation D6, puis `PostgresSaver` durable ; identité du thread, versions et concurrence | P2.3 ; D6 avant persistance applicative retenue | Runtime sans DDL, restart sur autre processus, threads isolés, deux reprises ne créent pas deux runs actifs | Runtime / données |
| P2.5 | Interruptions et reprise après identité renouvelée ; garder approbations/budgets/résultats en état structuré | P2.4 | Jeton expiré, droits révoqués, ancienne version du graphe ou approbation périmée entraînent pause/refus sûr | Runtime / sécurité |
| P2.6 | Harnais de panne et observabilité : trace des nœuds, appels, coût, timeouts, fournisseur indisponible et saturation | P2.3–P2.5 | Rapport reproductible, labels bornés, aucun raisonnement interne ou prompt sensible journalisé | Qualité / plateforme |

Premier graphe en lecture seule : l’interruption peut servir à demander une précision ou une
confirmation de périmètre. Les écritures restent désactivées. Leur extension ultérieure exigera
un lot séparé : diff prévisualisé, approbation liée à l’action et à la version, contrôle métier,
idempotence côté Spring et réconciliation après résultat incertain.

Une exception Java devient une erreur d’outil catégorisée, jamais une stacktrace dans le modèle.
Corriger seulement les erreurs de syntaxe/validation jugées récupérables ; limiter tentatives et
budget commun. Une erreur métier, un `403` ou un conflit de version ne déclenche pas une stratégie
pour contourner le contrôle.

**Porte G2 :** même run repris après crash sur un autre processus, aucun secret persisté, aucun
accès interutilisateur et aucune exécution illimitée. Le saver est testé sur vrai PostgreSQL.

## Phase 3 — CopilotKit Runtime, AG-UI et Angular

**Objectif :** un utilisateur voit une réponse utile et ses sources dans le panneau contextuel,
peut interrompre et reprendre sans perdre le contrôle de l’interface.

| Lot | Travail concret | Dépend de | Critères de sortie | Responsable |
|---|---|---|---|---|
| P3.1 | Spike CopilotKit Runtime + LangGraph.js embarqué + SDK Angular officiel ; confronter versions/release/peer dependencies, puis faire valider D4 | G2, accord initial P0.4 | Flux réel jusqu’au navigateur Angular22/TS6 zoneless, build et licences ; repli AG-UI documenté si incompatibilité | Runtime / frontend |
| P3.2 | Flux AG-UI authentifié : entrées HTTP et réponses SSE, refresh d’identité sans jeton en URL, corrélation et annulation | P3.1 | Déconnexion, `401`, navigation/destruction du composant, client lent et événements tardifs correctement traités | Frontend / sécurité |
| P3.3 | Panneau Staport ; texte, source, tableau borné et état d’outil, catalogue d’actions/types validés | P3.2 | Pas de template/code/URL arbitraire, aucune donnée masquée seulement visuellement ; composants existants réutilisés | Frontend / design |
| P3.4 | Reconnexion explicite : état durable réautorisé, snapshot/delta selon contrat, déduplication et nettoyage des souscriptions | P3.2 | Pas de double run au retour réseau ; aucun statut affiché comme succès avant résultat serveur | Frontend / runtime |
| P3.5 | Vérification réelle mobile/clavier/focus/lecteur d’écran, thèmes, mouvement réduit, repli texte et IA indisponible | P3.3–P3.4 | Parcours Playwright/axe puis revue visuelle ; parcours métier existants utilisables sans IA | Qualité / frontend |
| P3.6 | A2UI/Rive si le séquencement D8 est approuvé : adaptateurs, schémas, assets, budgets et fallback | Validation D8, P3.5 | Contrats compatibles et absence de régression d’accessibilité/poids ; facultatif pour usage texte | Frontend |

Les événements visibles sont « recherche en cours », « outil terminé », « confirmation requise »
ou une réponse vérifiable. Les pensées internes du modèle et prompts système ne sont pas streamés.
SSE est un flux serveur vers client ; les messages et annulations utilisent l’entrée du runtime.
Pas de polling de progression. Une reconnexion peut récupérer une fois un état autorisé ; elle
ne relance pas une commande métier.

Configurer le proxy pour ce flux précis : buffering, compression et délais compatibles, heartbeat,
taille et fréquence bornées, arrêt à la déconnexion selon la politique du run. HTTP/2 est vérifié
sur les segments qui le supportent ; aucune compatibilité n’est présumée de bout en bout.

**Porte G3 :** scénario navigateur → runtime réel → MCP réel → PostgreSQL synthétique et audit,
avec permissions distinctes. Les mocks de composant ne remplacent pas ce full stack.

## Phase 4 — RAG, mémoire stratifiée, pgvector et compactage

**Objectif :** répondre à partir d’un corpus approuvé, citer des passages autorisés et conserver
un contexte utile avec rétention et suppression contrôlées.

| Lot | Travail concret | Dépend de | Critères de sortie | Responsable |
|---|---|---|---|---|
| P4.1 | Inventaire du corpus, propriétaire, classification, ACL, droits d’usage, version, dates d’effet et règles de retrait | D1, D5, D7 ; préparation possible avant G3 | Liste explicitement approuvée ; prompts/skills/secrets et documents non publiés exclus par défaut | Métier / données / sécurité |
| P4.2 | Baseline sans génération, jeu de questions/références et mesure plein texte ; modèle d’embedding et chunking évalués | P4.1 | Cas FR et autres langues réellement présentes, ambiguïtés, sans réponse, sources périmées et interdites | Données / qualité |
| P4.3 | Migrations corpus/passages/ACL/index, ingestion idempotente, extraction bornée, quarantaine et cycle publication/retrait | D5, P4.2 | Base vierge + upgrade, runtime sans DDL, réindexation/reconstruction et suppression éprouvées | Backend / données |
| P4.4 | Embeddings via worker TS et passerelle autorisée ; recherche MCP côté Spring filtrée ; hybride lexical/vecteur et reranking si bénéfice mesuré | G2, P4.3 | Aucun accès Node aux tables métier/corpus ; filtrage avant modèle ; pertinence après ACL et pas seulement sans filtre | Données / runtime |
| P4.5 | Réponse citée, validation des identifiants/extraits et liens protégés ; abstention si sources insuffisantes | G3, P4.4 | Source exacte/version/page/passage disponibles ; citations inventées rejetées ; téléchargement réautorisé | Runtime / frontend |
| P4.6 | Mémoire courte, résumé glissant, mémoire longue explicite et supprimable ; séparer résumé et autorité d’action | P2.4, P4.5 | Session longue bornée, confirmations et provenance conservées, suppression/retrait aussi dans les copies de contexte | Runtime / sécurité |
| P4.7 | Comparatif référence/hybride/reranking, charge et coût ; rapport de sécurité et restauration | P4.2–P4.6 | Décision mesurée sur qualité/latence/coût ; index ANN évalué avec vrais filtres de droits | Qualité / données / exploitation |

Le [dossier RAG](rag.md) définit les étapes et cas de test. La gouvernance et les questions de
référence commencent en P0/P1 ; le produit documentaire n’est pas reporté à la toute fin de la
réflexion parce que son implémentation est en phase 4.

**Porte G4 :** aucune fuite déterministe, sources et abstentions vérifiées, rétention/retrait et
reconstruction testés. Le jeu de régression, les versions et les rapports accompagnent l’index.
GraphRAG/Neo4j ne sont ouverts que si des questions multi-sauts échouent malgré une recherche
hybride convenablement évaluée et qu’un ADR en justifie le coût.

## Validation transversale et promotion

| Niveau | Preuves obligatoires selon le lot |
|---|---|
| Sécurité déterministe | Audiences, droits effectifs, champs, ressources, conversations, cache, approbations, injections directes/indirectes ; tout accès interdit fait échouer la porte |
| Fiabilité | Crash avant/après effet, concurrence, annulation, timeout, état ancien, fournisseur hors quota, retrait de source et saturation |
| Qualité probabiliste | Réussite des tâches et recherche, ancrage, citations, abstention ; comparaison à la référence et revue humaine, juge LLM seulement complémentaire |
| Performance/coût | Premier événement/contenu utile, durée totale p50/p95, tokens par catégorie, coût daté, pools/concurrence et taille des événements |
| Exploitation | Interrupteur IA, limites par utilisateur/run/environnement, rôles DB séparés, backups et restauration, purge, alertes et procédure de retour arrière |

Les seuils de pertinence, latence, coût, taille et rétention sont à approuver avant le pilote.
Ne pas convertir une cible proposée en résultat obtenu. Les tests synthétiques locaux précèdent
la CI ; avant fusion, appliquer toutes les portes du dépôt. Avant production, autorisation
d’exploitation, sauvegarde/restauration, vérification de l’environnement réel et contrôle après
déploiement. Aucun déploiement n’est réalisé par ce plan.

Les pistes gRPC, A2A, UDP/IoT, OCR, recherche approchée et autres techniques sont dans la
[matrice d’innovations](protocoles-et-innovations.md). Chacune a son déclencheur ; aucune
n’est ajoutée pour remplir artificiellement la pile.
