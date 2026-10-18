# Outils MCP

MCP est le contrat d'interopérabilité des capacités métier destinées aux agents. Toute application
destinée à participer à un écosystème IA expose, par MCP, les opérations métier pertinentes pour
ses cas d'usage. Elle conserve ses API et services comme frontières métier. Les outils MCP sont
des adaptateurs vers les cas d'usage publics du domaine, jamais un accès parallèle aux repositories
ou aux règles métier. L'exposition n'implique pas d'exposer toutes les opérations CRUD.

## Contrat des outils

Chaque outil possède un nom et un objectif explicites, un propriétaire métier, un schéma d'entrée et
de sortie typé et documenté, et des limites de taille et de résultats. Les recherches paginées
définissent leurs limites et leur ordre. Séparer les outils de lecture des outils d'écriture, et ne
pas exposer indistinctement toutes les routes CRUD de l'application.

Pour un catalogue important, l'agent peut rechercher les outils pertinents à la demande (Tool
Search) et ne charger ensuite que leurs descriptions et schémas. La recherche doit rester bornée au
catalogue publié et configuré. Elle ne change pas les permissions : le serveur contrôle chaque appel
selon l'identité et le périmètre effectifs.

Les outils sont bornés et prévisibles : valider les entrées côté serveur, fixer des délais d'attente
et des quotas, définir les reprises et rendre les écritures idempotentes lorsque c'est nécessaire.
Une nouvelle tentative ne doit pas répéter un effet métier. Une action sensible exige une
confirmation humaine selon son risque ; son résultat et, si possible, sa procédure d'annulation sont
expliqués à l'utilisateur.

## Ce que publie le serveur MCP

Un serveur MCP publie des **capacités**, pas des agents :

| Primitive MCP | Usage |
|---|---|
| Outils (`tools`) | Opérations métier des domaines, lecture et écriture séparées. Un agent de domaine peut aussi être publié comme un outil de haut niveau (une sous-tâche en entrée, un résultat typé en sortie), sous les mêmes règles qu'un outil |
| Ressources (`resources`) | Contenus en lecture seule et adressables : documentation, référentiels publiés, documents d'un corpus autorisé |
| Prompts (`prompts`) | Modèles de demande réutilisables proposés aux clients, versionnés avec l'application |

La délégation d'une tâche à un agent d'une autre application relève du protocole A2A (voir
[`agents-ia.md`](agents-ia.md)), pas de MCP.

Organiser le catalogue par domaine : chaque domaine déclare ses outils, ressources et prompts dans son
propre package, et le serveur les assemble. Les noms sont préfixés par le domaine
(`paie_rechercher_bulletins`, `chantier_lire_fiche`) pour rester uniques et lisibles dans un catalogue
commun.

## Implémentation avec Spring AI

* Utiliser le starter de serveur MCP de Spring AI compatible avec la version de Spring Boot du projet,
  en transport HTTP « Streamable HTTP » pour un serveur réseau (stdio uniquement pour un outil local de
  développement).
* Déclarer les outils par annotation (`@Tool` ou les annotations MCP de Spring AI selon la version
  retenue) sur des adaptateurs du domaine qui délèguent aux services publics, jamais sur les services
  eux-mêmes ni sur les repositories.
* Protéger l'endpoint comme une API : authentification OAuth2/jeton porteur selon la spécification
  d'autorisation MCP et [`security.md`](security.md), puis contrôle de permission dans chaque outil.
* Publier le catalogue de façon explicite (liste d'outils activés par configuration) ; un outil ajouté
  au code n'est pas exposé tant qu'il n'est pas déclaré.
* Les notifications de changement de catalogue et les réponses longues (progression, annulation)
  suivent la spécification ; une annulation n'annule pas un effet métier déjà confirmé.

## Identité, permissions et audit

Chaque appel porte l'identité et le contexte de corrélation nécessaires. L'application qui possède
l'outil réauthentifie ou valide l'identité déléguée et revérifie la permission effective et le
périmètre métier au moment de l'action. Un appel interservice ou un contexte agent ne contourne pas
le RBAC. Toute modification et tout refus pertinent suivent les conventions
[`security.md`](security.md) et [`audit.md`](audit.md).

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
