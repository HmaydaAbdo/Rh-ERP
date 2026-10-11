# Journalisation

Cette convention définit les règles communes des journaux techniques. Chaque application documente
son framework, ses bibliothèques, ses champs structurés, sa destination, ses accès, son format et sa
durée de conservation.

## Finalité

Les journaux servent au diagnostic, à la supervision et à l'investigation technique. Ils ne
remplacent ni l'audit métier (`conventions/audit.md`), ni les métriques ou traces distribuées.
Chaque signal a une finalité distincte ; éviter de copier le même événement dans plusieurs couches
sans besoin opérationnel.

Ne journaliser que les informations utiles pour comprendre un problème ou suivre l'état d'un
traitement. Éviter les messages redondants à plusieurs couches et les logs d'activité courante sans
valeur de diagnostic.

## Niveaux

Choisir le niveau selon la gravité et la réponse attendue :

* **ERROR** : échec inattendu qui empêche une opération ou nécessite une intervention. Inclure
  l'exception lorsqu'elle apporte des éléments de diagnostic ; ne pas la journaliser à chaque couche
  où elle remonte.
* **WARN** : anomalie récupérée ou dégradation qui mérite une surveillance, mais n'interrompt pas
  nécessairement le service.
* **INFO** : étapes opérationnelles significatives, démarrages/arrêts ou résultats de traitement
  utiles à l'exploitation. Ne pas transformer chaque action métier en log INFO : les actions dont
  il faut établir l'auteur, la cible et le résultat relèvent de l'audit.
* **DEBUG** : détails temporaires utiles au diagnostic, activés de façon contrôlée et sans contenu
  sensible.
* **TRACE** : détails très fins, généralement désactivés hors investigation ciblée.

Une erreur métier attendue et correctement renvoyée au client n'est pas automatiquement une erreur
technique. Choisir entre absence de log, DEBUG ou WARN selon son utilité pour l'exploitation, et
éviter qu'une même requête invalide génère une alerte ERROR.

## Messages et exceptions

* Préférer des événements structurés avec un nom stable et des champs typés. À défaut, écrire des
  messages concis, explicites et paramétrés ; ne pas construire les messages par concaténation.
* Fournir le contexte utile : type d'opération, identifiant de corrélation, résultat ou code d'erreur.
  Ne pas dépendre uniquement du texte de l'exception pour retrouver la cause.
* Conserver la stacktrace lorsqu'elle est nécessaire pour diagnostiquer un défaut inattendu. Ne pas
  journaliser seulement le message d'une exception si cela fait perdre la cause et la pile ; ne pas
  exposer l'exception brute dans une réponse publique.
* Utiliser le mécanisme de journalisation de la plateforme ; ne pas écrire sur la sortie standard au
  moyen d'instructions ad hoc ni appeler directement une méthode d'impression de stacktrace.

## Contexte et corrélation

Les traitements distribués doivent pouvoir être reliés à une requête, un job ou une exécution sans
confondre les identifiants entre opérations. Le contexte peut inclure un identifiant de corrélation,
un service, un environnement et, si nécessaire et autorisé, un identifiant d'acteur pseudonymisé.

* Générer ou valider les identifiants de corrélation à une frontière de confiance. Ne pas accepter
  aveuglément une valeur fournie par un client ; limiter sa longueur et neutraliser les caractères
  de contrôle.
* Propager le contexte à travers les appels asynchrones et interservices selon les capacités de la
  plateforme, sans le partager entre requêtes concurrentes.
* Nettoyer le contexte à la fin du traitement afin qu'un worker réutilisé ne réattribue pas les
  champs de la requête précédente.
* Les traitements planifiés ou déclenchés par un système portent un identifiant d'exécution et une
  origine explicite, sans leur attribuer artificiellement un utilisateur humain.

## Confidentialité et sécurité

Ne jamais journaliser mots de passe, jetons, clés, secrets, cookies d'authentification ou données
d'authentification brutes. Ne pas journaliser de corps de requête/réponse, d'objet métier complet ou
de texte libre saisi par un utilisateur par défaut. Les identifiants personnels, coordonnées,
contenus RH/financiers, données de paiement et autres données confidentielles ne sont ajoutés qu'en
cas de nécessité documentée, avec minimisation, masquage ou pseudonymisation adaptée.

* Échapper ou neutraliser les caractères de contrôle et les sauts de ligne provenant de sources non
  fiables afin d'éviter l'injection dans les journaux.
* Les erreurs destinées aux utilisateurs ne révèlent pas de chemins internes, requêtes, secrets ou
  détails d'implémentation.
* Limiter qui peut consulter, exporter ou configurer les journaux. Protéger leur transmission et
  stockage, définir une rétention et une purge conformes aux obligations applicables.
* Documenter les champs sensibles exclus, les règles de masquage et la procédure d'accès aux traces
  nécessaires à une investigation.

## Emplacement et exploitation

Placer les événements au niveau qui connaît le résultat utile, généralement la frontière d'un
traitement ou le composant qui gère une défaillance. Éviter les logs de chaque couche pour une même
opération. Les adaptateurs peuvent journaliser une erreur de communication lorsqu'ils ajoutent un
contexte absent de l'appelant, mais ne doivent pas provoquer de doublon.

Fournir les deux usages opérationnels : lecture en temps réel par le flux de logs de la plateforme
et conservation dans des fichiers journaliers. La rotation des fichiers est quotidienne ; ne
conserver que les 30 derniers jours et purger automatiquement les fichiers plus anciens. Utiliser
une convention de nommage stable et préciser le fuseau utilisé pour découper les journées (UTC par
défaut).

Préférer un format structuré facile à filtrer. Le format exact, l'asynchronisme, l'agrégation, les
alertes, les limites de volume et les détails de collecte sont documentés par application et
environnement. Dans un déploiement conteneurisé, le répertoire des fichiers journaliers est monté
sur un stockage persistant adapté ; ne pas compter sur le système de fichiers éphémère du conteneur.

## Vérification

Vérifier que les journaux :

* contiennent les champs de corrélation nécessaires et qu'ils restent isolés entre traitements ;
* ne contiennent pas de secrets ou de données sensibles non autorisées, y compris dans les erreurs ;
* n'enregistrent pas deux fois la même défaillance sans valeur supplémentaire ;
* permettent de distinguer les erreurs techniques des refus et erreurs métier attendus ;
* respectent les contrôles d'accès, la rétention et la purge documentés.
