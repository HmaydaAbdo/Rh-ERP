# Documentation des API avec OpenAPI

Cette convention s'applique aux API HTTP décrites par OpenAPI, indépendamment du langage et du
framework. Chaque application documente l'outil utilisé pour produire, valider et publier son
contrat.

## Contrat API

* Documenter toute API destinée à des consommateurs humains ou logiciels. La spécification décrit
  le comportement réellement offert et évolue dans le même changement que l'API.
* Maintenir une source de vérité cohérente : annotations, fichier de spécification ou génération à
  partir du code. Éviter de maintenir manuellement plusieurs descriptions concurrentes.
* Organiser les opérations par ressource ou domaine et donner aux opérations un résumé bref. Ajouter
  une description lorsque les règles, effets ou limites ne sont pas évidents.
* Documenter les paramètres, filtres, valeurs par défaut, limites de pagination, formats, contraintes
  et préconditions nécessaires à l'appel. Ne pas répéter dans la description une contrainte déjà
  clairement exprimée par le schéma.
* Décrire les réponses de succès et les erreurs significatives, leur structure, les cas où elles
  surviennent et les éventuels codes de reprise. Ne pas annoncer un statut qu'une opération ne
  renvoie pas.
* Les exemples restent réalistes, synthétiques et synchronisés avec le contrat. Éviter les exemples
  volumineux ou qui contiennent des données de personnes réelles.

## Schémas et données exposées

* Décrire les modèles d'entrée et de sortie exposés par l'API, pas les modèles de stockage internes.
  Une entité persistée n'est pas automatiquement un schéma de contrat.
* Documenter les champs dont le format, la sémantique ou les contraintes peuvent prêter à confusion.
  Ne pas dupliquer mécaniquement les validations si elles sont déjà visibles dans le schéma.
* Ne jamais inclure dans le contrat des propriétés internes, des secrets, des champs non autorisés
  ou des valeurs réelles issues de la production.
* Pour les transferts de fichiers, décrire le type de contenu, les formats acceptés et produits, les
  limites applicables et le comportement d'erreur.

## Sécurité de la documentation

* Décrire le mécanisme de sécurité réellement choisi par l'application et l'appliquer aux opérations
  concernées dans la spécification. Ne pas supposer que toute API utilise un jeton particulier.
* Les descriptions OpenAPI ne remplacent jamais l'authentification, l'autorisation par permission,
  la validation serveur ou le contrôle du périmètre de ressource.
* La documentation interactive et les endpoints de spécification sont désactivés ou protégés dans
  les environnements où leur exposition n'est pas nécessaire. Chaque application documente les
  environnements où ils sont disponibles et leurs contrôles d'accès.
* N'ajouter à la liste des routes publiques que les chemins strictement nécessaires au chargement
  de la spécification ou de l'interface. Leur disponibilité ne rend pas les API décrites publiques.

## Vérification

Toute modification d'une route, d'un paramètre, d'un schéma, d'une réponse ou d'une règle de sécurité
met à jour le contrat dans le même changement. La CI valide la syntaxe OpenAPI et, si un contrat
existant est publié, détecte les changements incompatibles selon la politique de versionnement de
l'application.
