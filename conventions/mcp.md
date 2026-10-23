# Outils MCP

MCP est le contrat d'interopérabilité des capacités métier destinées aux agents. Toute application
destinée à participer à un écosystème IA expose, par MCP, les opérations métier pertinentes pour
ses cas d'usage. Elle conserve ses API et services comme frontières métier. Les outils MCP sont
des adaptateurs vers les cas d'usage publics du domaine, jamais un accès parallèle aux repositories
ou aux règles métier. L'exposition n'implique pas d'exposer toutes les opérations CRUD.

Pour ERP-RH, l'orientation demandée est de conserver les services métier Spring et d'exposer leurs
capacités à l'orchestrateur TypeScript ; aucun framework LLM Java n'est requis. Le périmètre, les
options à valider et l'ordre de réalisation sont décrits dans [`docs/ia/README.md`](../docs/ia/README.md)
et l'[ADR 0013](../docs/adr/0013-integration-ia-mcp-langgraph-rag.md).

## Contrat des outils

Chaque outil possède un nom et un objectif explicites, un propriétaire métier, un schéma d'entrée et
de sortie typé et documenté, et des limites de taille et de résultats. Les recherches paginées
définissent leurs limites et leur ordre. Séparer les outils de lecture des outils d'écriture, et ne
pas exposer indistinctement toutes les routes CRUD de l'application.

Pour un catalogue important, l'agent peut rechercher les outils pertinents à la demande (Tool
Search) et ne charger ensuite que leurs descriptions et schémas. La recherche doit rester bornée au
catalogue publié et configuré. Elle ne change pas les permissions : le serveur contrôle chaque appel
selon l'identité et le périmètre effectifs.

Le runtime TypeScript utilise un client MCP et ses contrats JSON-RPC pour consommer les capacités
Spring ; il ne recrée pas un client REST métier parallèle. Les API REST existantes restent les
contrats de l'interface ordinaire. Un cache des schémas de découverte est borné, lié au serveur,
à sa version de catalogue et au contexte d'autorisation applicable, puis invalidé lors d'un
changement ; il ne met pas en cache les données métier et n'accorde aucun droit.

Les outils sont bornés et prévisibles : valider les entrées côté serveur, fixer des délais d'attente
et des quotas, définir les reprises et rendre les écritures idempotentes lorsque c'est nécessaire.
Une nouvelle tentative ne doit pas répéter un effet métier. Une écriture rejouable s'appuie sur une
clé de commande stable et un résultat durable dans le domaine. Un timeout ne prouve pas l'absence
d'effet : si l'issue est incertaine, rechercher l'état avant une reprise. Une action sensible exige une
confirmation humaine selon son risque ; son résultat et, si possible, sa procédure d'annulation sont
expliqués à l'utilisateur.

## Ce que publie le serveur MCP

Un serveur MCP publie des **capacités**, pas des agents :

| Primitive MCP | Usage |
|---|---|
| Outils (`tools`) | Opérations métier des domaines, lecture et écriture séparées. Un agent de domaine peut aussi être publié comme un outil de haut niveau (une sous-tâche en entrée, un résultat typé en sortie), sous les mêmes règles qu'un outil |
| Ressources (`resources`) | Contenus en lecture seule et adressables : documentation, référentiels publiés, documents d'un corpus autorisé |
| Prompts (`prompts`) | Modèles de demande réutilisables proposés aux clients, versionnés avec l'application |

La délégation d'une tâche à un agent d'une autre application peut justifier A2A (voir
[`agents-ia.md`](agents-ia.md)). MCP expose des capacités ; il n'impose ni multi-agents ni A2A, et
ne constitue pas le canal d'événements vers Angular. Les choix de protocoles suivent
[`integrations.md`](integrations.md).

Organiser le catalogue par domaine : chaque domaine déclare ses outils, ressources et prompts dans son
propre package, et le serveur les assemble. Les noms sont préfixés par le domaine
(`paie_rechercher_bulletins`, `chantier_lire_fiche`) pour rester uniques et lisibles dans un catalogue
commun.

## Implémentation et version du protocole

* Dans ERP-RH, placer les adaptateurs MCP au bord des domaines Spring, vers leurs façades publiques.
  Choisir le SDK Java maintenu et son mode d'intégration seulement après vérification avec les
  versions réelles du JDK et de Spring Boot. L'intégration ne doit pas ajouter Spring AI,
  LangChain4j ou un autre framework LLM au monolithe. Le SDK précis reste une décision du lot de
  compatibilité de l'ADR 0013.
* Pour un serveur réseau, retenir le transport **Streamable HTTP** et enregistrer la révision MCP
  exacte, les SDK client/serveur et les capacités négociées. Le transport historique HTTP+SSE ne
  devient pas la référence par défaut ; stdio reste réservé aux intégrations locales adaptées.
  SSE peut intervenir dans Streamable HTTP selon la révision retenue, mais n'est ni MCP lui-même
  ni un canal de raisonnement interne.
* Implémenter et tester les métadonnées de version/capacités, le format des erreurs et le cycle
  d'échange applicables à la révision retenue. Ne pas présumer que toutes les révisions utilisent
  le même handshake `initialize` ou une session persistante. Un éventuel identifiant de session
  ou handle d'état MCP n'est jamais une preuve d'identité ni une autorisation.
* Protéger le serveur HTTP conformément à la spécification d'autorisation MCP et à
  [`security.md`](security.md). Définir les émetteurs, audiences, scopes, origines et frontières
  réseau admis ; tester aussi les accès directs hors de l'interface.
* Publier le catalogue de façon explicite (liste d'outils activés par configuration) ; un outil
  ajouté au code n'est pas exposé tant qu'il n'est pas déclaré.
* Les notifications de changement de catalogue, la progression et l'annulation suivent la
  spécification. Une annulation n'annule pas un effet métier déjà confirmé et ne remplace pas une
  commande de compensation du domaine.

## Identité, permissions et audit

Chaque appel porte l'identité et le contexte de corrélation nécessaires. L'application qui possède
l'outil réauthentifie ou valide l'identité déléguée et revérifie la permission effective et le
périmètre métier au moment de l'action. Un appel interservice ou un contexte agent ne contourne pas
le RBAC. Toute modification et tout refus pertinent suivent les conventions
[`security.md`](security.md) et [`audit.md`](audit.md).

Ne pas partager le `JWT_SECRET` du monolithe avec le runtime Node pour lui permettre de fabriquer
des jetons ERP-RH. Ne pas transmettre un jeton reçu à un service pour lequel il n'a pas été émis
(token passthrough). Une délégation documentée utilise des credentials destinés à la ressource MCP,
avec portée limitée et vérification de l'émetteur, de l'audience, de l'expiration et des droits
effectifs. Le choix entre mécanisme d'échange, jeton de délégation court ou évolution de l'identité
fait l'objet d'une décision validée ; aucun mécanisme n'est réputé déjà présent dans ERP-RH.

Les permissions HTTP ne sont pas héritées automatiquement par une façade Java. Un adaptateur doit
réappliquer l'autorisation et les règles de divulgation métier effectivement nécessaires. Dans
ERP-RH, notamment, un DTO Employé issu d'un service ne doit pas révéler un salaire à une identité
sans `PAIE_READ` sous prétexte que le contrôleur REST masquait déjà ce champ. Les tests MCP couvrent
les mêmes refus et masquages que le parcours HTTP, y compris les appels directs aux outils.

Un endpoint MCP accessible par réseau doit être protégé par authentification, autorisation et
contrôles de transport adaptés avant son exposition. La simple découverte ou l'enregistrement d'un
outil ne constitue pas une autorisation. Configurer explicitement les capacités exposées ; ne pas
laisser un serveur réseau accepter des appels anonymes par défaut.

## Limites de sécurité

Ne jamais exposer au modèle un outil générique de SQL, shell, filesystem ou réseau. Les documents,
arguments et résultats d'outils sont des données non fiables : valider les sorties, résister aux
tentatives d'injection et empêcher qu'un contenu récupéré change les instructions ou permissions.
Minimiser et masquer les données sensibles dans les réponses, traces et journaux.

Tracer l'outil et son résultat selon le risque, avec durée et corrélation ; ne pas recopier de
secrets ou de contenu sensible dans la télémétrie. Le protocole d'échange avec l'interface est un
choix d'implémentation documenté par l'application ; l'interface n'exécute jamais du contenu fourni
par un modèle.

## Revue et tests

Avant d'exposer un outil, vérifier son objectif, son propriétaire, son contrat, la séparation
lecture/écriture, la façade de domaine utilisée, l'identité, la permission, les limites, l'audit,
l'idempotence et l'expérience de confirmation/refus. Les tests de contrat et d'intégration doivent
couvrir les entrées valides et invalides, l'identité, les permissions, la pagination, les limites,
les répétitions, les délais, les injections et la corrélation. Voir [`testing.md`](testing.md) pour
la stratégie de test complète.

Ajouter les refus de mauvaise audience, de token passthrough, d'origine non admise et de session
appartenant à une autre identité ; tester la révocation avant reprise, les résultats trop larges et
le masquage des champs sensibles. Les plafonds de retries sont vérifiés avec les autres couches,
et une perte de réponse après un effet ne doit pas produire un doublon au redémarrage.

## Références officielles

Vérifier la révision effectivement adoptée avant de verrouiller les contrats :

Au 2026-10-23, la page officielle `latest` des transports redirige vers la révision **2026-07-28**.
Cette observation ne verrouille pas les SDK du projet : le prototype doit prouver leur révision
commune et leur conformité avant de choisir entre cette révision et une révision antérieure prise
en charge. La documentation de plusieurs révisions ne se combine pas en un contrat implicite.

* [MCP — spécification](https://modelcontextprotocol.io/specification/)
* [MCP — transports, révision 2026-07-28 consultée](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
* [MCP — autorisation](https://modelcontextprotocol.io/specification/latest/basic/authorization)
* [MCP — pratiques de sécurité](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices)
* [SDK Java MCP](https://github.com/modelcontextprotocol/java-sdk)
