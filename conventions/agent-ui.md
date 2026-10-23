# Interfaces agentiques (AG-UI et extensions de rendu)

Cette convention définit une architecture réutilisable pour les interfaces pilotées par des agents,
qu'elles soient ajoutées à une application existante ou conçues pour une nouvelle application. Elle
décrit les contrats et les responsabilités, pas une dépendance obligatoire à un framework client ou
serveur. Chaque application documente ses versions, son catalogue de composants, ses adaptateurs et
ses parcours dans `docs/`.

Pour ERP-RH, l'orientation demandée est Angular → AG-UI → CopilotKit Runtime/LangGraph.js en
TypeScript, avec les capacités métier MCP côté Spring. Le cadrage est dans
[`docs/ia/README.md`](../docs/ia/README.md) et l'[ADR 0013](../docs/adr/0013-integration-ia-mcp-langgraph-rag.md).
Le premier parcours proposé vise des messages, citations, états et cartes typées rendus avec les
composants Staport existants. Le séquencement d'A2UI, d'une mascotte Rive ou d'une vue immersive
reste à valider dans D8 de l'ADR 0013 ; ce cadrage ne constate pas leur abandon ni leur réalisation.

## Objectifs et frontières

Les protocoles sont complémentaires :

* **AG-UI** porte les interactions et événements entre le client et l'agent : cycle d'exécution,
  messages, appels d'outils, état, progression et interruptions. Il définit un modèle d'événements
  et de transports ; SSE est un transport possible, pas le protocole complet.
* **A2UI**, s'il est adopté, décrit des surfaces et composants déclaratifs que le client sait rendre.
  Il transporte la structure et les données de l'interface, pas l'identité, les permissions ou les
  règles métier.
* **Le catalogue du client** associe les cartes typées, ou les types A2UI autorisés si retenus, aux
  composants natifs du design system.
  Le client garde la maîtrise du rendu, de la navigation, des actions et de l'accessibilité.
* **La mascotte facultative** consomme un contrat de comportement logique distinct. Le protocole ne commande pas
  directement Rive, ne transporte pas d'animation et ne modifie pas la structure A2UI.

Flux de confiance :

```text
Utilisateur
  ├─ texte, clic, clavier, interruption ────────────────┐
  ▼                                                     │
Client : adaptateur AG-UI ⇄ catalogue + design system │
  ▲                    ▲                  ▲             │
  │ événements         │ surfaces/données │ état logique│
  └────────────────────┴──────────────────┴─────────────┘
                       Agent serveur
                 validation et cas d'usage
                       │
                       LLM
          propose contenu et description structurée
```

Le LLM s'arrête à une proposition structurée non fiable. Le serveur valide le contrat, la surface,
les composants, les données, les actions autorisées et les limites avant émission. L'agent ne choisit
pas un composant arbitraire, ne produit pas de code à exécuter et ne confère aucun droit. Toute action
est reprise par un cas d'usage du domaine qui authentifie l'appel et revérifie les permissions côté
serveur.

## Contrats et transport

1. Vérifier les spécifications et implémentations officielles à l'adoption. Utiliser une version
   stable compatible, enregistrer ses versions exactes dans les manifests et la documentation de
   l'application, et ne pas prendre une spécification candidate ou un SDK expérimental comme contrat
   de production sans ADR accepté.
2. Suivre les schémas officiels AG-UI et, s'il est retenu, A2UI pour les messages de protocole. Ne pas
   créer une enveloppe propriétaire qui les remplace. Les extensions d'application sont nommées, versionnées,
   documentées et testées indépendamment.
3. Utiliser `threadId` et `runId` du cycle AG-UI pour corréler l'interaction. Les événements sont
   appliqués dans l'ordre d'arrivée du transport. Une extension peut ajouter un identifiant de
   séquence monotone si le client doit ignorer les événements périmés ou détecter une lacune.
4. Lorsque A2UI est retenu, il reste un flux de messages de surface : création, mise à jour des
   composants/données, interactions et suppression, selon la version retenue. Chaque surface a un identifiant opaque,
   une durée de vie et un catalogue déclaré. Les interactions du renderer sont renvoyées à l'agent
   par le canal d'entrée AG-UI avec un nom d'action et un contexte minimal.
5. SSE ne transporte que du serveur vers le client. Pour envoyer les messages utilisateur,
   interactions ou annulations, utiliser le mécanisme d'entrée AG-UI du runtime (par exemple une
   requête HTTP distincte) ou un transport bidirectionnel pris en charge. Ne pas présenter un flux
   SSE isolé comme une connexion bidirectionnelle.
6. Les événements personnalisés AG-UI sont namespacés, versionnés et validés par schéma. Le client
   ignore proprement une extension inconnue sans perdre le traitement des événements standards.
7. Ne jamais exposer au navigateur les prompts système, secrets, raisonnements internes ou données
   qui ne sont pas destinées à l'utilisateur. Masquer les données personnelles dans les traces.

AG-UI et A2UI ne sont pas interchangeables. AG-UI peut porter du texte, des états et des cartes
client prédéfinies sans renderer A2UI. Les mises à jour d'état provenant du serveur restent des
données non fiables pour toute action ; aucun patch d'état ne modifie les droits de l'utilisateur.

Le flux affiche des étapes publiques utiles (« Recherche des sources », « Lecture terminée »),
des résultats et des demandes de confirmation. Il ne publie pas de chaîne de pensée, de prompts
internes ni d'exceptions Java brutes. Les erreurs présentées indiquent une correction possible sans
révéler de contenu sensible.

Pour ERP-RH, confirmer par un prototype l'intégration du client AG-UI Angular et de CopilotKit
Runtime avec les versions réelles de l'application. L'existence d'un runtime serveur ne prouve pas
la disponibilité d'un composant Angular compatible. Ne pas ajouter React ou PrimeNG par défaut,
ni remplacer le design system Staport pour suivre un exemple externe.

Le transport d'événements interactifs utilise SSE ou un transport bidirectionnel justifié, sans
polling périodique de progression. Tester la désactivation du buffering proxy, les délais de
connexion et l'arrêt du producteur lorsqu'un client lent ou déconnecté ne peut plus recevoir.
Keep-alive et HTTP/2 sont vérifiés sur le chemin de déploiement réel, pas promis par le seul SDK.
Une reconnexion ou lecture ponctuelle d'un snapshot ne doit ni relancer une commande métier ni
laisser croire que des événements perdus ont été rejoués si le serveur ne le garantit pas.

## Catalogue borné et composants du design system

Toute proposition d'interface passe par un catalogue versionné côté client, qu'elle utilise des
cartes typées ou A2UI. Le pilote proposé ERP-RH réutilise les composants Staport et les vues métier accessibles
existantes ; une action peut renvoyer vers une route connue avec des paramètres validés. Aucun
modèle ne compose un template Angular, une expression ou un composant arbitraire à l'exécution.

Les règles suivantes s'appliquent au catalogue ; les contraintes propres à A2UI s'ajoutent seulement
si son adoption est validée.

Le serveur et le client valident chaque carte et chaque message A2UI éventuel contre la version de
schéma et le catalogue de composants autorisés pour l'application. Le catalogue est défini et
versionné côté client ; l'agent ne peut ni y ajouter un type, ni charger à distance du code ou une
définition exécutable.

* Le renderer traduit un sous-ensemble explicite de cartes ou composants A2UI en composants du
  design system.
  Il conserve les thèmes, tokens, densité, responsive, clavier, focus, lecteurs d'écran et état de
  chargement définis par l'application.
* Refuser ou dégrader de façon sûre un composant, binding, fonction, champ ou action inconnu. Ne pas
  interpréter HTML, JavaScript, CSS arbitraire, URL active, expression, template ou code généré.
* Borner le nombre de surfaces, composants, profondeur/références, taille des messages, valeurs,
  fréquence de mises à jour et durée de vie. Vérifier les références circulaires, identifiants
  dupliqués, chemins de données et actions.
* Séparer structure et données. N'envoyer au client que les données nécessaires à la surface et
  autorisées pour l'utilisateur. Un binding A2UI ou un champ masqué ne constitue pas une frontière
  d'autorisation.
* Une action rendue par A2UI n'est qu'une intention utilisateur. Le serveur vérifie de nouveau
  identité, permission, périmètre, validation métier et risque ; une confirmation humaine est exigée
  pour les actions sensibles selon `security.md` et `mcp.md`.
* Utiliser les mêmes composants accessibles que l'interface ordinaire. Toute surface est utilisable
  sans mascotte, animation ou voix.

## État de la mascotte

Les événements de mascotte expriment un état logique et borné, indépendant du moteur d'animation. Ils
sont corrélés au même `threadId`/`runId` que les événements d'agent. Une référence facultative à
`surfaceId` et `componentId` permet une réaction liée à un composant A2UI précis. Les émotions
décrivent l'état explicite de l'agent (écoute, réflexion, succès, erreur) ; elles ne sont pas une
inférence de l'émotion, de la personnalité ou de l'état de santé de l'utilisateur.

Exemple d'extension AG-UI, à transporter dans l'événement personnalisé de la version AG-UI adoptée :

```json
{
  "type": "CUSTOM",
  "name": "com.staport.mascot.state.v1",
  "metadata": {
    "com_staport": {
      "threadId": "thread-opaque",
      "runId": "run-opaque"
    }
  },
  "value": {
    "sequence": 12,
    "mood": "attentive",
    "action": "point_right",
    "target": {
      "surfaceId": "assistant-panel",
      "componentId": "payroll-summary"
    },
    "expiresInMs": 1800
  }
}
```

`mood`, `action` et les cibles sont des enums/identifiants vérifiés contre un contrat documenté par
l'application. Les valeurs inconnues retombent sur `neutral`/`idle`. L'événement ne porte pas le nom
d'une machine Rive, d'un fichier `.riv`, d'un timeline ou d'une entrée runtime. Il ne transporte pas
de script, d'URL d'asset, de voix ni de phonèmes.

### Option visuelle Rive

Le contrat reste interchangeable. Si une mascotte est retenue, Rive et ses State Machines peuvent
être évalués : un adaptateur local mappe les enums logiques aux entrées nommées et validées du
fichier Rive. La valeur d'usage, l'accessibilité, le poids et la maintenance sont évalués avant
adoption ; le runtime peut être remplacé sans changer le contrat agent.

Les assets `.riv` et la correspondance avec les State Machines sont contrôlés/versionnés avec
l'application. Charger uniquement des assets approuvés. Prévoir un état statique de repli si le
runtime ou l'asset échoue, respecter `prefers-reduced-motion`, suspendre l'animation hors écran et
laisser l'utilisateur masquer la mascotte. Les animations ne doivent ni bloquer une action métier,
ni transmettre seules une information indispensable.

La voix et le TTS sont hors du premier périmètre : l'interaction initiale est visuelle, avec texte et
sous-titres. Toute future sortie vocale sera pilotée par le client, révocable immédiatement, réglable
par l'utilisateur et accompagnée d'une transcription. Les paramètres vocaux ne sont pas ajoutés au
contrat de mascotte avant décision et revue spécifiques.

## UX de référence et interruption

L'expérience proposée pour ERP-RH est un accès discret à un panneau contextuel latéral, adapté au
téléphone et sans masquer une action métier en cours. La maquette, les règles de focus et le
parcours sont validés avant réalisation. Les citations et les liens permettent de revenir aux
sources autorisées. Une mascotte ou une surface A2UI peut compléter ce parcours si son adoption est
validée. Une vue immersive nécessite un besoin distinct ; elle n'est pas créée par anticipation.

À la réception d'une interruption (bouton arrêter, nouvelle demande ou fermeture explicite) :

1. Le client arrête immédiatement l'animation active, annule toute sortie vocale locale si elle est
   activée ultérieurement, et marque le run comme interrompu visuellement sans attendre le réseau.
2. Le client envoie l'interruption avec le `runId` concerné au mécanisme d'entrée/annulation AG-UI.
   Le serveur annule le travail et les appels annulables du graphe ; une opération déjà validée ou
   irréversible suit la règle de son domaine et ne prétend pas avoir été annulée.
3. Le client ignore les événements tardifs du run interrompu et accepte le nouveau run seulement
   avec son nouvel identifiant.
4. Le serveur conserve un état final vérifiable (`interrupted`, `completed`, `failed`) et ne déclenche
   pas une action métier à partir d'une simple interruption UI.

La promesse n'est pas une latence réseau nulle : le client réagit localement immédiatement, puis
synchronise l'annulation distante au mieux. Les états du panneau, de la mascotte et des surfaces sont
reconstruisibles à partir d'un snapshot puis de deltas, sans dépendre d'un seul delta manqué.

## Nouveau projet

1. Définir le cas d'usage, les données autorisées, les rôles, les actions sensibles et les critères
   d'évaluation dans la documentation projet et RBAC.
2. Sélectionner les versions AG-UI supportées et, si retenu, A2UI ; inscrire versions, schémas et
   transports exacts dans les manifests et un ADR. Confirmer les implémentations clientes/serveur compatibles
   avec la pile avant de choisir un SDK.
3. Définir le catalogue de cartes ou A2UI depuis le design system, ses bindings/actions permis, ses
   limites et les comportements de repli.
4. Implémenter l'adaptateur AG-UI côté client et côté serveur autour des cas d'usage du domaine ;
   les appels d'outils conservent identité, autorisations et audit conformément à `mcp.md`.
5. Ajouter seulement les extensions validées : renderer A2UI ou adaptateur de mascotte logique.
   Le runtime d'animation n'est jamais connu du LLM.
6. Tester contrats, interruptions, erreurs, perte/reconnexion de flux, autorisations, accessibilité,
   performance et repli avant d'élargir le catalogue.

## Application existante

Ne pas réécrire les vues métier pour adopter ces protocoles. Ajouter progressivement :

1. un point d'entrée et panneau assistant intégrés à la coque existante, isolés derrière une
   permission/feature flag ;
2. un adaptateur client qui reçoit AG-UI, affiche messages et progression et route les cartes
   autorisées vers une surface dédiée ;
3. un catalogue initial réduit, mappé aux composants accessibles déjà approuvés ;
4. un endpoint/adapter serveur relié aux cas d'usage existants et aux mêmes contrôles RBAC, audit et
   validation ;
5. les extensions A2UI ou mascotte seulement si elles sont validées, sans modifier la logique métier
   des vues ;
6. un pilote limité à un parcours en lecture seule avant toute action d'écriture, puis une extension
   graduelle selon les résultats d'évaluation.

Un échec du renderer de cartes, d'A2UI ou d'une mascotte conserve une réponse texte lorsque le
transport fonctionne. Si AG-UI ou le runtime est indisponible, afficher un état explicite et un
accès aux parcours métier ordinaires ; ne pas promettre une conversation sans canal disponible.
Les écrans existants continuent de fonctionner sans dépendre du renderer agentique.

## Vérification et exploitation

La convention `testing.md` s'applique. Chaque implémentation ajoute au minimum :

* validation des schémas AG-UI et cartes et, si adoptés, d'A2UI et des extensions mascotte (valides,
  invalides, inconnues et incompatibles) ;
* tests de contrat et compatibilité producteur/renderer ;
* tests d'autorisation serveur pour chaque action et chaque périmètre de données ;
* tests de streaming partiel, ordre, snapshot/delta, reconnexion, événements périmés, annulation,
  erreur et reprise ;
* tests renderer des composants autorisés, composants refusés, limites et fallback ;
* tests clavier, focus, lecteur d'écran, responsive, mouvement réduit et expérience sans mascotte ;
* contrôles de performance (temps premier rendu, débit/taille des événements, mémoire, fréquence de
  rendu et poids réel des assets/runtime) sur les appareils cibles ;
* évaluation déterministe de sécurité/schéma séparée de l'évaluation probabiliste de qualité.

Ne pas journaliser prompts, données personnelles ou contenu sensible de surface par défaut. Journaliser
les identifiants de corrélation, décisions d'accès et résultats nécessaires à l'audit, avec
minimisation et rétention selon `security.md`, `audit.md` et `logging.md`.

## Références officielles

Vérifier ces documents au moment de chaque adoption ou mise à niveau :

* [AG-UI — protocole et frontières avec A2UI](https://docs.ag-ui.com/introduction)
* [CopilotKit — client Angular et runtime](https://docs.copilotkit.ai/angular)
* [A2UI — protocole v1.0, statut Candidate constaté au 2026-10-23](https://github.com/a2ui-project/a2ui/blob/main/specification/v1_0/docs/a2ui_protocol.md)
* [Intégration A2UI avec un agent compatible AG-UI](https://github.com/a2ui-project/a2ui/blob/main/docs/public/guides/a2ui-with-any-agent-framework.md)
* [Rive — runtimes et State Machines](https://rive.app/docs/auth)
* [Rive — accessibilité et mouvement](https://www.rive.app/blog/making-rive-designs-more-visually-accessible)
