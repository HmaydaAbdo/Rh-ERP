# Progression des interfaces IA par domaine

**Cible produit demandée le 2026-10-23 ; aucun de ces nouveaux modes n'est livré.**
La réalisation suit les tâches et validations du [plan](plan-integration.md), sur la branche
`codex/integration-ia-mcp-rag`. L'[ADR 0013](../adr/0013-integration-ia-mcp-langgraph-rag.md)
garde ouverts les choix techniques. Le premier travail est P1.1, pas une refonte de l'interface.

## Cinq modes complémentaires

| Mode | Ce que l'utilisateur obtient | Limite de présentation |
|---|---|---|
| M0 — Classic UI | Tableaux, formulaires, Cartes et Analytique existants | Parcours conçus et maintenus par l'application |
| M1 — Chat | Question, clarification, réponse citée et accès au parcours métier | Texte et liens autorisés ; les données structurées viennent des outils métier |
| M2 — Controlled agentic UI | Résultat dans une carte/tableau ou proposition d'action prédéfinie | Composants et actions explicitement enregistrés, entrées typées |
| M3 — Declarative UI / A2UI | Surface composée selon la demande : indicateurs, tableau, graphique et sources | Catalogue Staport approuvé, schéma validé, composition et données bornées |
| M4 — Open-ended UI | Espace exploratoire pour un besoin que le catalogue ne couvre pas suffisamment | Étude future ; aucune exécution de code généré autorisée par ce document |

Les modes coexistent. Chaque parcours conserve un accès compréhensible à M0 ; aucun domaine
n'est obligé d'activer M4 ou tous les modes pour être utile. AG-UI relie client et agent dans les
modes assistés ; A2UI décrit une surface. MCP sert les outils, RAG les connaissances et A2A une
éventuelle délégation entre systèmes : ces responsabilités restent distinctes.

**Deux axes indépendants :** liberté de présentation et autonomie d'action. Une surface M3/M4
peut rester entièrement en lecture. Une action sensible, même dans M1 ou M2, conserve identité,
droits, contrôles métier, confirmation requise et audit côté Spring. Le premier pilote est en
lecture seule. Le modèle ne devient jamais la source des chiffres ou des décisions métier.

## Socle commun et continuité de contexte

Partager conversation/état de run, streaming, annulation, composants Staport, sources, confirmations
et reprise. Les contrats, outils, données, indicateurs et règles restent dans leur domaine.
Une nouvelle surface réutilise les vues partagées existantes lorsqu'elles conviennent ; aucun
nouveau tableau ou moteur Cartes/Analytique n'est construit par domaine pour adopter l'IA.

Le passage écran → chat → surface → écran conserve les filtres, la période et la sélection
pertinents, avec un contexte visible et modifiable. Toute ambiguïté de période, d'identité ou de
périmètre appelle une clarification. Les URL et paramètres sont validés ; le contexte n'accorde
aucune permission. Après expiration ou changement de droits, la reprise réautorise les données.
Les réponses indiquent la date/période des données, les sources autorisées et les limites utiles.

## Matrice de parcours candidats

Les exemples ci-dessous sont des objectifs à confirmer avec le propriétaire du domaine,
pas de nouvelles règles métier ni des contrats d'outils approuvés. Les écritures sont exclues du
premier passage. Pointage et paie calculée restent des domaines futurs, hors de ce pilote.

| Domaine et source métier | M1 — Chat proposé | M2 — Controlled proposé | M3 — A2UI proposé | M4 — Question d'étude |
|---|---|---|---|---|
| [Chantier](../chantier/README.md) | Retrouver et expliquer une fiche autorisée | Carte fiche + ouverture du périmètre existant | Composer fiche, répartition autorisée et sources | Une visualisation exploratoire apporte-t-elle davantage que Cartes/Analytique ? |
| [Employé](../employee/README.md) | Expliquer la fiche et le parcours autorisés | Carte employé et historique depuis les contrats métier | Composer parcours et répartitions autorisées | Quel besoin reste non couvert sans exposer de données personnelles supplémentaires ? |
| [Paie](../paie/README.md) | Expliquer un bulletin ou un résultat d'analyse existant | Tableau de résultats avec période et filtres visibles | Composer une analyse depuis les indicateurs du domaine | La liberté visuelle améliore-t-elle une lecture sans inventer de calcul salarial ? |
| [Équipe](../equipe/README.md) | Retrouver une équipe et comprendre ses données disponibles | Fiche et lien vers le périmètre partagé | Composer les répartitions que le domaine autorise | Le catalogue commun suffit-il ? |
| [Fonction](../function/README.md) | Expliquer un libellé et les données disponibles | Fiche et liste filtrée par fonction | Composer répartition et sources autorisées | Existe-t-il une question nécessitant un nouveau type de visualisation ? |
| [Rapport](../report/README.md) | Aider à choisir les paramètres d'un rapport existant | Prévisualiser la sélection dans l'assistant actuel | Composer un aperçu depuis les résultats autorisés | Un format exploratoire justifie-t-il une nouvelle surface ? |
| [Auth](../auth/README.md), [Audit](../audit/README.md), [Paramètres](../parametre/README.md) | Expliquer les procédures et données accessibles à chacun | Cartes d'explication et navigation connues | Comparer seulement des informations autorisées et utiles | Étude séparée par domaine ; pas d'édition libre des droits, journaux ou paramètres |

La dernière ligne regroupe des sujets d'administration pour la lisibilité de la feuille de route ;
leurs droits et leurs tests restent séparés. `EMPLOYEE_READ` ne révèle pas les salaires sans
`PAIE_READ` ; un rapport/export conserve sa permission propre. Le RAG recherche les procédures
publiées et autorisées, tandis que les données et agrégats actuels passent par les façades métier.

## Porte d'activation pour chaque domaine et chaque mode

Avant réalisation : choisir un parcours et un utilisateur, une maquette, les actions/données
autorisées, une baseline M0 et les critères mesurables. Le propriétaire confirme les seuils
d'utilité, latence et coût ; aucun seuil métier n'est inventé par le développeur.

| Preuve requise | Résultat à présenter avant validation du mode |
|---|---|
| Utilité | Même tâche sur M0 et nouveau mode ; résultat exact, effort observé et revue utilisateur |
| Droits et ancrage | Tests négatifs acteur/champs/sources, chiffres identiques au domaine, citations vérifiées ou abstention |
| Continuité | Retour M0 avec contexte, ambiguïté, droits révoqués, run interrompu et reprise testés |
| Interface | Navigateur réel, clavier/focus, lecteur d'écran, mobile, thèmes, états vide/erreur/refus et repli |
| Robustesse et coût | Schéma/composant/action inconnus refusés, limites testées, latence/bundle/coût mesurés |
| Revue | Rapports, captures, documentation domaine et handoff ; accord propriétaire daté avant le mode suivant |

## Décision future sur l'open-ended

Comparer d'abord une composition A2UI plus riche dans le catalogue approuvé, puis, seulement si
elle échoue sur un besoin mesuré, une surface de code UI isolée. La convention actuelle interdit
HTML/CSS/JavaScript arbitraire : un prototype exécutable exige auparavant un ADR et une évolution
normative approuvés. Une iframe annoncée comme sandbox ne constitue pas à elle seule cette preuve.
L'étude définirait isolation d'origine, CSP/réseau, messages typés, ressources, stockage, durée de
vie et arrêt ; aucun accès direct aux secrets, cookies, données métier ou écritures libres.
MCP Apps est une option à comparer si des outils doivent livrer une surface, pas un prérequis.

## Références officielles vérifiées le 2026-10-23

- [AG-UI : interactions agent/interface](https://docs.ag-ui.com/introduction).
- [A2UI : schémas, catalogues et renderers](https://a2ui.org/).
- [CopilotKit Angular : composants et surfaces déclaratives](https://docs.copilotkit.ai/angular/concepts/generative-ui-overview).
- [CopilotKit Open Generative UI](https://docs.copilotkit.ai/generative-ui/open-generative-ui) : génération HTML/CSS/JS ; l'exemple React ne prouve pas la compatibilité Angular du dépôt.
