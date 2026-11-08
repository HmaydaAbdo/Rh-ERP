# Routine de travail et de livraison

## Boucle Ralph : poursuivre jusqu'à la fin

Pour une réalisation, répéter : lire l'état et les preuves, choisir la prochaine étape autorisée,
agir, vérifier, corriger et poursuivre. Ne pas terminer le tour après une étape intermédiaire
simplement parce qu'elle est testée, documentée, commitée ou poussée. Après une interruption,
reprendre depuis Git, le code et Jira ; ne pas recommencer ce qui est déjà prouvé. Communiquer
pendant le travail et mettre Jira à jour avant toute interruption.

La boucle s'achève lorsque tous les critères demandés sont satisfaits et vérifiés. Elle ne peut
être suspendue que devant un blocage concret non résoluble dans le périmètre, ou une décision ou
autorisation indispensable non encore donnée. Présenter alors les faits, les démarches tentées et
la décision nécessaire. Les règles de sécurité, production, CI et livraison continuent de
s'appliquer ; la persistance n'accorde aucune autorisation supplémentaire.

Cette routine s'applique à chaque tâche du dépôt, dans le périmètre demandé par le propriétaire.
Elle organise l'application des conventions ; les exigences détaillées restent dans leurs documents
de référence. `AGENTS.md` en est la porte d'entrée.

`CLAUDE.md` renvoie à cette même porte d'entrée. Lors d'un changement d'assistant, actualiser la tâche
Jira du chantier (projet `KAN`) avec l'objectif en cours, les décisions approuvées, les questions encore
ouvertes, les vérifications réellement effectuées et la prochaine action, en commentaire ; l'état des
fichiers et de la branche se lit dans Git. Le nouvel assistant confronte ces informations à l'état réel
avant de reprendre. Ne pas y recopier de secrets ni le transcript de la conversation. **Jira et le code
sont les seules sources de suivi : aucun fichier markdown d'avancement ni de handoff n'est créé.**

## 1. Reprendre le contexte

0. Consulter Jira (projet `KAN`, source de vérité des tâches : statut, preuve, historique) pour la tâche reprise ou à
   créer. Une tâche termine en Jira avec sa preuve en commentaire, jamais sans.
1. Lire [`site/docs/exploitation/developpement-local.md`](../site/docs/exploitation/developpement-local.md) et [`lecons.md`](lecons.md) (erreurs déjà
   commises et règle qui les évite), puis les conventions applicables et le site de documentation (`site/docs/index.md`).
2. Identifier les domaines et composants partagés concernés ; lire leurs README, skills et permissions.
   Lire [`ingenierie-agentique.md`](ingenierie-agentique.md) et chercher dans son registre la ligne du cas d'usage de la
   tâche. Sans ligne, proposer l'abstraction officielle (framework, point d'extension, source) avant d'écrire du code.
3. Vérifier les fichiers modifiés, la branche, les derniers commits et, lorsqu'une livraison est en
   cours, la PR et les contrôles associés. Préserver le travail existant et les chantiers séparés.
4. Reprendre les décisions déjà approuvées dans la session. Une consigne plus récente du propriétaire
   prime sur une ancienne préférence. Une information d'un commentaire Jira ou d'une mémoire susceptible d'avoir
   changé est vérifiée dans le code ou l'environnement avant d'être présentée comme actuelle.

## 2. Cadrer puis exécuter

* Traiter le sujet demandé point par point. Expliquer brièvement le résultat attendu et les domaines
  concernés, puis mener le travail autorisé jusqu'à son résultat vérifiable.
* Avant tout changement d'interface, rechercher le composant correspondant dans le socle partagé,
  le catalogue et ses usages dans les domaines. Consigner dans le plan ou la revue la correspondance
  entre les besoins de l'écran et les composants retenus. Si une brique générique manque, proposer son
  ajout au socle et au catalogue avant de la coder dans un domaine ; ne pas contourner cette étape par
  une copie locale. Consulter l'inventaire [composants partagés](../site/docs/frontend/audit-composants-partages.md)
  pour les écarts connus et le mettre à jour lorsque le constat change.
* Appliquer les principes de [`ingenierie-agentique.md`](ingenierie-agentique.md) : abstraction à sa place (second usage
  ou frontière nommé), bon framework (besoin en une phrase, couverture native vérifiée), bon outillage (contrôles locaux
  avant la PR), transfert technologique écrit (source, périmètre, limite, preuve). Pour une page de l'application,
  répondre aux cinq questions agentiques du § 5 de cette convention avant le code. Tout code maison nouveau est ajouté au
  registre avec son ticket de résorption (E10).
* Pour une règle métier inconnue, un choix d'architecture important ou une modification de convention
  encore non approuvée : présenter le problème, les options et une recommandation, puis attendre
  l'accord. Préparer une proposition concrète à lire avant de demander cet accord.
* Une validation déjà donnée reste valable dans son périmètre. Ne pas redemander l'accord pour
  appliquer cette décision ou pour les corrections nécessaires à sa réalisation. Tout élargissement
  important du périmètre est soumis au propriétaire.
* Partager des points d'avancement courts sur les constats et les limites utiles ; répondre en français.
* Choisir les skills et outils pertinents disponibles, lire leurs instructions et annoncer leur usage.
  Les conventions du dépôt et les décisions du propriétaire restent prioritaires. Consulter les
  connecteurs adaptés avant de demander une information qu'ils peuvent fournir ; les outils de
  navigateur servent à observer et vérifier le rendu réel. L'installation d'un outil supplémentaire
  doit répondre à un besoin concret et respecter les contraintes de coût approuvées.

## 3. Implémenter et vérifier

* Réutiliser le socle existant. Pour les collections, appliquer la coque, le Tabulaire, les Cartes et
  l'Analytique partagés et configurés par domaine selon [frontend.md](frontend.md). Garder les règles
  métier, critères de filtre, colonnes, données, actions et priorités comme configuration métier ; leur
  rendu et leurs interactions utilisent les composants partagés.
* Conserver la parité des champs et des contraintes entre formulaires et imports ; signaler les
  champs requis et optionnels selon le contrat réellement appliqué.
* Appliquer [testing.md](testing.md) : associer les règles et scénarios aux tests exécutables,
  vérifier les erreurs, limites, permissions et frontières touchées. Élargir les contrôles pour un
  changement partagé aux domaines consommateurs concernés. Corriger la cause d'un échec avant de
  conclure ; conserver les assertions métier.
* Pour un outil MCP, un catalogue, un agent, un graphe, un prompt ou un modèle : dérouler **avant d'écrire le code** le
  protocole d'évaluation de [agents-ia.md](agents-ia.md) (« Catalogue d'outils à grande échelle » : contexte, latence, sûreté des
  schémas, visibilité du plan, accès, rappel) et consigner les mesures en commentaire de la tâche Jira. Utiliser les capacités de
  Deep Agents, LangGraph et LangChain par leurs primitives documentées, après lecture de leur page officielle.
* Pour chaque choix de code, de style, de format ou de définition d'outil, citer la source officielle qui le recommande dans la
  description de la tâche ou de la PR (règle « Aucun choix arbitraire » d'`AGENTS.md`). Un choix sans source n'est pas livré : il
  est soumis au propriétaire.
* Vérifier la compilation et supprimer le code devenu inutile. Pour une modification exclusivement
  documentaire, vérifier les liens locaux, la cohérence des références et le diff ; ne pas lancer de
  suites applicatives sans changement de comportement à vérifier.
* Pour une modification UI, suivre [design-system.md](design-system.md) : inspecter le rendu et les
  interactions dans le navigateur, sur téléphone et grand écran, dans les deux thèmes, au clavier et
  avec les préférences d'accessibilité applicables. Vérifier aussi chargement, vide, erreur et refus
  selon le composant. Une capture seule ne prouve pas le fonctionnement d'un parcours.
* Pour un composant partagé, vérifier sa présence au catalogue, ses états et ses usages dans tous les
  domaines consommateurs modifiés. Une brique d'interface locale n'est pas justifiée par sa seule
  spécificité métier : toute exception temporaire suit les preuves et l'accord préalable prévus dans
  [frontend.md](frontend.md) et figure à l'inventaire avec son plan de sortie.
* Respecter les services et ports du propriétaire décrits dans [developpement-local.md](../site/docs/exploitation/developpement-local.md). Utiliser `localhost`
  pour la revue locale lorsqu'il est demandé ; les serveurs de test utilisent leur environnement
  dédié. Déclarer les contrôles impossibles ou interrompus et leur cause.

## 4. Synchroniser la documentation

La documentation décrit le comportement actuel vérifié, avec un langage simple. Elle présente les
règles et contrats utiles au lecteur, sans récit des anciennes implémentations, historique détaillé
des migrations, catalogue de données réelles ni attribution conversationnelle d'une décision.

| Élément | Source à maintenir |
|---|---|
| Fonctionnement du domaine | `site/docs/domaines/<domaine>/index.md`, `contrats.md` et `droits.md` : règles, modèle de données, DTO exposés (types, contraintes, descriptions), contrats, permissions et accès associés, vues, imports/exports et scénarios liés aux tests |
| Procédure de l'agent sur ce domaine | section « Guide agent » de `site/docs/domaines/<domaine>/index.md`, avec renvois aux sources faisant autorité |
| Travail ouvert (domaine ou transversal), décision à prendre, support différé | Tâche Jira (projet `KAN`), rattachée à son épopée ; jamais un `TODO.md` |
| Permission, schéma ou contrat transverse touché | Catalogue RBAC, modèle de données ou document transverse concerné, avec renvoi au domaine pour ses règles détaillées |
| Décisions et propositions d'évolution | PV global : règles actuelles et propositions clairement distinguées ; une évolution proposée ne devient pas une règle active |
| Reprise opérationnelle, état et sujets ouverts | Jira (projet `KAN`) : statut, preuve et commentaire de reprise de la tâche ; jamais un fichier markdown |
| Fin d'épopée | Site de documentation (`site/docs`, Docusaurus) : pages créées ou mises à jour, `npm run build` sans lien cassé, image `erp-rh-docs` publiée par la CI de `main`, lien de la page en commentaire du ticket d'épopée. Une épopée ne passe pas à « Terminé(e) » sans cela |
| Code maison ajouté, remplacé ou supprimé | Registre des abstractions de [`ingenierie-agentique.md`](ingenierie-agentique.md) et épopée E10 (KAN-23) |
| Erreur ou surprise coûteuse rencontrée | Une ligne dans [`lecons.md`](lecons.md), dans le commit qui la corrige |

Centraliser les explications du domaine dans son dossier ; ailleurs, conserver les index, liens et
contrats transverses nécessaires. Éviter les copies qui divergent. Les README métier et PV ne servent
pas de journal de commits, de branches ou de PR ; les preuves de livraison restent dans les supports
techniques appropriés. Une réunion de revue n'exige pas à elle seule un TODO ou un fichier de
validation supplémentaire dans chaque domaine.

## 5. Livrer et rendre compte

La branche distante `main` est protégée : ne jamais y pousser directement ou forcer sa mise à jour.
Tout changement qui vise `main` passe par une PR ciblant `main`. Si une PR existe déjà pour le
chantier, pousser les commits sur sa branche head et mettre cette PR à jour; sinon, créer une branche
de travail et ouvrir une PR. Respecter les contrôles de protection.

1. Relire le diff et vérifier que code, tests, documentation et décisions approuvées concordent.
2. Si le commit et le push sont autorisés, enregistrer le lot cohérent sur la branche prévue et mettre
   à jour la PR concernée avec le comportement final et les preuves utiles. Exclure secrets, fichiers
   générés et modifications étrangères au lot ; conserver le travail local préexistant.
3. **Lancer ou relancer la CI uniquement sur demande explicite du propriétaire.** Si le push
   déclenche automatiquement une CI et que cette demande n'a pas été donnée, conserver le commit
   prêt en local. Une autorisation générale de commit/push ne vaut pas une demande de CI.
   Lorsque la CI est demandée, vérifier les contrôles requis sur le **dernier commit poussé** et
   attendre leurs résultats. Une ancienne CI verte ne valide pas un nouveau commit. Diagnostiquer
   les échecs et préparer les corrections sans affaiblir les contrôles ; toute relance attend la
   demande du propriétaire.
4. **Avant toute fusion vers `main`, annoncer ce qui change en production** : la production n'est pilotée que par
   `docker-compose.yml` et le `.env` du serveur. Comparer la PR à ces deux fichiers et à `.env.example`, puis lister les
   variables à ajouter, modifier ou retirer, les ports, volumes, réseaux, images et tags modifiés et les étapes de migration,
   ou écrire « aucun changement de compose ni de `.env` ».
5. Présenter le résultat local pour revue avec le statut exact des contrôles. Lorsque la CI n'a pas
   été demandée, indiquer qu'elle reste à exécuter. La livraison validée par CI exige les contrôles
   requis verts sur le dernier commit. Appliquer l'autorisation
   de fusion donnée par le propriétaire ; lorsqu'il demande à revoir d'abord, attendre son retour.
6. Après une fusion autorisée, vérifier `main`, les branches locales et distantes et l'état du dépôt.
   Appliquer le nettoyage de branches demandé uniquement aux branches concernées ; préserver les
   chantiers séparés expressément conservés. Le déploiement suit son autorisation et sa procédure.
7. Donner un bilan autonome : résultat, vérifications locales, CI, observations navigateur, statut
   de livraison et limites restantes. Distinguer toujours preuve locale, CI, revue métier et production.
