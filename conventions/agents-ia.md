# Agents, skills et IA applicative

Cette convention s'applique aux applications qui intègrent des capacités d'IA et aux agents qui
contribuent à leur développement. Elle fixe les règles communes ; chaque application documente ses
cas d'usage, ses modèles, ses outils, ses données et ses décisions techniques dans `docs/` et ses
ADR.

## Deux usages distincts des agents

### Agents de développement

Un agent de développement déclare sa mission, son périmètre, les sources qu'il doit lire et les
vérifications attendues. Il applique les conventions du dépôt et ne déduit jamais une permission
métier de son rôle, de son prompt ou d'une skill. Les profils d'agent sont des consignes de travail,
pas des identités applicatives ni des mécanismes d'autorisation.

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
le JDK et Spring Boot du projet, et verrouiller les dépendances.

Un graphe d'orchestration Java tel que LangGraph4j n'est pertinent que pour un workflow ayant un
état explicite, des branches, des reprises, des étapes parallèles ou une validation humaine. Un
enchaînement linéaire reste un service ou un workflow simple. Le choix d'un graphe ne donne aucun
droit supplémentaire aux outils.

Si une capacité requise n'est pas raisonnablement disponible dans l'écosystème Java retenu, un
composant Python séparé peut être proposé. Il communique au travers d'un contrat authentifié et ne
duplique pas les règles métier ni la propriété des données de l'application Java. Ce choix et son
périmètre sont justifiés par un ADR.

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
