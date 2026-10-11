# Configuration

> Conventions de séparation, de validation et de gestion des paramètres d'une application.

## Choisir la source de configuration

Classer chaque valeur selon son rôle :

| Nature | Source adaptée |
|---|---|
| Paramètre technique stable, versionné avec l'application | Fichier de configuration versionné ou valeur explicite dans le code si elle est réellement immuable |
| Valeur propre à un environnement ou à un déploiement | Configuration fournie par l'environnement d'exécution ou un service de configuration autorisé |
| Secret ou identifiant | Gestionnaire de secrets de la plateforme ; mécanisme d'injection sécurisé si aucun gestionnaire n'est disponible |
| Règle métier | Modèle et logique du domaine propriétaire |
| Paramètre métier ajustable sans nouvelle livraison | Stockage de configuration métier contrôlé par le domaine, si ce besoin est confirmé |

Ne pas utiliser une variable d'environnement, un fichier de configuration ou une constante pour
remplacer la logique métier. La configuration fournit des valeurs ; le domaine décide comment elles
s'appliquent.

## Configuration technique

* Séparer les valeurs communes versionnées des valeurs propres à un environnement. Décrire chaque
  clé externe : nom, type, unité, usage, caractère obligatoire et méthode de fourniture.
* Valider les types, formats, plages et relations entre paramètres au démarrage. Échouer avec un
  message exploitable lorsqu'une configuration obligatoire ou incohérente empêche le service de
  fonctionner ; ne pas démarrer avec une valeur de repli qui modifie silencieusement le comportement.
* Une valeur par défaut est acceptable lorsqu'elle est sûre, explicite et cohérente pour tous les
  environnements concernés. Ne jamais fournir de valeur par défaut à un secret ou à un contrôle de
  sécurité obligatoire.
* Ne pas dupliquer une même valeur dans plusieurs sources. Définir clairement la source faisant
  autorité et la priorité de résolution.
* Utiliser le mécanisme de configuration typé et validé du framework. Dans Spring Boot, préférer des
  propriétés liées à une classe de configuration validée pour un groupe cohérent de paramètres ;
  réserver `@Value` aux cas simples.

## Secrets

* Ne jamais enregistrer un secret dans le dépôt, une image de déploiement, un exemple réutilisable,
  un journal ou un message d'erreur.
* Fournir les secrets par un gestionnaire dédié ou le mécanisme sécurisé de la plateforme. Un fichier
  local non versionné n'est acceptable que pour le développement et doit être exclu de Git.
* Les secrets obligatoires n'ont pas de valeur de repli. Les valider au démarrage et éviter de les
  afficher, même partiellement, dans les logs.
* Limiter leur portée, leur durée de vie et les personnes/services qui peuvent les lire ; prévoir leur
  rotation selon les capacités de la plateforme.

## Règles et paramètres métier

Les règles qui définissent les décisions métier appartiennent au code du domaine. Les valeurs
immuables qui expriment une règle peuvent être des constantes nommées ou des types dédiés ; les
seuils et valeurs modifiables ne doivent pas être dispersés sous forme de nombres ou chaînes
magiques.

Rendre un paramètre administrable sans livraison seulement lorsque le besoin métier l'exige. Le
domaine propriétaire définit alors son type, son unité, ses bornes, sa valeur initiale, sa date
d'entrée en vigueur et son comportement en cas de valeur absente ou invalide. Une interface
d'administration n'est ajoutée que si des personnes autorisées doivent réellement modifier ce
paramètre.

Toute modification dynamique d'un paramètre métier doit respecter les autorisations du domaine,
laisser une trace adaptée, être validée avant activation et préciser quand elle prend effet. Les
secrets et les options techniques d'exploitation ne deviennent pas des paramètres métier simplement
parce qu'ils peuvent être modifiés.

## Évolution et documentation

Lorsqu'une valeur change, modifier sa source faisant autorité et mettre à jour sa description, sa
validation et les exemples concernés. Les changements de configuration qui modifient le
comportement fonctionnel ou la sécurité ont des tests couvrant leurs valeurs valides, invalides et
limites.

Ne remplacer une valeur codée en dur existante que si elle est réellement configurable selon les
règles ci-dessus et si le changement reste dans le périmètre du travail. Ne pas transformer une
constante stable en configuration externe sans besoin identifié.

## Résumé

* La logique et les décisions métier restent dans le domaine propriétaire.
* Les paramètres techniques propres à l'environnement viennent de la configuration du déploiement.
* Les secrets sont injectés de manière sécurisée et n'ont pas de valeur de repli.
* Les paramètres métier sont administrables uniquement lorsqu'un besoin de modification autonome
  est établi.
* Chaque valeur configurable est typée, validée, documentée et possède une source faisant autorité.
