# Plan d’intégration IA en quatre phases

**Version du 2026-10-23 — plan renforcé ; première tâche P1.1 testée, en revue propriétaire.**
Orientation : [ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md).
État et prochaine action : [handoff](../handoff/integration-ia.md).

## Mode de travail et définition de terminé

Le lot documentaire P0 est réalisé sur `codex/integration-ia-mcp-rag`. Seule **P1.1 est en revue propriétaire** ;
P1.2 et les tâches suivantes sont **non commencées**. Les phases sont des dépendances de réalisation,
pas une promesse de délai. La trajectoire produit par domaine est dans [progression-ui.md](progression-ui.md).
Après choix du pilote, estimer chaque lot à partir du spike et des moyens disponibles ; ne pas
annoncer une date de production avant ces mesures.

Pour chaque lot : lire conventions, README/skill/RBAC du domaine ; réaliser le plus petit parcours
complet ; vérifier compilation, contrats, tests utiles et comportement réel ; synchroniser les
docs ; consigner commit, commandes, résultats, risques et prochaine action dans le handoff.
Une ligne n’est terminée que si ses preuves sont accessibles. Un test simulé, une intégration
locale, une CI et un contrôle de production sont consignés séparément.

**Règle du propriétaire : une tâche à la fois.** L'autorisation de commencer P1.1 ne vaut ni
acceptation de son résultat, ni autorisation de commencer P1.2. Après chaque tâche, présenter le
résultat, les tests et la documentation ; attendre sa validation explicite avant la suivante.
Un résultat technique vert permet de demander cette validation, pas de franchir seul la porte.

| État de tâche | Condition et action suivante |
|---|---|
| Non commencée | Dépendances, décision requise ou validation de la précédente manquante |
| Prête | Entrées disponibles, périmètre et critères d'acceptation documentés, précédente validée |
| En cours | Une seule tâche active ; consigner immédiatement tout blocage et la prochaine commande |
| En revue propriétaire | Code/prototype, tests utiles, preuves et docs synchronisés ; arrêt à cette porte |
| Validée | Accord explicite daté et réserves consignés dans le handoff ; prochaine tâche autorisable |
| À reprendre | Échec ou réserve non résolue ; corriger cette tâche avant toute extension |

Chaque tâche possède une fiche : ID, objectif observable, entrées/décisions, inclus/exclus,
livrables, critères et tests, commandes/résultats/liens, limites, état de revue et prochaine action.
Les tables ci-dessous donnent l'ordre des travaux ; décomposer les lignes trop larges en sous-tâches
avant leur activation, chacune avec cette fiche et une validation séparée. À chaque reprise, lire
le handoff puis vérifier branche, `git status`, dernier commit, diff et preuves ; ne jamais déduire
une validation d'un commit, d'une case cochée ou d'une session interrompue.

Les changements importants suivent l’approbation d’architecture d’`AGENTS.md`. Les actions de
production suivent les règles de déploiement ; ce plan n’autorise aucun changement du Docker du
propriétaire, aucun remplacement de son serveur sur 4200 et aucune écriture sur une base réelle.

## P0 — conventions, cadrage et décisions

| ID | Livrable | État / sortie |
|---|---|---|
| P0.1 | Audit du code et stress-test des neuf piliers | Documenté dans [analyse-architecture.md](analyse-architecture.md) |
| P0.2 | Conventions adaptées à la séparation Java/TypeScript et aux protocoles selon besoin | Documentation seulement ; pas de dépendance ajoutée |
| P0.3 | ADR, feuille de route, conception RAG et registre de reprise | Préparés pour revue propriétaire |
| P0.4 | Accord initial sur périmètre, limites et spikes isolés ; registre des décisions D1–D8 | Demande du 2026-10-23 : renforcer le plan et commencer la première tâche ; autorise P1.1 isolée, D1–D8 restent ouverts |

Le propriétaire choisira le premier utilisateur et le corpus avant leur usage. L'accord initial
couvre ici le premier spike de compatibilité, sans données métier ni appel de modèle. Les
choix définitifs sont arrêtés après leurs preuves : D2/D3 avant exposition MCP, D5/D6 avant
persistance applicative, D4 après le spike d’interface, D7 avant appel de modèle et D8 avant
présentation avancée. La classification est vérifiée ; ne pas supposer une base fictive.

## Phase 1 — serveur MCP Spring et identité

**Objectif :** un client de test authentifié exécute une lecture bornée, autorisée et auditée dans
Spring, sans LLM et sans nouvelle règle métier.

| Lot | Travail concret | Dépend de | Critères de sortie | Responsable de réalisation |
|---|---|---|---|---|
| P1.1 | Spike SDK Java officiel isolé : BOM/modules JSON/transport Servlet, vrai client TypeScript et matrice protocole/versions/licences | P0.4 autorisé ; **en revue propriétaire** | [Preuves et résultats locaux](validation-p1-1.md), accord propriétaire en attente | Backend / plateforme |
| P1.2 | Comparer les options d’identité autorisées au spike, faire valider D2, puis implémenter audiences, émetteur, scopes, rotation, révocation et découverte OAuth | P0.4, P1.1 ; D2 avant implémentation retenue | Mauvaise audience/émetteur/signature/expiration refusés, secret HS256 non partagé, identité humaine vérifiée | Sécurité / backend |
| P1.3 | Catalogue initial explicite, un outil de lecture candidat `chantier_lire_fiche` sous `CHANTIER_READ` ; nom et contrat à confirmer avec le domaine | D1, P1.2 | Schémas typés, absence de repository inter-domaine, champs minimaux, pagination/tailles/délais bornés | Domaine Chantier |
| P1.4 | Couverture autorisation et projection de champs de tous les outils exposés ; vérifier aussi ressources, découverte et artefacts | P1.3 | Tests appel direct sans permission, refus individuel, cas salaire `EMPLOYEE_READ` sans `PAIE_READ` avant tout outil Employé | Sécurité / domaines |
| P1.5 | Adaptation audit MCP : identité humaine/service, corrélation, lectures sensibles, refus, erreurs expurgées et santé du journal | P1.3 | Succès/refus/échec traçables sans jetons ni données RH dans les logs ; audit métier préservé | Audit / backend |
| P1.6 | Transport et exploitation isolés : TLS, Origin/CORS, hôtes autorisés, limites, timeouts, propagation de corrélation | P1.1–P1.5 | Test client réel à travers proxy, panne et annulation ; application REST inchangée fonctionnellement | Plateforme |

### Première tâche active — P1.1 : preuve de compatibilité MCP

**Entrée :** autorisation du 2026-10-23 de commencer la première tâche ; branche dédiée et
Java/Spring/manifests réels vérifiés. D3 reste une décision d'adoption à prendre après la preuve.

**Livrable :** profil Maven explicite `mcp-compatibility`, sources de test dédiées ajoutées par
`build-helper` uniquement dans ce profil, serveur Servlet sur loopback/port éphémère et client MCP
TypeScript officiel. Le contexte Boot minimal utilise le classpath réel du backend, sans charger
JPA/Flyway, la configuration d'environnement applicative, des secrets ou des données métier.
Un outil synthétique suffit ; aucune route MCP n'est ajoutée à l'application livrable.

| Critère d'acceptation | Preuve attendue |
|---|---|
| Compatibilité réelle Java 21 / Boot du dépôt / SDK Java et TS | Versions exactes, protocole négocié et commande reproductible enregistrés |
| Échange MCP effectif | Client TS → HTTP Servlet : initialisation, découverte, appel et résultat synthétique vérifié |
| Contrat et erreurs | Entrée invalide et outil inconnu traités sans faux résultat de succès |
| Isolation du spike | Profil inactif par défaut ; aucune dépendance MCP de production, aucun JPA/Flyway, LLM ou accès métier |
| Régression et documentation | Compilation backend/frontend applicable, rapport des commandes, licences et limites dans le handoff |
| Revue | Résultat présenté ; validation propriétaire **en attente** avant P1.2 |

Le spike ne prouve ni OAuth, ni RBAC, ni audit métier, ni passage proxy, ni disponibilité de
production : ces preuves appartiennent aux tâches suivantes. En cas d'incompatibilité, documenter
l'échec et les options ; ne pas remplacer discrètement le transport ni introduire Spring AI.
**P1.2 demeure non commencée**, même si tous les tests P1.1 passent.
Le [rapport P1.1](validation-p1-1.md) consigne les 10 scénarios TypeScript, le test Java,
les 44 tests de régression ciblés, les inventaires/audits et les limites de cette preuve locale.

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
| P3.3 | Mode Chat : panneau Staport, texte/sources, état d'outil et contexte partagé avec l'écran classique | P3.2 | Requête/périmètre explicites, retour à l'écran avec filtres/période/sélection, aucune donnée seulement masquée visuellement | Frontend / design |
| P3.4 | Reconnexion explicite : état durable réautorisé, snapshot/delta selon contrat, déduplication et nettoyage des souscriptions | P3.2 | Pas de double run au retour réseau ; aucun statut affiché comme succès avant résultat serveur | Frontend / runtime |
| P3.5 | Vérification réelle mobile/clavier/focus/lecteur d’écran, thèmes, mouvement réduit, repli texte et IA indisponible | P3.3–P3.4 | Parcours Playwright/axe puis revue visuelle ; parcours métier existants utilisables sans IA | Qualité / frontend |
| P3.6 | Controlled GenUI : cartes/tableaux/actions prédéfinis, catalogue typé mappé aux composants Staport | P3.5 | Comparaison à l'écran classique, schémas négatifs, navigation bornée et mêmes droits ; pas de code généré | Frontend / domaine |
| P3.7 | A2UI déclaratif : spike puis décision D8, catalogue versionné, composition et interactions validées | P3.6 ; D8 avant adoption | Schémas/version/renderer compatibles Angular, limites, clavier/focus et repli ; aucune nouvelle autonomie métier | Frontend / design |
| P3.8 | Étudier l'open-ended : composition A2UI étendue ou prototype de code UI isolé | P3.7 validée ; étude à autoriser séparément | Comparatif utilité/risque/coût ; code généré soumis à un nouvel ADR avant tout prototype exécutable | Architecture / sécurité |

Chaque mode et chaque domaine passent leur propre revue selon la [matrice UI](progression-ui.md).
La mascotte Rive conserve un lot facultatif distinct, après décision D8 ; elle ne conditionne
aucun passage de mode. AG-UI est le contrat d'interaction transversal, pas un niveau à remplacer.
Le choix d'explorer des interfaces plus libres n'accorde aucun droit d'écriture supplémentaire.

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
Ce cadrage reste inscrit au plan dès maintenant ; avec la règle d'une seule tâche active,
P4.1 ne commence qu'après validation de la tâche courante et autorisation de son activation.
Les chiffres, effectifs et montants viennent des façades métier ; aucune vectorisation des tables
transactionnelles ne remplace ces lectures. La baseline lexicale précède l'ajout d'embeddings.

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
