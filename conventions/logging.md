# Logging

> Conventions de journalisation applicables à tout le projet.

## Logger

* Déclarer un logger dans chaque classe qui produit des logs.

```java
private static final Logger log = LoggerFactory.getLogger(Xxx.class);
```

* Nom du logger : `log`.
* Ne pas utiliser Lombok (`@Slf4j`).

---

# Messages

* Toujours utiliser les messages paramétrés.

```java
log.info("Entité créée : id={}", id);
```

Ne jamais concaténer les chaînes.

```java
// ❌
log.info("Entité créée : " + id);
```

---

# Niveaux

## ERROR

Utiliser pour les erreurs non récupérables nécessitant une intervention.

Toujours logger la stacktrace.

---

## WARN

Utiliser pour un comportement anormal mais géré.

Exemples :

* tentative de connexion invalide ;
* violation de règle métier ;
* clé étrangère bloquante.

---

## INFO

Utiliser pour les événements métier importants.

Exemples :

* création ;
* modification ;
* suppression ;
* connexion réussie ;
* lancement ou fin d'un traitement métier.

---

## DEBUG

Utiliser uniquement pour le diagnostic technique.

* Désactivé en production.
* Ne jamais utiliser pour tracer les événements métier.

---

## TRACE

* Réservé au diagnostic très fin.
* Ne jamais utiliser en production.

---

# Exceptions

Logger les exceptions avec leur stacktrace.

```java
log.error("Erreur lors de la création de l'entité", e);
```

Ne jamais écrire :

```java
log.error(e.getMessage());
```

Ne jamais utiliser :

```java
System.out.println(...);
System.err.println(...);
e.printStackTrace();
```

---

# Données sensibles

Ne jamais logger :

* mot de passe ;
* JWT ;
* secret ;
* numéro de compte ;
* montant financier brut ;
* entité complète ;
* DTO complet ;
* **donnée personnelle saisie librement** : nom, identifiant national, adresse e-mail, texte d'une recherche ou d'un
  filtre. Un critère de recherche se journalise par ses identifiants et son nombre de résultats, jamais par le texte
  tapé ; un événement dont l'auteur compte (qui a fait quoi) va dans le **journal d'audit**, pas dans un log.

Logger uniquement des identifiants métier.

Exemples :

* id ;
* username ;
* référence ;
* code.

---

# Emplacement

Les logs métier sont écrits uniquement dans les Services.

Ne jamais logger dans :

* Controller ;
* Repository ;
* Mapper.

---

# MDC

`requestId` et `userId` sont ajoutés automatiquement par `MdcRequestFilter`.

* Ne jamais les renseigner manuellement.
* Tous les logs d'une requête les héritent automatiquement.
* `requestId` est **toujours généré par le serveur** (jamais repris d'un en-tête du client : il relie l'audit aux logs,
  un client ne doit pas pouvoir le choisir) et **renvoyé dans l'en-tête de réponse `X-Request-Id`**, pour qu'un
  utilisateur puisse citer une requête précise. Il est posé le plus tôt possible, avant les contrôles d'accès, pour
  que les refus le portent aussi.
* `userId` n'est connu qu'une fois la requête authentifiée : il est posé dès que l'authentification est faite.
* Le MDC est vidé à la fin de chaque requête (thread réutilisé).
* Un traitement hors requête (tâche planifiée, initialisation) reçoit son propre `requestId` — l'identifiant
  d'exécution du `BatchAuditContext` (`conventions/audit.md`) —, qui relie ses logs, ses révisions d'audit et son entrée
  de journal.

---

# Production

* Les logs passent par un `AsyncAppender`.
* Le format est JSON via `logstash-logback-encoder`.
* Ne jamais écrire directement dans un fichier depuis le code.

---

# Audit

Les logs ne remplacent jamais l'audit.

* Les logs servent au diagnostic.
* L'audit sert à tracer les actions métier (`conventions/audit.md`).

Une opération sensible doit respecter les conventions des deux mécanismes : le log `INFO` d'un événement métier ne
porte que des identifiants et des nombres (jamais ce qui a été saisi) ; l'entrée du journal d'audit porte l'auteur, le
périmètre et le résultat. Un événement de sécurité (connexion, refus, jeton réutilisé) garde son log `INFO` ou `WARN` de
diagnostic **et** son entrée d'audit.

---

# Principes

* Les logs doivent être utiles au diagnostic.
* Chaque événement métier important produit un seul log `INFO`.
* Les erreurs métier récupérées produisent un `WARN`.
* Les erreurs techniques produisent un `ERROR`.
* Les exceptions sont toujours journalisées avec leur stacktrace.
* Les logs ne doivent jamais exposer d'informations sensibles.
* Éviter les logs redondants ou inutiles.
