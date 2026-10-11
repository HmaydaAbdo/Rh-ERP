# ADR 0002 — Interfaces agentiques avec AG-UI, A2UI et mascotte Rive

- **Statut :** accepté
- **Date :** 2026-10-11
- **Décideur :** propriétaire du projet
- **Périmètre :** convention réutilisable ; première application de référence : ERP-RH

## Contexte

Les applications doivent pouvoir ajouter des interactions agentiques aux projets existants et aux
nouveaux projets, sans laisser un modèle génératif produire du code d'interface exécutable ni
remplacer les contrôles métier existants. L'expérience cible comprend des composants générés,
streamés et natifs au design system, ainsi qu'une mascotte animée corrélée à l'état de l'agent.

## Décision

1. Utiliser **AG-UI** comme contrat d'événements d'interaction agent-client et **A2UI** comme contrat
   déclaratif de surfaces et composants. Vérifier les versions officielles à l'adoption, utiliser
   une version stable prise en charge, verrouiller les versions précises par application et ne pas
   mettre une spécification candidate en production sans ADR.
2. L'agent produit uniquement du contenu et des messages structurés non fiables. Le serveur valide
   les messages et rattache chaque action à un cas d'usage autorisé. Le client valide aussi le schéma
   et ne rend que son catalogue de composants approuvés. Les protocoles ne confèrent aucune
   permission et n'exécutent jamais de code généré.
3. Le contrat de mascotte transmet des états abstraits (`mood`, `action`, cible de surface/composant)
   corrélés au même `threadId`/`runId`. Il ne nomme ni Rive ni les détails d'animation. **Rive et ses
   State Machines sont le runtime visuel de référence ERP-RH**, derrière un adaptateur client qui
   mappe les enums logiques aux entrées contrôlées de l'asset.
4. Le premier périmètre est visuel, avec texte et sous-titres. La voix/TTS est reportée à l'étape
   ultérieure de l'IA globale d'entreprise et nécessite une décision dédiée.
5. Pour ERP-RH, l'accès à l'assistant ouvre un **panneau contextuel latéral** avec mascotte dans
   l'en-tête et surfaces A2UI dans le panneau. Sur mobile, il devient un écran plein. Une vue
   immersive dédiée est disponible à la demande pour les tâches complexes. Cette couche est
   ajoutée progressivement sans réécrire les vues métier existantes.
6. Une interruption arrête immédiatement animation et éventuelle sortie vocale dans le client,
   puis transmet l'annulation avec le `runId` au serveur. Les événements tardifs d'un run annulé
   sont ignorés. Une action métier déjà validée suit sa propre règle d'annulation ; l'interface ne
   promet pas une latence réseau nulle.

## Conséquences

- Les applications peuvent changer de framework UI ou de moteur d'animation sans modifier le
  contrat logique agent/mascotte.
- Chaque application doit construire et versionner son adaptateur, son catalogue A2UI, ses schémas,
  ses limites et ses cas de test.
- Les actions, données et outils continuent de passer par les règles d'identité, permission,
  validation, audit et minimisation de données de l'application propriétaire.
- La mascotte reste facultative, accessible sans mouvement, masquable et remplaçable par un état
  statique ; toutes les informations utiles restent disponibles en texte.
- Le poids runtime/asset Rive et les performances doivent être mesurés dans l'application ; aucun
  gain de taille n'est présumé sans mesure.

## Suivi

La convention normative est [`conventions/agent-ui.md`](../../conventions/agent-ui.md). Le premier
pilote applicatif sera choisi et décrit dans sa documentation de projet avant implémentation.
