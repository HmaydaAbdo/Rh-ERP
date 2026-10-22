# Agents, skills et IA applicative

Cette convention s'applique aux applications qui intègrent des capacités d'IA et aux agents qui
contribuent à leur développement. Elle fixe les règles communes ; chaque application documente ses
cas d'usage, ses modèles, ses outils, ses données et ses décisions techniques dans `docs/` et ses
ADR.

## Choisir la famille de solution IA

Le choix se fait à partir du problème, de son résultat attendu et de ses contraintes, avant de
choisir un modèle, un fournisseur ou une bibliothèque. Cette démarche est réutilisable d'une
application et d'un scénario à l'autre ; la décision concrète et ses preuves restent documentées
dans le domaine concerné.

Les termes ne forment pas tous une seule hiérarchie. Le Deep Learning est une famille de méthodes
de Machine Learning fondées sur des réseaux neuronaux. L'IA générative décrit une capacité à
produire du contenu nouveau ; elle s'appuie souvent sur le Deep Learning, mais désigne un objectif
de système plutôt qu'un niveau supplémentaire de cette hiérarchie. Le traitement du langage, la
vision par ordinateur, la parole, la recommandation, la recherche, l'optimisation et la planification
décrivent des domaines ou des capacités, pas tous des sous-domaines de l'IA au même sens. Selon le
besoin, ils peuvent s'appuyer sur des règles, du Machine Learning ou du Deep Learning.

| Approche | À retenir lorsque… | Exemples de tâches |
|---|---|---|
| Règles, requêtes, recherche ou calcul déterministe | Les règles sont explicites et le résultat doit être exact, reproductible et vérifiable. C'est le point de comparaison initial, pas une capacité d'IA à ajouter par défaut. | Calcul métier, contrôles, filtres, recherche exacte, workflow déterministe |
| Machine Learning classique | Des données représentatives permettent d'apprendre une relation et de prédire une cible mesurable ; les données sont souvent tabulaires ou les caractéristiques peuvent être décrites explicitement. | Classification, score, régression, prévision tabulaire, détection d'anomalies |
| Deep Learning | Le problème porte sur des données complexes ou non structurées et les méthodes plus simples n'atteignent pas les critères attendus ; des données représentatives, un modèle adapté et les moyens d'entraînement ou d'inférence sont disponibles. | Image, audio, parole, texte complexe, perception multimodale |
| IA générative | Le résultat demandé est un contenu nouveau ou une transformation souple d'une entrée : texte, image, audio ou code. Les réponses factuelles doivent être ancrées dans des sources vérifiables et contrôlées selon le risque. | Rédaction, résumé, extraction souple, dialogue, génération ou transformation multimodale |
| Méthode ou domaine ciblé | Le besoin correspond mieux à une capacité ciblée, sans imposer un modèle génératif. Comparer aussi les méthodes déterministes et les méthodes apprises. | Traitement du langage, vision, reconnaissance vocale, recommandation, recherche, optimisation, planification ou apprentissage par renforcement |

Pour chaque cas d'usage, suivre ces étapes :

1. Décrire l'utilisateur, la décision ou tâche à accomplir, les entrées autorisées, la sortie attendue,
   les erreurs acceptables et les conséquences d'une erreur.
2. Définir une solution de référence simple. Si une règle, une requête, un calcul ou une recherche
   existante atteint le niveau requis, conserver cette solution sans ajouter d'IA.
3. Si une capacité apprise est nécessaire, identifier le type de tâche, les données disponibles,
   leur qualité, leur représentativité, les étiquettes disponibles et la possibilité d'évaluer les
   résultats. Ne pas retenir une méthode qui exige des données absentes ou de qualité insuffisante.
4. Comparer les approches candidates sur des cas représentatifs et des critères définis avant
   l'évaluation : qualité, erreurs critiques, explicabilité, latence, coût total, confidentialité,
   sécurité, disponibilité et facilité de maintenance. Utiliser la méthode la plus simple qui
   atteint les seuils métier ; ne pas présumer qu'un modèle plus complexe est plus exact.
5. Prévoir la validation humaine, le repli vers un parcours sûr et la surveillance en exploitation
   lorsque les erreurs peuvent avoir un impact important ou que les sorties sont probabilistes.
6. Documenter dans le domaine le cas d'usage, les options évaluées, la solution retenue ou le motif
   de ne pas utiliser d'IA, les données et permissions, les critères de réussite, les limites et le
   comportement en cas d'échec. Les modèles génératifs ne deviennent pas une source de vérité pour
   les calculs, les permissions ou les règles métier.

Une décision qui introduit une nouvelle famille de modèles, un fournisseur d'inférence, un service
transverse ou une architecture nouvelle suit le processus ADR et la validation prévus par
[`architecture.md`](architecture.md). Pour les cas analogues dans d'autres applications, réutiliser
la démarche et les critères ; ne pas réutiliser automatiquement le même modèle, les mêmes données ou
la même décision technique.

## Deux usages distincts des agents

### Agents de développement

Un agent de développement déclare sa mission, son périmètre, les sources qu'il doit lire et les
vérifications attendues. Il applique les conventions du dépôt et ne déduit jamais une permission
métier de son rôle, de son prompt ou d'une skill. Les profils d'agent sont des consignes de travail,
pas des identités applicatives ni des mécanismes d'autorisation.

#### Conseil et décisions avec le propriétaire

L'agent aide le propriétaire sur les choix fonctionnels et techniques. Lorsqu'une piste peut améliorer
de façon concrète l'utilité métier, la sécurité, la qualité ou la maintenabilité du résultat, il la
présente au propriétaire avec son motif, les conséquences utiles à connaître et, si plusieurs choix
sont possibles, une recommandation. Il distingue clairement les faits vérifiés, les propositions et
les décisions déjà approuvées.

Les propositions sont expliquées en langage simple, compréhensible par une personne qui ne travaille
pas dans le développement. Tout terme technique nécessaire est expliqué. L'agent ne transforme pas
une proposition en décision et ne l'inscrit pas dans un PV, une documentation destinée aux lecteurs,
une convention ou le produit avant que le propriétaire l'ait approuvée. Cette règle s'applique
notamment aux changements de règle métier et aux choix d'architecture. Une fois approuvée, la décision
est consignée dans le document de référence approprié et mise en œuvre dans le périmètre autorisé.

Les conseils restent pertinents pour l'objectif en cours : ne pas multiplier les suggestions
secondaires ni interrompre une tâche pour des possibilités sans bénéfice concret.

Les rôles de travail réutilisables peuvent couvrir le backend, le frontend/design system, la
sécurité/audit et les données/IA. Chaque rôle reste limité à sa mission et renvoie aux conventions
et à la documentation du projet au lieu de recopier leurs règles.

### Agents intégrés à l'application

Un agent applicatif aide l'utilisateur à accomplir un cas d'usage du domaine. Il appelle les
capacités publiées par l'application au moyen de contrats autorisés ; il ne lit ni n'écrit
directement dans une base transactionnelle. Les règles métier, les indicateurs et les décisions
d'accès restent sous la responsabilité de leurs domaines propriétaires.

Un agent explicite son état et ses limites à l'utilisateur. Une action sensible exige une
confirmation humaine lorsque son risque le justifie. Les erreurs, refus et résultats doivent rester
compréhensibles et vérifiables.

## Skills

Une skill fournit une procédure ou du contexte vérifié. Elle ne constitue ni une source d'autorité
métier autonome ni un droit d'accès.

Une skill de domaine réside avec la documentation de ce domaine, par exemple dans
`docs/<domaine>/skills/`. Elle doit :

* indiquer son objectif, son périmètre et les sources métier faisant autorité ;
* renvoyer aux README, contrats et documents RBAC pertinents au lieu d'en recopier les règles ;
* décrire les invariants et critères de vérification nécessaires à la tâche ;
* employer des exemples synthétiques, sans secrets ni données réelles ;
* rester synchronisée avec les documents du domaine.

Les procédures réutilisables entre applications ne doivent pas embarquer de règles métier propres à
un domaine. Le contexte présenté à l'agent et les sorties récupérées sont des données non fiables ;
ils ne peuvent pas modifier les permissions, les instructions de sécurité ou les validations serveur.

## IA dans les applications Java

Pour une application Spring Boot, Spring AI est le choix d'intégration par défaut. LangChain4j peut
être retenu lorsqu'un besoin vérifié le justifie ; employer les deux dans la même application
requiert une raison documentée dans un ADR. Vérifier les versions stables, leur compatibilité avec
le JDK et Spring Boot du projet, et verrouiller les dépendances. ERP-RH est en Spring Boot 4 : retenir
la ligne de Spring AI qui le prend en charge officiellement, jamais une ligne prévue pour Spring Boot 3.

Avec Spring AI :

* chaque agent est un bean `ChatClient` construit à partir d'un `ChatClient.Builder`, avec ses
  instructions système, ses outils et ses advisors propres ; aucun agent ne partage par défaut les
  outils ou la mémoire d'un autre ;
* les outils sont des méthodes `@Tool` d'adaptateurs qui appellent les cas d'usage publics du
  domaine (même règle que [`mcp.md`](mcp.md)) ; jamais un repository ni une requête SQL ;
* la mémoire, la récupération documentaire, la journalisation et les garde-fous passent par des
  advisors explicitement configurés, dans un ordre documenté ;
* le client de modèle pointe vers la passerelle de modèles (section suivante), jamais directement
  vers un fournisseur.

Un graphe d'orchestration Java tel que LangGraph4j n'est pertinent que pour un workflow ayant un
état explicite, des branches, des reprises, des étapes parallèles ou une validation humaine. Un
enchaînement linéaire reste un service ou un workflow simple. Le choix d'un graphe ne donne aucun
droit supplémentaire aux outils.

Si une capacité requise n'est pas raisonnablement disponible dans l'écosystème Java retenu, un
composant Python séparé peut être proposé. Il communique au travers d'un contrat authentifié et ne
duplique pas les règles métier ni la propriété des données de l'application Java. Ce choix et son
périmètre sont justifiés par un ADR.

## Passerelle de modèles

L'application n'appelle jamais un fournisseur de modèles directement. Elle passe par une passerelle
compatible avec l'API OpenAI, auto-hébergée ; **LiteLLM** (proxy open source) est le choix de référence.
La passerelle est un composant d'infrastructure, déployé avec Docker Compose comme les autres services,
et ne contient aucune règle métier.

* **Alias de modèles.** L'application demande un alias de rôle (`agent-rapide`, `agent-raisonnement`,
  `embedding`…), jamais un nom de modèle de fournisseur. La correspondance alias → modèles vit dans la
  configuration de la passerelle, versionnée.
* **Bascule et répartition.** Pour un même alias, la passerelle déclare plusieurs modèles de
  fournisseurs différents, avec bascule automatique sur erreur, limite de débit ou quota épuisé, et
  répartition de charge. Les modèles d'un même alias doivent avoir des capacités comparables (appels
  d'outils, sortie structurée, taille de contexte) ; vérifier ces capacités par les évaluations, pas
  par la documentation du fournisseur seule.
* **Offres gratuites.** Les quotas gratuits de plusieurs fournisseurs peuvent être combinés derrière un
  alias, dans le respect des conditions d'utilisation de chacun : un compte par fournisseur et par
  usage déclaré, jamais de multiplication de comptes pour contourner un quota. Une offre gratuite peut
  disparaître ou changer sans préavis : chaque alias garde un repli (autre fournisseur ou modèle
  auto-hébergé, par exemple via Ollama), et l'application affiche un état dégradé compréhensible
  quand aucun modèle ne répond.
* **Clés et budgets.** Les clés des fournisseurs restent dans la passerelle, jamais dans
  l'application ni dans Git. L'application dispose d'une clé virtuelle de passerelle par
  environnement, avec un budget et des limites de débit.
* **Cache.** Un cache exact ou sémantique n'est permis que pour des requêtes sans donnée propre à un
  utilisateur (documentation publique, données synthétiques). Dès qu'une requête dépend de l'identité,
  des permissions ou de données d'un utilisateur, le cache est désactivé ou cloisonné par utilisateur
  et par périmètre : une réponse ne doit jamais être servie à quelqu'un qui n'aurait pas pu l'obtenir.
  Les résultats d'outils ne sont jamais mis en cache par la passerelle.

## Classification des données et choix du fournisseur

Avant d'envoyer une donnée à un modèle, la classer. La classification détermine les fournisseurs admis
pour l'alias concerné :

| Classe | Exemples | Fournisseurs admis |
|---|---|---|
| Publique ou synthétique | Textes réglementaires publics, documentation, jeux de données fictifs, données de démonstration | Tous, y compris les offres gratuites |
| Interne non personnelle | Procédures internes, paramétrage, statistiques agrégées non ré-identifiantes | Offres dont les conditions excluent l'entraînement sur les requêtes, ou modèle auto-hébergé |
| Personnelle ou sensible | Employés, paie, identité, santé, évaluations | Modèle auto-hébergé, ou offre contractuelle sans entraînement ni conservation, après décision documentée dans un ADR |

Une offre gratuite peut utiliser les requêtes pour améliorer ses modèles : ne jamais lui envoyer une
donnée réelle d'une classe supérieure à « publique ou synthétique ». La classe d'une requête est celle
de la donnée la plus sensible qu'elle contient, résultats d'outils et mémoire compris. Le routage par
classe est configuré dans la passerelle et vérifié par des tests ; il n'est jamais laissé au modèle.

ERP-RH ne contient aujourd'hui que des données fictives : toutes les classes peuvent être testées avec
les offres gratuites. Le passage à des données réelles exige de revoir les alias et leurs fournisseurs
avant la mise en service.

## Orchestration multi-agents

### Commencer simple

Un agent n'est créé que pour un besoin identifié. L'ordre de préférence est :

1. un appel de modèle unique avec récupération et sortie structurée ;
2. un workflow déterministe qui enchaîne des appels de modèle (routage, enchaînement, parallélisation,
   évaluation-correction) ;
3. un agent avec des outils ;
4. plusieurs agents, seulement quand le contexte, les outils ou les instructions d'un sous-domaine
   doivent être isolés pour rester fiables, ou quand des sous-tâches indépendantes gagnent à s'exécuter
   en parallèle.

Ne pas créer un agent par entité ou par écran : un micro-agent sans contexte ni outils propres est un
coût (tokens, latence, erreurs de routage) sans bénéfice.

### Agents de domaine

Un agent de domaine (« micro-agent ») appartient à un domaine du monolithe modulaire et ne travaille
que sur ses outils, ses skills (`docs/<domaine>/skills/`) et son contexte. Il réside dans le package de
son domaine, déclare son nom, sa mission, ses outils, son alias de modèle et son budget, et n'importe
aucun outil d'un autre domaine. Un besoin d'un autre domaine passe par l'agent ou par les outils publics
de ce domaine.

### Superviseur et agents exposés comme outils

Le modèle de collaboration de référence est le **superviseur** (orchestrateur) :

* le superviseur reçoit la demande de l'utilisateur, la décompose et délègue aux agents de domaine ;
* chaque agent de domaine est exposé au superviseur comme un **outil** (« agent-as-tool ») : une entrée
  typée (la sous-tâche), une sortie typée (résultat, sources, état : réussi, refusé, besoin de
  confirmation) ;
* l'agent délégué ne reçoit que la sous-tâche et le contexte nécessaire, jamais tout l'historique du
  superviseur ; il ne rend qu'un résultat synthétique et vérifiable ;
* les agents de domaine ne s'appellent pas directement entre eux. Une collaboration entre deux domaines
  passe par le superviseur, ce qui garde un seul point de décision, de trace et de budget.

La chorégraphie pair-à-pair (agents qui s'appellent librement ou réagissent à des événements entre eux)
n'est pas retenue : elle rend les boucles, les coûts et la responsabilité d'une action difficiles à
contrôler et à auditer. Un workflow à état explicite, avec reprises, branches ou validation humaine,
peut utiliser un graphe d'orchestration (voir LangGraph4j plus haut), sous les mêmes règles.

### Règles communes à toute délégation

* **Identité.** Un agent délégué agit avec l'identité et les permissions de l'utilisateur à l'origine
  de la demande, jamais avec un compte technique plus puissant. Une délégation ne peut que restreindre
  les droits.
* **Bornes.** Profondeur de délégation, nombre d'appels d'outils, nombre d'itérations, durée et budget
  de tokens sont plafonnés par demande ; au plafond, l'agent s'arrête et rend un état explicite.
* **Corrélation.** Une demande porte un identifiant de corrélation transmis à chaque délégation et à
  chaque appel d'outil (voir [`logging.md`](logging.md) et [`audit.md`](audit.md)).
* **Confirmation.** Une action sensible demandée par un agent délégué remonte au superviseur puis à
  l'utilisateur ; elle n'est jamais confirmée par un autre agent.

## Mémoire des agents

La mémoire est organisée en trois niveaux. Aucun ne devient une source de vérité métier : une valeur
métier (salaire, effectif, statut) est toujours relue dans son domaine au moment où elle sert.

| Niveau | Contenu | Stockage | Durée |
|---|---|---|---|
| Courte | Derniers échanges de la conversation, en fenêtre glissante bornée en messages et en tokens | Base de l'application (PostgreSQL), par conversation et par utilisateur | La conversation, puis la rétention définie |
| Compactée | Résumé des échanges sortis de la fenêtre, produit en arrière-plan quand le budget de contexte est dépassé | Même stockage, lié à la conversation, avec la version du modèle et du prompt de résumé | Comme la conversation |
| Longue | Préférences de l'utilisateur, procédures apprises et faits validés, avec provenance | Base de l'application ; graphe de connaissances seulement selon [`rag.md`](rag.md) | Jusqu'à suppression par l'utilisateur ou fin de la rétention |

* **Courte.** Utiliser la mémoire de conversation de Spring AI (`ChatMemory`, fenêtre de messages) avec
  un dépôt JDBC sur la base existante, injectée par un advisor. La conversation est rattachée à
  l'utilisateur authentifié : un utilisateur ne peut jamais lire ni poursuivre la conversation d'un
  autre.
* **Compactée.** Le résumé conserve, sans les reformuler, les consignes obligatoires, les permissions,
  les confirmations en attente, les décisions prises et la provenance des informations (voir
  « Sobriété du contexte »). Les messages d'origine restent consultables pendant leur rétention pour
  vérifier un résumé.
* **Longue.** Un fait n'entre en mémoire longue que s'il est explicite, sourcé et utile à plusieurs
  conversations. L'utilisateur peut consulter, corriger et supprimer sa mémoire. Ne pas mémoriser des
  informations sur d'autres personnes déduites d'une conversation : elles relèvent de leur domaine.
  L'écriture en mémoire longue est une action tracée ; la mémoire relue est une donnée non fiable, au
  même titre qu'un document récupéré.

Chaque niveau a une taille maximale et une règle de rétention et de suppression documentées. Les tests
vérifient l'isolation entre utilisateurs, la conservation des éléments obligatoires après compactage et
la suppression effective.

## Interopérabilité entre agents d'applications différentes

MCP expose des **outils** et des ressources (voir [`mcp.md`](mcp.md)). Pour qu'un agent d'une
application délègue une tâche à l'agent d'une autre application (cible « application IA d'entreprise »
ci-dessous), utiliser le protocole **A2A** (Agent2Agent) : chaque agent publie une carte décrivant ses
compétences, et les tâches s'échangent avec leur état. A2A ne remplace ni l'authentification, ni la
revérification des permissions par l'application qui exécute la tâche. À l'intérieur d'une même
application, la délégation reste un appel Java (agent exposé comme outil), sans protocole réseau.

## Exploitation des agents

* **Observabilité.** Tracer chaque demande : agents traversés, outils appelés, modèle réellement servi
  par la passerelle, tokens, coût, durée et résultat, avec OpenTelemetry et un outil open source
  d'observation des LLM (par exemple Langfuse, auto-hébergé). Le contenu des prompts et des réponses
  n'est conservé qu'en environnement de test ou de façon masquée (voir [`logging.md`](logging.md)).
* **Budgets.** Un budget de tokens et de coût par demande, par utilisateur et par jour, appliqué par
  l'application et par la passerelle.
* **Arrêt.** Un interrupteur de configuration coupe l'IA (globalement ou par agent) sans redéployer ;
  l'application reste pleinement utilisable sans elle.
* **Garde-fous.** Les entrées et les contenus récupérés sont traités comme non fiables (injection de
  prompt) ; les sorties structurées sont validées par schéma avant usage ; une sortie invalide est un
  échec explicite, pas une réponse partielle silencieuse.

## Découverte des outils à la demande (Tool Search)

Quand un agent dispose d'un catalogue d'outils trop large pour être chargé en entier dans son
contexte, utiliser une recherche d'outils à la demande : le modèle décrit la capacité nécessaire,
reçoit les outils candidats avec leur objectif et leur schéma, puis choisit explicitement lequel
appeler. Ne charger les définitions complètes que pour les outils retenus. Pour un petit catalogue,
une liste directe reste plus simple.

La recherche porte uniquement sur les outils explicitement configurés et publiés par leurs
propriétaires. Elle peut retrouver ou classer des capacités ; elle ne crée pas d'outil et n'accorde
aucun droit. Un outil découvert reste soumis à l'authentification et à la vérification serveur de
l'identité, de la permission et du périmètre à chaque appel. Une absence du résultat de recherche
n'est pas une mesure de sécurité. Les descriptions, schémas et résultats de découverte sont des
données ; ils ne peuvent pas remplacer les instructions de sécurité ou les contrôles métier.

Évaluer aussi la découverte elle-même : l'outil pertinent est-il retrouvé, les outils hors sujet ou
non autorisés sont-ils écartés, et l'agent choisit-il le bon outil et ses arguments pour la tâche ?
Les tests d'autorisation vérifient séparément que le serveur refuse toujours un appel interdit,
même si le modèle tente un outil non pertinent ou non autorisé.

## Sobriété du contexte

Concevoir chaque requête avec un budget de contexte explicite. Conserver les instructions système,
les politiques de sécurité, les autorisations, les contraintes métier et l'état de confirmation
nécessaires ; charger à la demande seulement les sources, extraits, historique et schémas d'outils
pertinents pour la tâche. Éviter de répéter des consignes, d'injecter tout l'historique ou de
précharger des documents et catalogues entiers lorsque leur recherche ciblée suffit.

La synthèse ou la troncature ne doit jamais effacer une consigne obligatoire, une permission, une
demande de confirmation encore en attente, la provenance d'une information ou une réserve qui
change la décision. Pour une décision à fort impact, retrouver et vérifier la source d'origine au
lieu de se fier uniquement à un résumé. Borner aussi le nombre et la taille des résultats d'outils
et du contenu transmis au modèle.

Mesurer le volume de tokens par source (instructions, historique, récupération, schémas et sorties)
sans journaliser le contenu sensible. Réduire ce volume seulement si les évaluations montrent que la
pertinence, l'ancrage dans les sources, la sécurité et la réussite des tâches restent au niveau
attendu.

## Vision cible de l'entreprise

À terme, une application IA d'entreprise distincte pourra orchestrer des cas d'usage entre les
applications des différents départements. Cette cible est une orientation, pas un chantier
d'implémentation immédiat : la priorité est de terminer et valider les conventions et les capacités
de chaque application, en commençant par ERP-RH.

Lorsqu'elle sera engagée, l'application IA globale consommera les outils MCP authentifiés publiés
par les applications. Elle ne se connectera pas directement à leurs bases OLTP, ne remplacera pas
leurs règles métier et ne pourra pas élargir les permissions de l'utilisateur. Les données et
indicateurs resteront détenus par leurs domaines ; tout corpus partagé devra préserver les droits et
la provenance des sources.

Pour les événements vers l'interface, les surfaces génératives et la mascotte, appliquer
[`agent-ui.md`](agent-ui.md). Cette convention ne remplace pas les contrôles d'identité, de permission et d'audit
définis ici, dans `security.md`, `audit.md` et `mcp.md`.

## Évaluation

Les assertions déterministes — identité, permissions, schémas, provenance, refus et absence de fuite
— sont séparées des évaluations probabilistes de la qualité des réponses. Les jeux d'évaluation,
modèles, prompts et outils sont versionnés et anonymisés. Les exigences et cas de tests sont définis
dans [`testing.md`](testing.md).

Une évaluation « LLM as a judge » peut noter des qualités sémantiques difficiles à vérifier par une
assertion exacte, par exemple la pertinence, la clarté, l'ancrage dans les sources ou la réussite
d'une tâche. Elle complète les métriques déterministes et la revue humaine ; elle ne les remplace
pas. Le juge utilise une grille explicite avec critères observables et une sortie structurée. Calibrer
ses notes sur un échantillon annoté par des personnes, suivre les désaccords et vérifier sa stabilité
avant de s'en servir comme porte de livraison.

Versionner le modèle et le prompt du juge, la grille, le jeu de cas et les références fournies.
Utiliser des données synthétiques ou anonymisées, et ne jamais confier au juge la décision finale sur
les permissions, la sécurité, la conformité ou une valeur métier calculable. Ces propriétés restent
couvertes par des contrôles déterministes et des sources métier faisant autorité.

## Références

Les bibliothèques et protocoles évoluent. Vérifier les versions stables et les guides officiels au
moment de l'adoption ou d'une mise à niveau :

* [Spring AI](https://docs.spring.io/spring-ai/reference/)
* [LangChain4j](https://docs.langchain4j.dev/)
* [LangGraph4j](https://langgraph4j.github.io/langgraph4j/)
* [Spécification MCP](https://modelcontextprotocol.io/specification/)
* [Protocole A2A](https://a2a-protocol.org/)
* [LiteLLM](https://docs.litellm.ai/)
* [Spring AI — Neo4j Vector Store](https://docs.spring.io/spring-ai/reference/api/vectordbs/neo4j.html)
* [Langfuse](https://langfuse.com/docs)
* [Building effective agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
