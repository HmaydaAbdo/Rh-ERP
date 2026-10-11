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

## Références

Les bibliothèques et protocoles évoluent. Vérifier les versions stables et les guides officiels au
moment de l'adoption ou d'une mise à niveau :

* [Spring AI](https://docs.spring.io/spring-ai/reference/)
* [LangChain4j](https://docs.langchain4j.dev/)
* [LangGraph4j](https://langgraph4j.github.io/langgraph4j/)
* [Spécification MCP](https://modelcontextprotocol.io/specification/)
