# Protocoles et pistes d'évolution ERP-RH

État au 2026-10-23 : **propositions à arbitrer**, sans ajout de dépendance, service, migration ni
fonctionnalité. La branche de cadrage est `codex/integration-ia-mcp-rag`. La réalisation suit
l'[ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md), le [plan d'intégration](plan-integration.md)
et la convention [`integrations.md`](../../conventions/integrations.md).

## Point de départ vérifié

Le backend reste un monolithe modulaire Spring Boot 4.1.1/Java 21 ; Angular utilise les API REST
existantes. PostgreSQL possède pgvector, sans corpus RAG ni pipeline d'ingestion. Les façades de
domaine, agrégats analytiques et assistants d'import existent ; MCP, AG-UI et orchestration d'agent
restent à implémenter. Voir [l'architecture actuelle](../architecture.md) et les README de domaine.

Attention : droits REST, masquage des salaires et audit des lectures ne deviennent pas automatiquement
des contrôles MCP. `EmployeeController` masque les champs de paie sans `PAIE_READ`, tandis que la
façade interne conserve ces valeurs ; chaque futur outil doit produire une projection autorisée.

## Matrice des interfaces proposées

P1 = candidat au pilote après validation ; P2 = extension après mesure ; P3 = besoin futur à confirmer.
Une priorité ne vaut ni décision d'architecture acceptée ni engagement de livraison. Chaque ligne
reste **proposée** jusqu'à consignation de sa décision et de ses preuves dans le plan.

| Scénario | Option proposée | Bénéfice visé | Coût / limite | Condition de passage et mesure | Priorité |
|---|---|---|---|---|---|
| Agent vers capacités RH | MCP Streamable HTTP, catalogue de lectures bornées | Contrats réutilisables et droits explicites | Authentification déléguée à résoudre ; compatibilité SDK | Version protocole testée, tests RBAC/masquage/audit et délais ; aucun partage du secret JWT HS256 | P1 |
| Panneau assistant Angular | AG-UI sur SSE avec entrées/annulation HTTP du runtime | Progression, sources et interruption visibles | Proxy streaming, reconnexion et état à gérer | Contrats officiels, accès clavier/mobile, coupure/reprise, temps de première réponse | P1 |
| Parcours métier actuels | Conserver REST/HTTP et composants Staport | Réutiliser le fonctionnement validé | Deux interfaces à vérifier pour les mêmes capacités | Comparer réponses, périmètres et permissions REST/outils ; repli sans assistant | P1 |
| Worker OCR/inférence/analytique distant | Comparer HTTP et gRPC typé | Isolation d'une charge ou échanges plus efficaces | Nouveau service, schéma et exploitation | Besoin mesuré, benchmark latence/débit/coût ; aucun accès métier parallèle aux outils MCP | P2 |
| Tâches longues et fraîcheur d'index | Job persistant, éventuellement outbox après commit | Reprise et convergence des projections | Stockage d'état, rejeu et nettoyage | Démontrer perte/reprise sans omission ni double effet ; définir retard tolérable | P2 |
| Agent ERP-RH vers agent d'une autre application | A2A | Délégation avec suivi d'une tâche distante | Contrats et confiance entre applications | Cas interapplication réel, capacités/droits vérifiés, annulation et coût bornés | P3 |
| Voix ou interaction bidirectionnelle continue | WebSocket si les échanges l'exigent | Interaction continue et interruption | Gestion audio, connexion et données sensibles | Besoin utilisateur confirmé ; mesure réseau, accessibilité texte et arrêt immédiat | P3 |
| Capteurs futurs de chantier | MQTT si livraison/reconnexion nécessaires ; UDP brut si perte acceptable | Acquisition adaptée au terrain | Matériel, sécurité, congestion et maintenance | Pilote matériel, pertes/doublons mesurés ; aucune validation de paie ou de présence par datagramme | P3 |
| Chemin réseau mobile | QUIC/HTTP/3 au niveau infrastructure | Gain éventuel sur réseau dégradé | Support proxy/client et diagnostic | Benchmark avant/après et repli HTTP ; aucun protocole métier nouveau | P3 |

Le MVP recommandé combine les trois premières lignes. La documentation MCP consultée porte la
version 2025-11-25 ; cela ne constitue pas une preuve de compatibilité du futur SDK Java MCP sans
Spring AI. La matrice de versions est à arrêter selon l’[analyse](analyse-architecture.md).
LangGraph orchestre les étapes avec état et reprises ; il n'exige ni gRPC ni A2A pour ses appels internes.

## Matrice des besoins et innovations

Les lacunes ci-dessous viennent du code/documentation actuels ; les usages et gains restent à
confirmer avec les utilisateurs. Le RAG recherche des documents autorisés ; les chiffres métier
proviennent des services déterministes et de leurs définitions communes.

| Besoin / lacune | Option proposée | Bénéfice visé | Coût / limite | Condition de passage et mesure | Priorité |
|---|---|---|---|---|---|
| Retrouver procédures et règles documentées | RAG documentaire hybride plein texte + pgvector, réponses citées | Réponse vérifiable, lien vers passage/version | Corpus à qualifier, embeddings et fraîcheur | Corpus autorisé, questions de référence, pertinence/citations/refus ; zéro fuite dans tests de sécurité | P1 |
| Comprendre un rejet d'import | Expliquer le résultat de `PaieImportService.analyser` via outil en lecture | Réduire recherches et essais inutiles | Ne corrige pas un fichier ou une fiche de sa propre initiative | Même résultat que l'assistant existant, temps de résolution et erreurs d'explication mesurés | P1 |
| Quasi-doublons de fonctions/référentiels | Normalisation et `pg_trgm` avant comparaison par embeddings | Candidats de rapprochement explicables | Faux positifs ; aucune fusion automatique | Jeu de libellés validés, précision des candidats ; décision humaine et parcours métier pour toute modification | P2 |
| Questions sur effectifs et masse salariale | Catalogue sémantique de KPI servi par outils métier | Même unité, période, filtre et résultat dans rapport/assistant | Définitions à publier, permissions à préserver | Égalité avec `IPaieAnalytiqueService`/`IEmployeeAnalytiqueService`, aucune formule ou seuil inventé | P1 |
| Repérer des données atypiques | Contrôles déterministes puis statistiques/ML si utiles | Orienter la revue qualité et expliquer les alertes | Atypique ne signifie pas erroné ; validation métier requise | Règles approuvées, faux positifs et temps de revue mesurés ; aucun salaire modifié automatiquement | P2 |
| Lire des justificatifs scannés | OCR isolé, par exemple Tesseract, extraction structurée avec preuve visuelle | Limiter ressaisie et conserver la source | Qualité/langue du scan, rétention et documents acceptés à définir | Corpus autorisé, exactitude par champ, revue humaine ; ne pas remplacer l'import Excel contractuel | P2 |
| Travail terrain sans réseau, futur Pointage | PWA avec stockage local minimal et synchronisation explicite | Préparer la saisie en connectivité faible | Pointage absent ; conflits et validation métier non définis | ADR métier d'abord, droits à reconnexion, conflits/rejeu ; aucune présence validée hors ligne implicitement | P3 |
| Isolation des corpus et mémoires | Filtres d'accès serveur, éventuellement RLS sur stockage dérivé | Défense supplémentaire contre accès croisés | Rôles PostgreSQL et pool à tester | Tests utilisateur/périmètre refusés ; pas de rôle propriétaire ou `BYPASSRLS` donnant un faux sentiment d'isolation | P2 |
| Mesurer ce que l'IA apporte | Évaluations versionnées, traces OTel, coûts LiteLLM et suivi Langfuse prévus par les conventions | Comparer qualité, latence, coût et reprises | Ressources d'exploitation et minimisation des traces | Baseline, budgets et critères validés ; traces sans données RH par défaut, régression bloquante pour la sécurité | P1 |

## Ordre et preuve avant extension

Retenir un premier parcours et ses critères, puis établir la sécurité et le contrat MCP avant le
panneau. Ajouter le RAG avec un corpus explicitement choisi et un jeu d'évaluation séparé. Comparer
le résultat au parcours actuel et consigner les limites. L'analyse d'import n'ajoute aucune nouvelle
écriture ; les corrections suivent le parcours existant et ses permissions.

Les options P2/P3 demandent leur propre décision dans le plan. Kafka, Temporal, Neo4j et un nouvel
entrepôt analytique ne sont pas nécessaires par défaut : établir d'abord ce que les services,
PostgreSQL, un job persistant et pgvector ne permettent pas de satisfaire. Toute nouvelle règle de
Pointage, seuil d'anomalie, fusion ou conservation de document est à faire valider avant implémentation.

Pour le hors ligne, le Service Worker Angular fournit un cache simple et est maintenu pour les
correctifs de sécurité ; il ne résout pas la synchronisation métier. Comparer les API du navigateur
selon le besoin validé, sans imposer une bibliothèque PWA.

## Sources officielles consultées le 2026-10-23

- Protocoles et réseau : références de [`conventions/integrations.md`](../../conventions/integrations.md).
- [pgvector : recherche hybride](https://github.com/pgvector/pgvector#hybrid-search) ; [PostgreSQL : pg_trgm](https://www.postgresql.org/docs/18/pgtrgm.html).
- [Tesseract : moteur OCR et documentation](https://tesseract-ocr.github.io/tessdoc/) ; [Angular : limites du Service Worker](https://angular.dev/ecosystem/service-workers).
- [Debezium : exemple d'outbox et routage d'événements](https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html), référence du mécanisme, sans décision d'installer Debezium/Kafka.
- [OpenTelemetry : signaux et instrumentation](https://opentelemetry.io/docs/) ; [Langfuse : observation et évaluations](https://langfuse.com/docs).

Ces sources décrivent des capacités techniques. Leur adéquation à ERP-RH, leurs versions retenues,
leurs licences et leurs coûts devront être confirmés par les étapes du plan avant adoption.
