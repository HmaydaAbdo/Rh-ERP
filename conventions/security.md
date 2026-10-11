# Sécurité

> Socle d'exigences indépendant d'un fournisseur d'identité, d'un protocole de session ou d'un
> framework. Chaque projet documente ses choix d'authentification et leur configuration propre.

## Principes de contrôle d'accès

* Refuser par défaut. Le serveur authentifie l'identité et décide de chaque accès à une ressource ou
  à une action ; masquer un élément d'interface n'est jamais un contrôle de sécurité.
* Accorder le moindre privilège. Vérifier les autorisations à chaque requête et à chaque opération
  sensible, y compris lorsque l'appel vient d'un autre service ou d'un traitement asynchrone.
* Distinguer l'authentification (qui appelle ?) de l'autorisation (que peut faire cet appelant ?).
  Ne pas déduire les droits du fait qu'un identifiant, un rôle ou un enregistrement a été fourni.
* Vérifier aussi le périmètre de la ressource : propriété, organisation, tenant ou autre frontière
  métier applicable. Une permission d'action n'autorise pas automatiquement l'accès à toutes les
  données de ce type.
* Séparer l'identité de connexion d'une entité métier. Les relier explicitement lorsqu'un besoin le
  justifie, sans les confondre par défaut.

## Autorisation par permissions et rôles

Le contrôle d'accès commun est centré sur les **permissions** :

* Une permission identifie une action autorisée sur une ressource ou un domaine. Son catalogue est
  explicite, documenté, versionné et maintenu avec le domaine propriétaire ; une interface de gestion
  des rôles ne crée pas de nouveaux codes d'autorisation arbitraires. Si le catalogue est stocké en
  base, ses évolutions sont versionnées avec les migrations.
* Un rôle regroupe des permissions et peut être attribué à un ou plusieurs comptes. Les opérations
  métier vérifient la permission requise, jamais le nom d'un rôle. Les rôles servent à composer et à
  administrer les autorisations, pas à remplacer le contrôle par permission.
* Définir les permissions distinctes nécessaires aux actions sensibles, dont la suppression,
  l'export, l'administration et les opérations en masse lorsqu'elles ont des risques différents.
  Chaque projet documente la matrice action/ressource et les attributions initiales.
* Les permissions sont contrôlées côté serveur sur chaque chemin d'accès. Une même opération ne doit
  pas être accessible par une route, un export, une tâche ou une intégration moins protégés.
* Les rôles et leurs attributions ne peuvent être modifiés que par des identités explicitement
  autorisées à gérer les accès. Une modification de droits est testée et tracée selon la convention
  d'audit.
* Un refus individuel ou une attribution directe à un compte peut être ajouté seulement si le besoin
  le justifie. Dans ce cas, définir l'ordre de priorité, les limites d'administration et les tests ;
  les contrôles ordinaires restent fondés sur les permissions.

Le frontend peut masquer les actions auxquelles le compte n'a pas droit pour améliorer l'expérience.
Le serveur reste l'autorité ; les guards, boutons et menus ne remplacent jamais ses vérifications.
Les agents, skills, prompts et descriptions d'outils ne confèrent aucun droit : chaque appel outil
réévalue l'identité et les permissions côté serveur.

## Authentification et sessions

Le projet choisit et documente son mécanisme d'authentification : fournisseur d'identité fédéré,
session gérée par le serveur, jetons ou autre mécanisme adapté à ses clients et à ses risques. Préférer
des protocoles et bibliothèques maintenus aux mécanismes cryptographiques faits maison. Documenter
les flux de connexion, renouvellement, déconnexion, récupération de compte, révocation et les
compromis de durée de session.

* Protéger les identifiants de session contre la prédiction, la fixation, le vol et la réutilisation.
  Imposer une expiration vérifiée côté serveur et invalider la session à la déconnexion ainsi que
  lors des changements de compte qui l'exigent.
* Ne pas conserver des secrets de session ou des jetons de longue durée dans un stockage persistant
  accessible au JavaScript du navigateur sans analyse de risque et protections documentées.
* Si le projet utilise des cookies pour authentifier des requêtes, configurer leurs attributs de
  sécurité adaptés et appliquer une défense CSRF aux opérations modifiant l'état. Ne pas désactiver
  globalement cette protection sans analyse documentée du transport et des menaces.
* Si le projet utilise des jetons JWT, vérifier la signature avec un algorithme explicitement permis,
  l'émetteur, le destinataire, l'expiration et les autres claims exigés. Documenter la durée, la
  révocation et le délai de propagation des changements de droits ; une signature valide ne signifie
  pas qu'un jeton est révocable immédiatement.
* Restreindre CORS aux origines nécessaires. Ne jamais associer des credentials à une origine
  générique non fiable.
* Protéger les opérations de connexion, récupération et changement de credential contre les essais
  automatisés et abusifs, avec des limites compatibles avec les utilisateurs légitimes.

## Identifiants et récupération de compte

* Si des mots de passe sont utilisés, ne jamais les stocker en clair ni avec un chiffrement
  réversible. Employer une fonction de hachage adaptative maintenue et configurée selon les
  recommandations actuelles pour la plateforme.
* Ne pas révéler si un compte existe lors de la connexion ou de la récupération d'accès. Éviter les
  différences de message, de code de réponse ou de délai qui faciliteraient l'énumération.
* Un mécanisme de récupération utilise un secret aléatoire, limité dans le temps et à usage unique ;
  ne pas stocker sa valeur brute et ne la transmettre qu'au canal vérifié du propriétaire du compte.
  Limiter les tentatives et invalider les sessions ou credentials concernés selon une politique
  documentée.
* Définir les exigences de longueur et de vérification des secrets selon le risque et les règles
  applicables. Ne pas imposer une composition fixe de caractères sans justification.
* Décider si une authentification multifacteur est requise en fonction de la sensibilité des données,
  des privilèges et des obligations applicables. Les parcours de récupération doivent être au moins
  aussi sûrs que le parcours d'authentification qu'ils remplacent.

## Sécurité des API et des données

* Transporter les credentials dans des mécanismes protégés, jamais dans les URL. Utiliser TLS sur les
  connexions externes et internes lorsque leur risque le requiert.
* Valider côté serveur la syntaxe, les types, les bornes et la cohérence métier des entrées ; les
  validations frontend ne sont qu'une aide à la saisie. Borner la taille des requêtes, listes et
  résultats.
* Utiliser les paramètres liés ou les mécanismes sûrs de requête du framework. Encoder les sorties
  selon leur contexte ; la validation d'entrée seule ne protège pas contre l'injection ou le XSS.
* Traiter les messages, fichiers et résultats d'intégrations externes comme non fiables. Limiter
  leurs tailles, formats, redirections et destinations réseau selon le cas d'usage.
* Les erreurs ne révèlent ni secrets, ni données personnelles, ni détails internes exploitables.
  Exclure credentials, jetons et corps sensibles des journaux ; journaliser les événements utiles
  sans recopier les valeurs confidentielles.
* Auditer les événements d'authentification, de refus et de modification des droits selon
  `conventions/audit.md`. Les logs techniques ne remplacent pas l'audit.
* Les en-têtes d'identité ou d'adresse transmis par un proxy ne sont fiables que si la requête vient
  d'un proxy explicitement approuvé et configuré.

## Documentation et tests

Chaque projet documente dans sa documentation d'authentification et d'autorisations le fournisseur
ou mécanisme retenu, les sessions ou jetons, les procédures de récupération, les permissions, les
règles de portée et les chemins publics. Les choix qui modifient les frontières de confiance ou les
risques majeurs font l'objet d'un ADR.

Les tests de sécurité couvrent au minimum :

* requête anonyme, identité valide sans permission et identité avec permission ;
* tentative d'accès à une ressource hors du périmètre autorisé ;
* permission distincte pour une action sensible, notamment suppression ou export ;
* expiration, déconnexion et révocation prévues par le mécanisme choisi ;
* récupération invalide, expirée ou réutilisée et absence de révélation d'existence d'un compte ;
* mêmes refus effectifs dans les appels directs, interfaces et intégrations.

Les identités, données et secrets utilisés dans les tests sont synthétiques.

## Références

* [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
* [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
* [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
* [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
* [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
* [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
