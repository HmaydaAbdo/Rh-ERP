# Analyse critique de l’intégration IA

Revue du dépôt et de sources officielles au **2026-10-23**. Ce document établit les écarts ; il
ne rapporte aucune mesure de production ni intégration de bibliothèque déjà réussie.

## Socle réellement présent

| Constat | Preuve dans le dépôt | Conséquence |
|---|---|---|
| Java 21 / Spring Boot 4.1.1 | `backend/pom.xml` | Tester le SDK MCP sur cette pile, sans rétrograder vers Boot 3 |
| Angular ^22.2.3 / TS ~6.0.3 / Node ^24.15.0 | `frontend/package.json` et lockfile | Tester peer dependencies, zoneless et SSR éventuel ; aucun hook React dans Angular |
| Aria/CDK, Tailwind, Lucide, composants Staport | `conventions/frontend.md`, manifeste frontend | Le catalogue génératif réutilise ce kit ; PrimeNG est explicitement exclu par le socle actuel |
| PDF HTML/SVG | `docs/report/README.md` | Réutiliser le moteur actuel au lieu d’ajouter JasperReports |
| pgvector préparé, pas de RAG | `database/Dockerfile`, `V1__enable_extensions.sql` | Extension disponible dans l’image du dépôt ≠ corpus indexé ni preuve de production |
| JWT HS256 auto-émis | `auth/security/JwtService.java`, `SecurityConfig.java` | Aucun serveur OAuth/OIDC/JWKS disponible pour Node ; délégation à concevoir |
| Permissions et masquage salaire dans HTTP | `employee/controller/EmployeeController.java` | Une façade métier n’est pas un contrat de divulgation sûr pour MCP |
| Audit de lectures dans advice HTTP | `audit/web/AuditLectureResponseAdvice.java` | MCP, tâches et streaming exigent une couverture explicite |
| `@Async` propage seulement `requestId` | `common/config/AsyncConfig.java` | Ni durabilité ni propagation d’acteur/permission automatique |
| Exports synchrones, pas de saver/registre de jobs | services d’export et de rapport Paie | Un pointeur asynchrone nécessite un vrai cycle durable, pas simplement `@Async` |

Les agrégats `IPaieAnalytiqueService`, `IEmployeeAnalytiqueService` et les services de périmètre
restent les sources des chiffres. Les façades de domaines et le parcours
`PaieImportService.analyser/corriger/importer` sont réutilisables sous leurs règles existantes.
Le domaine Pointage et le calcul de paie futur ne sont pas implémentés par l’assistant.

## Stress-test des neuf piliers

| Pilier | Risque de la proposition initiale | Conception à éprouver | Preuve attendue |
|---|---|---|---|
| 1. Latence | Confondre streaming et calcul plus rapide ; placer un PDF ou des centaines de lignes dans le contexte | SSE visible, appels bornés, pools HTTP/DB ; travaux longs vers jobs/artefacts autorisés. Mesurer HTTP/2 au proxy et HTTP réellement utilisé entre services | Premier événement, premier contenu utile, durée totale p50/p95, concurrence, mémoire, débit et coût par tâche |
| 2. Identité | Faire circuler le même JWT partout ; donner le secret HS256 à Node ; croire le RBAC REST hérité | Identité humaine préservée, jetons par audience, délégation à droits réduits, validation serveur et droits actuels à la reprise ; audit humain/service/outil | Anonyme, mauvais `aud`/`iss`, expiration, refus individuel, compte désactivé, salaire sans `PAIE_READ`, fuite entre threads |
| 3. Hallucinations | Zod garantit la forme, pas la vérité ; auto-correction infinie ; exceptions internes envoyées au modèle | Schémas fermés, validations Spring, erreurs métier catégorisées et expurgées ; retries bornés sur erreurs corrigeables seulement ; citations reliées à la source | Arguments incorrects corrigés dans le budget ; refus `401/403` sans contournement ; absence de source entraîne abstention |
| 4. Multi-agents | Un agent par table et délégations libres multiplient coûts et risques | Un graphe explicite d’abord ; sous-graphes RH/Paie/Opérations seulement si isolation démontrée ; pas d’agent financier ERP-RH sans domaine correspondant | Routage déterministe, budget global partagé, aucun élargissement de droits, arrêt des boucles |
| 5. MCP | Confondre ancien HTTP+SSE et Streamable HTTP ; SDK et protocole de versions incompatibles | SDK Java officiel sans Spring AI ; cycle de version/capacités selon révision retenue et catalogue explicite ; cache de schémas sans cache de données utilisateur | Tests vrais client TS/serveur Java, reprise catalogue, schéma incompatible, délais, refus et Origin |
| 6. AG-UI | Confondre événements AG-UI, génération de composants et protocole A2UI ; supposer CopilotKit Angular compatible | Spike du SDK Angular officiel, runtime et graphe embarqué ; composants Staport autorisés ; fetch streaming authentifié ; schémas validés | Rendu réel Angular22 zoneless, annulation, flux partiel, reconnexion, clavier/mobile et absence de code arbitraire |
| 7. Mémoire | Assimiler checkpoint, recherche vectorielle et mémoire personnelle ; mémoriser la paie comme vérité | État court et résumé bornés ; mémoire longue validée et supprimable ; RAG documentaire gouverné ; pas de vecteur transactionnel | Isolation, rétention, suppression/retrait, source fraîche et budget de contexte |
| 8. Compactage | Un résumé peut perdre refus, provenance ou confirmation ; résumer la politique en texte non fiable | Garder contrôles, approbations et identifiants en état structuré autoritaire ; résumer le récit seulement ; relire les valeurs métier | Longue session et contenu hostile sans disparition des contraintes ; gain de tokens sans régression métier |
| 9. Checkpoints | Une reprise atomique du graphe serait une transaction atomique avec Spring | `PostgresSaver` durable avec identité et version de graphe ; idempotence serveur et réconciliation des résultats incertains | Crash avant/après commit métier, deux reprises concurrentes, approbation expirée, redémarrage sur un autre processus |

## Corrections de sécurité et de protocole

Le [contrat d’autorisation MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
lie le jeton à la ressource visée. Le runtime n’acquiert pas des droits parce qu’il reçoit
`userId`, `permissions` ou `forwardedProps` du navigateur. Ne jamais déduire l’identité de ces champs.
Le mécanisme d’échange/délégation doit être approuvé ; aucun jeton brut dans les prompts,
checkpoints, URL, logs ou stockage navigateur persistant. Le cookie de refresh reste dans le
parcours Auth du navigateur, sans transfert au runtime IA.

Pour chaque outil, contrôler action, périmètre et champs. Exemple indispensable : un utilisateur
avec `EMPLOYEE_READ` mais sans `PAIE_READ` ne voit ni salaire, ni tri, ni agrégat ou message
d’erreur révélant cette donnée. Réutiliser une politique de projection de domaine après revue,
ou appliquer l’adaptation explicitement ; ne pas dupliquer silencieusement une règle métier.

La documentation [MCP 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
et la [révision 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
diffèrent. Les [releases Java](https://github.com/modelcontextprotocol/java-sdk/releases) indiquent
un support moderne encore en préversion dans la ligne 2.2.0-M1 lors de la revue. La ligne stable
2.1.0 est une candidate à tester, pas une dépendance adoptée. Ne pas coder des sessions MCP ou un
flux GET supposés universels. Négocier et tester la même révision des deux côtés.

Le [SDK Angular CopilotKit](https://github.com/CopilotKit/CopilotKit/tree/main/packages/angular)
est documenté ; son existence ne prouve pas la compatibilité avec notre Angular/TS ni avec un
LangGraph.js embarqué. Vérifier releases, peer dependencies, licences et bridge effectif. Les
guides de [forwarding d’identité](https://github.com/CopilotKit/CopilotKit/blob/main/showcase/shell-docs/src/content/docs/auth.mdx)
ne dispensent pas de filtrer les en-têtes transmis et de gérer les audiences. Ne pas supposer que
l’intercepteur `HttpClient` Angular protège aussi une requête `fetch` du SDK.

## Durabilité et traitements longs

Le package JavaScript s’appelle
[`@langchain/langgraph-checkpoint-postgres`](https://github.com/langchain-ai/langgraphjs/tree/main/libs/checkpoint-postgres).
Son `PostgresSaver.setup()` applique des migrations : il ne doit pas tourner sous le compte
runtime sans DDL. La stratégie de migration suit D6 de l’ADR, avec test de montée de version.
Les [interruptions LangGraph](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
peuvent rejouer le début d’un nœud ; un checkpoint ne garantit pas un effet métier exactement une fois.

Pour une future écriture : préparer un diff, lier l’approbation à acteur/action/arguments/version/
expiration, confirmer, revalider côté Spring, exécuter avec clé d’idempotence puis enregistrer
le résultat. En cas de coupure après commit, consulter le résultat par cette clé avant toute
réémission. Ne pas transformer une erreur réseau ambiguë en retry aveugle.

Pour un PDF : l’outil retourne un `jobId`, un état et une référence d’artefact, jamais le binaire au
LLM. Le worker utilise les services existants et une identité limitée explicitement autorisée.
État et résultat sont durables ; la progression est poussée vers l’interface. Le téléchargement
réauthentifie le lecteur et vérifie `PAIE_EXPORT`/`PAIE_READ`, avec audit, expiration et purge.
Une URL devinable ou un ancien droit de création du job ne constitue pas une autorisation actuelle.

## Latence, coût et charge : hypothèses à mesurer

Instrumenter séparément authentification, découverte MCP, retrieval, LLM, outil métier,
checkpoint et rendu. Une réponse en streaming peut rester lente à terminer ; relever aussi le
temps jusqu’à une information utile et jusqu’au résultat métier. Aucun SLA ou prix fournisseur
n’est inventé dans ce cadrage.

Le coût estimé d’un run comprend les tokens entrée/sortie réellement facturés, embeddings,
reranking et appels auxiliaires, plus l’infrastructure. Conserver les tarifs datés dans la
configuration d’exploitation, pas dans une règle métier. Les quotas et retries se cumulent sur
le run et ses sous-graphes, y compris après reprise ; compacter ne remet pas le budget à zéro.

Tester des profils exploratoires de 1, 5 et 20 runs simultanés (valeurs de test, pas capacité
promise), corpus de tailles croissantes, client lent, fournisseur indisponible et pool DB saturé.
Les objectifs p95, budgets et limites de charge sont fixés avant la promotion du pilote.

Les métriques actuelles, Envers, le journal et pgAudit sont réutilisés selon leur rôle. pgAudit
ne connaît pas à lui seul l’intention de l’agent ni son approbation. Ajouter une corrélation
`requestId/threadId/runId/toolCallId`, un acteur humain et un service délégué dans l’audit à accès
restreint ; ne pas utiliser ces identifiants comme labels métriques de forte cardinalité.
