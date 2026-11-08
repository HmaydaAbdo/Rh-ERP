# Ingénierie agentique : abstraction à sa place, bon framework, bon outillage, transfert technologique voulu

> Décision du propriétaire, 2026-11-03. Ces quatre principes s'appliquent à toute tâche, avant d'écrire du code. Ils
> complètent les règles « Frameworks d'abord » et « Aucun choix arbitraire » d'[`AGENTS.md`](../AGENTS.md) ; ils ne les
> remplacent pas. La routine qui les met en œuvre est dans [`workflow.md`](workflow.md).

---

# 1. L'abstraction à sa place

Une abstraction n'est bonne que si elle est **au bon niveau** et **à la bonne couche**. Elle cache un détail qui change
ou une variation réelle ; sinon elle ajoute une couche à lire sans rien retirer.

Règles :

* **Le framework est la première abstraction.** Avant d'en écrire une, chercher celle que le framework retenu fournit
  (Spring Data, Angular, Deep Agents, LangGraph, CopilotKit, `openevals`…). L'abstraction maison n'existe que pour le
  métier d'ERP-RH ou pour le raccordement de deux briques, branchée sur un point d'extension officiel.
* **Une abstraction maison se justifie par deux usages réels au moins, ou par une frontière** (réseau, base de données,
  identité, modèle). Un seul usage reste concret (YAGNI, [`design-patterns.md`](design-patterns.md)).
* **Chaque règle vit dans une seule couche** : la règle métier dans le domaine, le droit dans le RBAC, la forme de
  l'outil dans sa définition MCP, le rendu dans le design system. Une règle recopiée dans une seconde couche diverge.
* **Une abstraction ne fuit pas.** Si l'appelant doit connaître le détail qu'elle cache, elle est mal placée : la
  supprimer ou la déplacer.
* **Pas d'abstraction par anticipation.** La proposition d'une nouvelle abstraction suit la règle « Décisions
  d'architecture » d'`AGENTS.md` (problème, options, recommandation, accord).
* **Comprendre ce que la couche cache.** Un framework ne dispense pas de savoir ce qu'il envoie au modèle : consulter
  les traces (Phoenix) avant d'affirmer qu'un comportement vient du modèle ou du framework. Source : Anthropic, *Building
  effective agents* (les couches d'abstraction cachent prompts et réponses ; comprendre ce que le framework fait en
  dessous).

Vérification en revue : pour chaque classe, module ou fonction ajouté, nommer son second usage ou sa frontière ; chercher
dans le framework l'équivalent officiel ; chercher une règle déjà écrite ailleurs.

## Objectif permanent : 0 % de code fait maison

Objectif du propriétaire (2026-11-03), conservé **tant qu'il n'est pas atteint** : le projet ne contient que du
métier, de la configuration et du raccordement branchés sur des points d'extension officiels. Tout autre code maison
est une **dette déclarée** : elle figure au registre ci-dessous, porte un ticket Jira rattaché à l'épopée « Résorption
du code maison » (E10, KAN-23) et une abstraction de remplacement. Une dette n'est jamais retirée du registre sans
que le code ait disparu.

## Registre des abstractions par cas d'usage

C'est à l'assistant de **proposer** l'abstraction officielle de chaque cas d'usage ; le propriétaire valide. Avant
d'écrire du code pour un cas d'usage, on cherche sa ligne ici ; s'il n'y en a pas, on en propose une (framework,
point d'extension, source officielle) avant le code. Le registre est mis à jour dans la PR qui change le choix.

| Cas d'usage | Abstraction officielle retenue | Code maison restant (dette) |
|---|---|---|
| Boucle d'agent, outils, compétences, sous-agents | Deep Agents `create_deep_agent`, `SkillsMiddleware`, `pinned_skills` | texte du prompt système (configuration) |
| Choix des outils visibles par tour | `SkillsMiddleware` avec résolveur lié à l'identité ; repli par lecture du `SKILL.md` | `routage.py` (embeddings MiniLM, déclaré) : à remplacer si un point d'extension officiel équivalent apparaît |
| Limites et pannes de la boucle | `ModelCallLimitMiddleware`, `ToolCallLimitMiddleware`, `ToolRetryMiddleware`, `ToolErrorMiddleware` | aucune |
| Contrôle de la réponse finale | middleware `after_agent` (guardrails LangChain) | motifs de `garde_sortie.py` (règle métier de sécurité) |
| Interface composée à partir des résultats | A2UI et `CopilotKitMiddleware` | `surfaces.py` (middleware `wrap_tool_call`, motif officiel) : à vérifier contre la version courante de CopilotKit |
| Conversations durables | `AsyncPostgresSaver` (LangGraph) | raccordement dans `memoire.py` |
| Protocole agent ↔ interface | AG-UI via `LangGraphAGUIAgent` | filtres de sortie de `agui.py` (événements RAW, erreur générique) |
| Passerelle de modèles | LiteLLM | configuration |
| Outils métier exposés à l'agent | serveur MCP Spring AI (backend), client MCP LangChain | définitions d'outils (métier) |
| Évaluation de l'agent | `openevals` (juge : `create_async_llm_as_judge`, fait), `agentevals` | rejoueur et critères déterministes de `evaluation.py` (dette déclarée, KAN-208 puis E10) |
| Traces et métriques | OpenTelemetry, Phoenix | configuration |
| Droits, périmètre, audit | Spring Security, `@PreAuthorize`, `@AuditableAction` | règles métier (permanentes) |
| Schéma de base de données | Flyway | aucune |
| Mapping objet ↔ DTO | MapStruct | aucune |
| Tableaux de données (frontend) | AG Grid | coque partagée (configuration par domaine) |
| Interface agentique (frontend) | CopilotKit + AG-UI ; Next.js (React) à l'épopée E3 | un seul outil côté navigateur à ce jour (KAN-210) |

La colonne « code maison restant » est la liste de travail de l'objectif 0 % : chaque ligne non vide a son ticket.

# 2. Le bon framework

Le choix du framework se fait **par le besoin**, jamais par habitude ni par popularité.

* **Test du besoin** : écrire le besoin en une phrase, puis lister ce que le framework retenu couvre nativement. Ce qui
  est couvert s'utilise tel quel ; ce qui ne l'est pas est présenté au propriétaire (option framework, ou absence
  d'option) avant tout code maison.
* **Première classe, pas en seconde zone.** Un framework dont l'intégration à notre pile est annexe (version
  expérimentale, port non officiel, support partiel) est un risque à décider par ADR, pas un détail. Exemple de décision
  prise : CopilotKit est d'abord un framework React ; l'interface agentique complète appartient donc à l'épopée Next.js
  (E3), pas à un prolongement de l'interface Angular.
* **Lecture avant choix** : la page officielle est lue en entier via Context7 puis la source de l'éditeur (règle
  « Documentation officielle lue »). Ce qui n'a pas été lu est écrit « non vérifié ».
* **Une brique, une raison.** Chaque dépendance ajoutée porte, dans la PR, le besoin qu'elle couvre et ce qu'elle
  remplace. Une dépendance déclarée et jamais utilisée est retirée ou utilisée.
* **Pas de simplicité fictive.** L'avis d'Anthropic (commencer au plus simple, n'ajouter de la complexité que si elle est
  mesurée) vaut pour l'agent aussi : un appel de modèle optimisé suffit parfois. Ici, l'agent est retenu pour les
  questions ouvertes à plusieurs outils ; une règle déterministe reste préférable pour une validation, un calcul ou un droit.

# 3. Le bon outillage

L'outillage fait gagner du temps ou de la sûreté **avant** la CI, qui n'est lancée que sur demande du propriétaire.

* **Contrôles locaux d'abord.** Tout contrôle de la CI (format, lint, types, tests rapides) doit pouvoir être lancé en
  une commande locale et, pour les plus courts, s'exécuter avant chaque commit. Une erreur trouvée par la CI après un
  push est une erreur que l'outillage local aurait dû trouver.
  L'outil est `pre-commit` (`.pre-commit-config.yaml`, KAN-209) ; la commande est dans
  [`site/docs/exploitation/developpement-local.md`](../site/docs/exploitation/developpement-local.md).
* **Un outil officiel par tâche** : formateur, linter, vérificateur de types, banc d'évaluation, trace ; chacun est celui
  que recommande l'éditeur du langage ou du framework (règle « Aucun choix arbitraire »).
* **Mesurer plutôt qu'affirmer.** Tout comportement d'agent se prouve par le banc d'évaluation (résultat, pas chemin) et
  par les traces ; une exécution unique ne prouve pas une stabilité (répétitions, `pass^k`).
* **Un test instable est une défaillance de l'outillage**, pas une fatalité : il est corrigé à sa cause (état partagé,
  attente, instance recréée) ou mis en quarantaine par ticket Jira ; il n'est jamais relancé jusqu'à ce qu'il passe.
* **Automatiser ce qui se répète** : la veille de versions, la régénération du catalogue d'outils, les verrous
  documentation/code (`scripts/ia/`). Une étape manuelle répétée trois fois devient un script.

# 4. Le transfert technologique voulu

Une pratique qui a fait ses preuves dans un domaine est **transférée volontairement** dans un autre, jamais par réflexe.

Le transfert suit quatre étapes écrites dans la description de la tâche ou l'ADR :

1. **Source** : la pratique, son domaine d'origine, la preuve qu'elle y fonctionne.
2. **Ce qui se transfère** : le principe, pas la syntaxe. Exemples déjà en place : le RBAC, le périmètre et l'audit de
   Spring deviennent les garde-fous de chaque outil MCP ; la mesure `pass^k` de l'évaluation des modèles devient la
   mesure de stabilité de l'agent ; la tolérance aux pannes des services (reprise, délai maximal) devient les
   middlewares de l'agent.
3. **Ce qui ne se transfère pas** : ce qui dépend du contexte d'origine (un typage statique, un cycle de vie de
   transaction, un coût déterministe). Le dire évite de copier un détail devenu faux.
4. **Preuve de transfert** : un test, une mesure ou une trace qui montre que la pratique donne ici le même effet.

Un transfert non écrit est un risque : le prochain lecteur copie la forme et perd l'intention.

# 5. Livrer de façon agentique

L'application est **agentique de bout en bout**, pas un ensemble d'écrans auxquels on ajoute une fenêtre de discussion.
Un domaine ou un écran n'est « terminé » que s'il est utilisable par l'agent comme par l'utilisateur.

Pour chaque domaine et chaque écran, la conception répond aux cinq questions suivantes avant le code :

| Question | Réponse attendue |
|---|---|
| **Capacités** : que sait faire l'agent ici ? | Outils MCP métier, par la façade publique du domaine (lecture d'abord, écriture par l'épopée d'écriture), sous RBAC, périmètre et audit |
| **État** : que voit l'agent de l'écran ? | État partagé AG-UI : filtres, période, sélection, lignes visibles ; jamais plus que les droits de l'utilisateur |
| **Actions de la page** : que peut-il y faire ? | Actions **propres à cette page**, exposées à l'agent comme outils côté navigateur : appliquer un filtre, trier, sélectionner, préremplir un formulaire, exporter ; avec validation de l'utilisateur pour tout effet. **L'agent ne navigue pas entre pages ni entre vues** |
| **Rendu** : comment répond-il ? | Surfaces A2UI composées avec le catalogue du design system, liées aux données de la page, avec repli texte |
| **Mesure** : comment sait-on que ça marche ? | Cas ajoutés au jeu d'évaluation du domaine, critères de sécurité et de fondement, seuils |

Conséquences :

* **Le niveau d'agentification est la page.** Chaque page livre ses propres actions et son état à l'agent. L'agent
  n'est pas un navigateur qui passe d'une page à l'autre (le pilotage des vues est retiré depuis le 2026-10-26) ; la
  navigation reste celle de l'utilisateur et du routeur, avec leurs gardes de droits.
* **Migration du frontend (E3).** On ne migre pas « les formulaires, les validations, les listes, les analyses » écran par
  écran en y ajoutant un assistant à la fin. Chaque écran migré est conçu avec ses cinq réponses : état partagé, actions
  exposées, surface générative, cas d'évaluation. La liste des écrans à migrer est la liste des capacités agentiques à
  livrer, domaine par domaine.
* **Le formulaire n'est pas supprimé** : il reste le chemin déterministe et accessible, et le repli quand l'agent est
  indisponible. L'agent le préremplit sur la page où l'utilisateur se trouve et le soumet à sa validation ; il ne le contourne pas.
* **Écriture.** Une action qui modifie une donnée passe par une approbation humaine explicite et par l'audit
  (épopée E13/E21). Aucune écriture silencieuse.
* **Définition de terminé d'un domaine** : outils MCP + compétence `SKILL.md` + cas d'évaluation + écran avec état et
  actions exposées + documentation du domaine.

Sources : [`agent-ui.md`](agent-ui.md) (AG-UI, A2UI, états, interruptions), [`mcp.md`](mcp.md), [`agents-ia.md`](agents-ia.md),
documentation CopilotKit et AG-UI (état partagé, outils côté client).

## A2UI : la façon de faire l'interface d'une application agentique

A2UI est le **transfert technologique** retenu pour l'interface agentique : l'agent décrit l'interface de façon
déclarative (composants d'un catalogue approuvé, liaison de données, actions), le client la rend avec ses composants
natifs. On l'utilise **à pleine capacité**, pas seulement pour un tableau et un graphique :

| Capacité A2UI | Usage visé dans Staport Intelligence |
|---|---|
| Catalogue de composants approuvés (catalogues personnalisés depuis la v0.9) | Catalogue ERP : les composants du design system, rien d'autre ; chaque composant ajouté au design system est ajouté au catalogue |
| Liaison de données (surfaces, modèle de données) | Les surfaces se lient à l'état de la page et aux résultats d'outils, sans recopier de valeur |
| Actions de l'utilisateur renvoyées à l'agent (identifiants d'action, `actionResponse` en v1.0) | Boutons et champs d'une surface qui déclenchent les actions de la page ou une approbation, avec validation de l'utilisateur |
| Flux incrémental | Rendu progressif des surfaces pendant la réponse |
| Moteurs de rendu (Angular, Lit, Flutter, Markdown ; communautaires) | Moteur Angular aujourd'hui, moteur React à la migration Next.js (E3) |
| A2UI Composer | Conception et test des surfaces avant de les figer au catalogue |

**A2UI ne remplace pas AG-UI, il se superpose à lui.** A2UI est un format de description d'interface ; AG-UI est la
couche de connexion entre l'agent et l'application (événements, état partagé, outils côté client, interruptions). La
documentation d'A2UI classe AG-UI parmi ses transports et précise qu'AG-UI traduit les messages A2UI en événements AG-UI
et assure le transport et la synchronisation d'état ; celle d'AG-UI les place dans des catégories distinctes et dit
qu'il prend en charge A2UI nativement. Retirer AG-UI ne laisserait à A2UI aucun canal, aucune synchronisation d'état
ni aucun outil côté navigateur : le remplacement n'est donc pas retenu. A2A reste le transport des échanges entre agents
(`agent-ui.md`, « Interopérabilité entre agents »). Sources : a2ui.org (accueil, concepts « Transports ») et
docs.ag-ui.com (concepts « Generative UI specs »). Le protocole A2UI est maintenu en v0.9 ; la v1.0 (candidate) est
réévaluée à l'entrée de l'épopée E3.

# 6. Documentation du site à jour à la fin de chaque épopée

Le site de documentation (Docusaurus, dossier `site/`, image `erp-rh-docs`) **reflète toujours l'état réel du produit**.
Une épopée ne passe à « Terminé(e) » que si, dans la dernière PR de l'épopée :

* les pages du site concernées sont créées ou mises à jour (fonctionnement, architecture, exploitation, ce qui a changé) ;
* `npm run build` du dossier `site/` réussit sans lien cassé ;
* la CI publie l'image `erp-rh-docs` (vérifié sur `main`) ;
* le ticket de l'épopée porte, en commentaire, le lien de la page mise à jour.

Cette exigence s'ajoute à la documentation du domaine (`site/docs/domaines/<domaine>/`) : le site de documentation du dépôt est la source.

# 7. Contrôle en revue

Cocher en PR, avec la preuve (lien, commande ou mesure) :

- [ ] Abstraction : second usage ou frontière nommé ; équivalent framework cherché ; aucune règle dupliquée.
- [ ] Framework : besoin en une phrase ; couverture native vérifiée dans la documentation lue ; dépendance justifiée.
- [ ] Outillage : contrôles locaux exécutés ; aucun test relancé « jusqu'à ce qu'il passe » ; mesure plutôt qu'affirmation.
- [ ] Transfert : si une pratique vient d'un autre domaine, source, périmètre, limite et preuve écrits.
- [ ] Agentique : les cinq réponses du § 5 sont données pour la page touchée ; A2UI utilisé selon le tableau du § 5.
- [ ] Fin d'épopée : site de documentation à jour (§ 6).

Toute nouvelle erreur coûteuse sur l'un de ces points s'ajoute à [`lecons.md`](lecons.md).
