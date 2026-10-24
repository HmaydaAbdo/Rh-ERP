# Routine de travail et de livraison

Cette routine s'applique à chaque tâche du dépôt, dans le périmètre demandé par le propriétaire.
Elle organise l'application des conventions ; les exigences détaillées restent dans leurs documents
de référence. `AGENTS.md` en est la porte d'entrée.

`CLAUDE.md` renvoie à cette même porte d'entrée. Lors d'un changement d'assistant, actualiser le
handoff technique du chantier avec l'objectif en cours, les décisions approuvées, les questions
encore ouvertes, l'état des fichiers et de la branche, les vérifications réellement effectuées et la
prochaine action. Le nouvel assistant confronte ces informations à l'état réel avant de reprendre.
Ne pas y recopier de secrets ni le transcript de la conversation.

## 1. Reprendre le contexte

1. Lire `docs/handoff/etat-du-projet.md`, puis les conventions applicables et `docs/README.md`.
2. Identifier les domaines et composants partagés concernés ; lire leurs README, skills et permissions.
3. Vérifier les fichiers modifiés, la branche, les derniers commits et, lorsqu'une livraison est en
   cours, la PR et les contrôles associés. Préserver le travail existant et les chantiers séparés.
4. Reprendre les décisions déjà approuvées dans la session. Une consigne plus récente du propriétaire
   prime sur une ancienne préférence. Une information du handoff ou d'une mémoire susceptible d'avoir
   changé est vérifiée dans le code ou l'environnement avant d'être présentée comme actuelle.

## 2. Cadrer puis exécuter

* Traiter le sujet demandé point par point. Expliquer brièvement le résultat attendu et les domaines
  concernés, puis mener le travail autorisé jusqu'à son résultat vérifiable.
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
  métier, filtres, colonnes, actions et priorités propres au domaine.
* Conserver la parité des champs et des contraintes entre formulaires et imports ; signaler les
  champs requis et optionnels selon le contrat réellement appliqué.
* Appliquer [testing.md](testing.md) : associer les règles et scénarios aux tests exécutables,
  vérifier les erreurs, limites, permissions et frontières touchées. Élargir les contrôles pour un
  changement partagé aux domaines consommateurs concernés. Corriger la cause d'un échec avant de
  conclure ; conserver les assertions métier.
* Vérifier la compilation et supprimer le code devenu inutile. Pour une modification exclusivement
  documentaire, vérifier les liens locaux, la cohérence des références et le diff ; ne pas lancer de
  suites applicatives sans changement de comportement à vérifier.
* Pour une modification UI, suivre [design-system.md](design-system.md) : inspecter le rendu et les
  interactions dans le navigateur, sur téléphone et grand écran, dans les deux thèmes, au clavier et
  avec les préférences d'accessibilité applicables. Vérifier aussi chargement, vide, erreur et refus
  selon le composant. Une capture seule ne prouve pas le fonctionnement d'un parcours.
* Respecter les services et ports du propriétaire décrits dans le handoff. Utiliser `localhost`
  pour la revue locale lorsqu'il est demandé ; les serveurs de test utilisent leur environnement
  dédié. Déclarer les contrôles impossibles ou interrompus et leur cause.

## 4. Synchroniser la documentation

La documentation décrit le comportement actuel vérifié, avec un langage simple. Elle présente les
règles et contrats utiles au lecteur, sans récit des anciennes implémentations, historique détaillé
des migrations, catalogue de données réelles ni attribution conversationnelle d'une décision.

| Élément | Source à maintenir |
|---|---|
| Fonctionnement du domaine | `docs/<domaine>/README.md` : règles, modèle de données, DTO exposés (types, contraintes, descriptions), contrats, permissions et accès associés, vues, imports/exports et scénarios liés aux tests |
| Procédure de l'agent sur ce domaine | `docs/<domaine>/skills/SKILL.md`, avec renvois aux sources faisant autorité |
| Travail ouvert propre au domaine | `docs/<domaine>/TODO.md` ; retirer les tâches terminées et supprimer le fichier lorsqu'aucune tâche ne reste |
| Travail transversal, qualité des données ou supports de formation différés | `TODO.md` à la racine ; garder chaque tâche dans une seule liste |
| Permission, schéma ou contrat transverse touché | Catalogue RBAC, modèle de données ou document transverse concerné, avec renvoi au domaine pour ses règles détaillées |
| Décisions et propositions d'évolution | PV global : règles actuelles et propositions clairement distinguées ; une évolution proposée ne devient pas une règle active |
| Reprise opérationnelle | Handoff : état et sujets ouverts, avec renvois vers les sources détaillées |

Centraliser les explications du domaine dans son dossier ; ailleurs, conserver les index, liens et
contrats transverses nécessaires. Éviter les copies qui divergent. Les README métier et PV ne servent
pas de journal de commits, de branches ou de PR ; les preuves de livraison restent dans les supports
techniques appropriés. Une réunion de revue n'exige pas à elle seule un TODO ou un fichier de
validation supplémentaire dans chaque domaine.

## 5. Livrer et rendre compte

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
4. Présenter le résultat local pour revue avec le statut exact des contrôles. Lorsque la CI n'a pas
   été demandée, indiquer qu'elle reste à exécuter. La livraison validée par CI exige les contrôles
   requis verts sur le dernier commit. Appliquer l'autorisation
   de fusion donnée par le propriétaire ; lorsqu'il demande à revoir d'abord, attendre son retour.
5. Après une fusion autorisée, vérifier `main`, les branches locales et distantes et l'état du dépôt.
   Appliquer le nettoyage de branches demandé uniquement aux branches concernées ; préserver les
   chantiers séparés expressément conservés. Le déploiement suit son autorisation et sa procédure.
6. Donner un bilan autonome : résultat, vérifications locales, CI, observations navigateur, statut
   de livraison et limites restantes. Distinguer toujours preuve locale, CI, revue métier et production.
